/** @format */
import pluralize from "pluralize";

import normalizeResult from "../normalizeResult.ts";
import destructureQueries from "../destructure.ts";

class Node {
  key: string;
  val: unknown;
  next: Node | null;
  prev: Node | null;
  freq: number;

  constructor(key: string, value: unknown) {
    this.key = key; // 'Actor~1
    this.val = value; // {id:1, name:harrison, ....}
    this.next = this.prev = null;
    this.freq = 1;
  }
}

class DoublyLinkedList {
  head: Node;
  tail: Node;

  constructor() {
    this.head = new Node("", null);
    this.tail = new Node("", null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  insertHead(node: Node): void {
    node.prev = this.head;
    node.next = this.head.next!;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  removeNode(node: Node): void {
    const prev = node.prev!;
    const next = node.next!;
    prev.next = next;
    next.prev = prev;
  }

  removeTail(): string {
    const node = this.tail.prev!;
    this.removeNode(node);
    return node.key;
  }

  isEmpty(): boolean {
    return this.head.next!.val == null;
  }
}

/**
 * @param {number} capacity
 */
export default class LFUCache {
  capacity: number;
  currentSize: number;
  leastFreq: number;
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
  nodeHash: Map<string, Node>;
  freqHash: Map<number, DoublyLinkedList>;
  callTime: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.currentSize = 0;
    this.leastFreq = 0;
    this.ROOT_QUERY = {};
    this.ROOT_MUTATION = {};
    this.nodeHash = new Map();
    this.freqHash = new Map();
    this.callTime = 0;
  }

  /**
   * @param {string} key
   * @return {object}
   */
  get(key: string): unknown {
    const node = this.nodeHash.get(key);
    // if node is not found return undefined so that Obsidian will pull new data from graphQL
    if (!node) return undefined;
    this.freqHash.get(node.freq)!.removeNode(node);
    if (
      node.freq == this.leastFreq && this.freqHash.get(node.freq)!.isEmpty()
    ) {
      this.leastFreq++;
    }
    node.freq++;
    // freqHash housekeeping
    if (this.freqHash.get(node.freq) == null) {
      this.freqHash.set(node.freq, new DoublyLinkedList());
    }
    this.freqHash.get(node.freq)!.insertHead(node);
    return node.val;
  }

  /**
   * @param {string} key
   * @param {object} value
   * @return {void}
   */
  put(key: string, value: unknown): void {
    if (this.capacity == 0) return;
    const node = this.nodeHash.get(key);
    if (!node) {
      // new node
      this.currentSize++;
      if (this.currentSize > this.capacity) {
        const tailKey = this.freqHash.get(this.leastFreq)!.removeTail();
        this.nodeHash.delete(tailKey);
        this.currentSize--;
      }
      const newNode = new Node(key, value);
      // freqHash housekeeping
      if (this.freqHash.get(1) == null) {
        this.freqHash.set(1, new DoublyLinkedList());
      }
      this.freqHash.get(1)!.insertHead(newNode);

      this.nodeHash.set(key, newNode);
      this.leastFreq = 1;
    } else {
      // existed node
      node.val = value;
      this.freqHash.get(node.freq)!.removeNode(node);
      if (
        node.freq == this.leastFreq && this.freqHash.get(node.freq)!.isEmpty()
      ) {
        this.leastFreq++;
      }
      node.freq++;
      // freqHash housekeeping
      if (this.freqHash.get(node.freq) == null) {
        this.freqHash.set(node.freq, new DoublyLinkedList());
      }
      this.freqHash.get(node.freq)!.insertHead(node);
    }
  }

  async read(queryStr: string): Promise<unknown> {
    if (typeof queryStr !== "string") {
      throw TypeError("input should be a string");
    }
    // destructure the query string into an object
    const queries = destructureQueries(queryStr).queries as
      | Array<{
        name: string;
        arguments: string;
        alias?: string;
        fields: unknown;
      }>
      | undefined;
    // breaks out of function if queryStr is a mutation
    if (!queries) return undefined;
    const responseObject: Record<string, unknown> = {};
    // iterate through each query in the input queries object
    for (const query in queries) {
      const queryObj = queries[query];
      // get the entire str query from the name input query and arguments
      const queryHash = queryObj.name.concat(queryObj.arguments);
      const rootQuery = this.ROOT_QUERY;
      // match in ROOT_QUERY
      if (rootQuery[queryHash]) {
        // get the hashs to populate from the existent query in the cache
        const arrayHashes = rootQuery[queryHash] as string[];
        // Determines responseObject property labels - use alias if applicable, otherwise use name
        const respObjProp = queryObj.alias ?? queryObj.name;
        // invoke populateAllHashes and add data objects to the response object for each input query
        responseObject[respObjProp] = await this.populateAllHashes(
          arrayHashes,
          queryObj.fields,
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

  cacheDelete(hash: string): void {
    const node = this.nodeHash.get(hash);
    if (!node) return;
    this.freqHash.get(node.freq)!.removeNode(node);
    this.nodeHash.delete(hash);
  }

  cacheClear(): void {
    this.currentSize = 0;
    this.leastFreq = 0;
    this.ROOT_QUERY = {};
    this.ROOT_MUTATION = {};
    this.nodeHash = new Map();
    this.freqHash = new Map();
  }

  writeWholeQuery(queryStr: string, respObj: unknown): unknown {
    const hash = queryStr.replace(/\s/g, "");
    this.put(hash, respObj);
    return respObj;
  }

  readWholeQuery(queryStr: string): unknown {
    const hash = queryStr.replace(/\s/g, "");
    if (this.ROOT_QUERY[hash]) return this.get(hash);
    return undefined;
  }

  async populateAllHashes(
    allHashesFromQuery: string[],
    fields: unknown,
  ): Promise<unknown[]> {
    if (!allHashesFromQuery.length) return Promise.resolve([]);
    const hyphenIdx = allHashesFromQuery[0].indexOf("~");
    const typeName = allHashesFromQuery[0].slice(0, hyphenIdx);
    const result: unknown[] = [];
    for (const hash of allHashesFromQuery) {
      // for each hash from the input query, build the response object
      const readVal = this.get(hash);
      if (readVal === "DELETED") continue;
      if (!readVal) return Promise.resolve([]);
      const dataObj: Record<string, unknown> = {};
      if (typeof fields !== "object" || fields === null) {
        return Promise.resolve([]);
      }
      const fieldsRecord = fields as Record<string, unknown>;
      const readValRecord = readVal as Record<string, unknown>;
      for (const field in fieldsRecord) {
        if (readValRecord[field] === "DELETED") continue;
        // for each field in the fields input query, add the corresponding value from the cache if the field is not another array of hashs
        if (readValRecord[field] === undefined && field !== "__typename") {
          return Promise.resolve([]);
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
            return Promise.resolve([]);
          }
          if (dataObj[field] === undefined) return Promise.resolve([]);
        }
      }
      result.push(dataObj);
    }
    return Promise.resolve(result);
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
