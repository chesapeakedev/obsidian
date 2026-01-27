import { pluralize } from "jsr:@wei/pluralize@8.0.2";

import normalizeResult from "../normalizeResult.ts";
import destructureQueries from "../destructure.ts";

class Node {
  key: string;
  value: unknown;
  next: Node | null;
  prev: Node | null;

  constructor(key: string, value: unknown) {
    this.key = key;
    this.value = value;
    this.next = this.prev = null;
  }
}

export default class LRUCache {
  capacity: number;
  currentSize: number;
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
  nodeHash: Map<string, Node>;
  head: Node;
  tail: Node;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.currentSize = 0;
    this.ROOT_QUERY = {};
    this.ROOT_MUTATION = {};
    // node hash for cache lookup and storage
    this.nodeHash = new Map();

    // doubly-linked list to keep track of recency and handle eviction
    this.head = new Node("head", null);
    this.tail = new Node("tail", null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  removeNode(node: Node): void {
    const prev = node.prev!;
    const next = node.next!;
    prev.next = next;
    next.prev = prev;
  }

  addNode(node: Node): void {
    const tempTail = this.tail.prev!;
    tempTail.next = node;

    this.tail.prev = node;
    node.next = this.tail;
    node.prev = tempTail;
  }

  get(key: string): unknown {
    const node = this.nodeHash.get(key);

    // check if node does not exist in nodeHash obj
    if (!node) return null;

    this.removeNode(node);
    this.addNode(node);
    return node.value;
  }

  put(key: string, value: unknown): void {
    // remove node from old position
    const node = this.nodeHash.get(key);
    if (node) this.removeNode(node);

    // create new node and add to tail
    const newNode = new Node(key, value);
    this.addNode(newNode);
    this.nodeHash.set(key, newNode);

    // check capacity - if over capacity, remove and reassign head node
    if (this.nodeHash.size > this.capacity) {
      const tempHead = this.head.next!;
      this.removeNode(tempHead);
      this.nodeHash.delete(tempHead.key);
    }
  }

  // read from the cache and generate a response object to be populated with values from cache
  async read(queryStr: string): Promise<unknown> {
    if (typeof queryStr !== "string") {
      throw TypeError("input should be a string");
    }
    // destructure the query string into an object
    const queries = destructureQueries(queryStr).queries;
    // breaks out of function if queryStr is a mutation
    if (!queries) return undefined;
    const responseObject: Record<string, unknown> = {};
    // iterate through each query in the input queries object
    for (const query in queries) {
      // get the entire str query from the name input query and arguments
      const queryHash = queries[query].name.concat(queries[query].arguments);
      const rootQuery = this.ROOT_QUERY;
      // match in ROOT_QUERY
      if (rootQuery[queryHash]) {
        // get the hashs to populate from the existent query in the cache
        const arrayHashes = rootQuery[queryHash];
        // Determines responseObject property labels - use alias if applicable, otherwise use name
        const respObjProp = queries[query].alias ?? queries[query].name;
        // invoke populateAllHashes and add data objects to the response object for each input query
        responseObject[respObjProp] = await this.populateAllHashes(
          arrayHashes,
          queries[query].fields,
        );

        if (!responseObject[respObjProp]) return undefined;

        // no match with ROOT_QUERY return null or ...
      } else {
        return null;
      }
    }
    return { data: responseObject };
  }

  async write(
    queryStr: string,
    respObj: unknown,
    searchTerms?: string[],
    deleteFlag?: boolean,
  ): Promise<void> {
    if (typeof respObj !== "object" || respObj === null) {
      return;
    }
    const respObjRecord = respObj as Record<string, unknown>;
    if (!respObjRecord.data || typeof respObjRecord.data !== "object") {
      return;
    }
    const dataRecord = respObjRecord.data as Record<string, unknown>;
    let nullFlag = false;
    let deleteMutation = "";
    for (const query in dataRecord) {
      if (dataRecord[query] === null) nullFlag = true;
      else if (query.toLowerCase().includes("delete")) {
        deleteMutation = labelId(dataRecord[query]);
      }
    }
    if (!nullFlag) {
      const queryObj = destructureQueries(queryStr);
      const resFromNormalize = normalizeResult(
        queryObj,
        respObjRecord,
        deleteFlag,
      );
      // update the original cache with same reference
      for (const hash in resFromNormalize) {
        const resp = await this.get(hash);
        if (hash === "ROOT_QUERY" || hash === "ROOT_MUTATION") {
          if (deleteMutation === "") {
            this[hash as "ROOT_QUERY" | "ROOT_MUTATION"] = Object.assign(
              this[hash as "ROOT_QUERY" | "ROOT_MUTATION"],
              resFromNormalize[hash],
            );
          } else {
            const typeName = deleteMutation.slice(
              0,
              deleteMutation.indexOf("~"),
            );
            for (const key in this.ROOT_QUERY) {
              if (
                key.includes(typeName + "s") ||
                key.includes(pluralize(typeName))
              ) {
                const rootQueryValue = this.ROOT_QUERY[key];
                if (Array.isArray(rootQueryValue)) {
                  for (let i = 0; i < rootQueryValue.length; i++) {
                    if (rootQueryValue[i] === deleteMutation) {
                      rootQueryValue.splice(i, 1);
                      i--;
                    }
                  }
                }
              }
            }
          }
        } else if (resFromNormalize[hash] === "DELETED") {
          // Should we delete directly or do we still need to flag as DELETED
          await this.put(hash, "DELETED");
        } else if (resp) {
          const newObj = Object.assign(resp, resFromNormalize[hash]);
          await this.put(hash, newObj);
        } else {
          const typeName = hash.slice(0, hash.indexOf("~"));
          await this.put(hash, resFromNormalize[hash]);
          for (const key in this.ROOT_QUERY) {
            if (
              key.includes(typeName + "s") || key.includes(pluralize(typeName))
            ) {
              const rootQueryValue = this.ROOT_QUERY[key];
              if (Array.isArray(rootQueryValue)) {
                rootQueryValue.push(hash);
              }
            }
          }
          /****
           * if search terms were provided in the wrapper and the query is an
           * "all"-type query, build out queries in ROOT_QUERY that match the
           * search terms for each item retrieved from the "all"-type query so
           * that future single queries can be looked up directly from the cache
           ****/
          if (searchTerms && queryStr.slice(8, 11) === "all") {
            const hashValue = resFromNormalize[hash];
            if (typeof hashValue === "object" && hashValue !== null) {
              const hashValueRecord = hashValue as Record<string, unknown>;
              searchTerms.forEach((el) => {
                const elValRaw = hashValueRecord[el];
                if (typeof elValRaw === "string") {
                  const elVal = elValRaw.replaceAll(" ", "");
                  const hashKey = `one${typeName}(${el}:"${elVal}")`;
                  if (!this.ROOT_QUERY[hashKey]) {
                    this.ROOT_QUERY[hashKey] = [];
                  }
                  const rootQueryValue = this.ROOT_QUERY[hashKey];
                  if (Array.isArray(rootQueryValue)) {
                    rootQueryValue.push(hash);
                  }
                }
              });
            }
          }
        }
      }
    }
  }

  // fills in placeholder data in response object with values found in cache
  async populateAllHashes(
    allHashesFromQuery: string[],
    fields: unknown,
  ): Promise<unknown[]> {
    if (!allHashesFromQuery.length) return [];
    const hyphenIdx = allHashesFromQuery[0].indexOf("~");
    const typeName = allHashesFromQuery[0].slice(0, hyphenIdx);
    const reduction = await allHashesFromQuery.reduce(async (acc, hash) => {
      // for each hash from the input query, build the response object
      const readVal = await this.get(hash);
      if (readVal === "DELETED") return acc;
      if (!readVal) return undefined;
      const dataObj: Record<string, unknown> = {};
      if (typeof fields !== "object" || fields === null) {
        return undefined;
      }
      const fieldsRecord = fields as Record<string, unknown>;
      const readValRecord = readVal as Record<string, unknown>;
      for (const field in fieldsRecord) {
        if (readValRecord[field] === "DELETED") continue;
        // for each field in the fields input query, add the corresponding value from the cache if the field is not another array of hashs
        if (readValRecord[field] === undefined && field !== "__typename") {
          return undefined;
        }
        if (typeof fieldsRecord[field] !== "object") {
          // add the typename for the type
          if (field === "__typename") {
            dataObj[field] = typeName;
          } else dataObj[field] = readValRecord[field];
        } else {
          // case where the field from the input query is an array of hashes, recursively invoke populateAllHashes
          const fieldValue = readValRecord[field];
          if (Array.isArray(fieldValue)) {
            dataObj[field] = await this.populateAllHashes(
              fieldValue as string[],
              fieldsRecord[field],
            );
          } else {
            return undefined;
          }
          if (dataObj[field] === undefined) return undefined;
        }
      }
      // acc is an array of response object for each hash
      const resolvedProm = await Promise.resolve(acc);
      resolvedProm.push(dataObj);
      return resolvedProm;
    }, Promise.resolve([]));
    return reduction;
  }
}

function labelId(obj: unknown): string {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("labelId expects an object");
  }
  const objRecord = obj as Record<string, unknown>;
  const id = objRecord.id || objRecord.ID || objRecord._id || objRecord._ID ||
    objRecord.Id || objRecord._Id;
  return String(objRecord.__typename) + "~" + String(id);
}
