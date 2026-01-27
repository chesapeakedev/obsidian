import pluralize from "pluralize";

import normalizeResult from "../normalizeResult.ts";
import destructureQueries from "../destructure.ts";
import SLRUCache from "./slruSub-cache.ts";
import LRUCache from "./lruSub-cache.ts";
import { FrequencySketch } from "./FrequencySketch.ts";

/*****
 * Overall w-TinyLFU Cache
 *****/
export default class WTinyLFUCache {
  capacity: number;
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
  sketch: FrequencySketch;
  WLRU: LRUCache;
  SLRU: SLRUCache;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.ROOT_QUERY = {};
    this.ROOT_MUTATION = {};
    this.sketch = new FrequencySketch();

    // initialize window cache with access to frequency sketch
    this.WLRU = new LRUCache(capacity * 0.01);
    this.WLRU.sketch = this.sketch;
    // initialize segmented main cache with access to frequency sketch
    this.SLRU = new SLRUCache(capacity * 0.99);
    this.SLRU.probationaryLRU.sketch = this.sketch;
    this.SLRU.protectedLRU.sketch = this.sketch;
  }

  async putAndPromote(key: string, value: unknown): Promise<void> {
    const WLRUCandidate = this.WLRU.put(key, value);
    // if adding to the WLRU cache results in an eviction...
    if (WLRUCandidate) {
      // if the probationary cache is at capacity...
      let winner = WLRUCandidate;
      if (
        this.SLRU.probationaryLRU.nodeHash.size >=
          Math.floor(this.SLRU.probationaryLRU.capacity)
      ) {
        // send the last accessed item in the probationary cache to the TinyLFU
        const SLRUCandidate = this.SLRU.probationaryLRU.getCandidate();
        // determine which item will improve the hit-ratio most
        winner = await this.TinyLFU(WLRUCandidate, SLRUCandidate);
      }
      // add the winner to the probationary SLRU
      this.SLRU.probationaryLRU.put(winner.key, winner.value);
    }
  }

  // fills in placeholder data in response object with values found in cache
  async populateAllHashes(
    allHashesFromQuery: string[],
    fields: unknown,
  ): Promise<unknown[]> {
    if (!allHashesFromQuery.length) return [];
    // isolate the type of search from the rest of the hash name
    const hyphenIdx = allHashesFromQuery[0].indexOf("~");
    const typeName = allHashesFromQuery[0].slice(0, hyphenIdx);
    const result: unknown[] = [];
    for (const hash of allHashesFromQuery) {
      // for each hash from the input query, build the response object
      // first, check the SLRU cache
      let readVal = await this.SLRU.get(hash);
      // if the hash is not in the SLRU, check the WLRU
      if (!readVal) readVal = await this.WLRU.get(hash);
      if (readVal === "DELETED") continue;
      if (readVal) this.sketch.increment(JSON.stringify(readVal));
      if (!readVal) return [];
      const dataObj: Record<string, unknown> = {};
      if (typeof fields !== "object" || fields === null) {
        return [];
      }
      const fieldsRecord = fields as Record<string, unknown>;
      const readValRecord = readVal as Record<string, unknown>;
      for (const field in fieldsRecord) {
        if (readValRecord[field] === "DELETED") continue;
        // for each field in the fields input query, add the corresponding value from the cache
        // if the field is not another array of hashes
        if (readValRecord[field] === undefined && field !== "__typename") {
          return [];
        }
        if (typeof fieldsRecord[field] !== "object") {
          // add the typename for the type
          if (field === "__typename") {
            dataObj[field] = typeName;
          } else dataObj[field] = readValRecord[field]; // assign the value from the cache to the key in the response
        } else {
          // case where the field from the input query is an array of hashes, recursively invoke populateAllHashes
          const fieldValue = readValRecord[field];
          if (Array.isArray(fieldValue)) {
            dataObj[field] = await this.populateAllHashes(
              fieldValue as string[],
              fieldsRecord[field],
            );
          } else {
            return [];
          }
          if (dataObj[field] === undefined) return [];
        }
      }
      result.push(dataObj);
    }
    return result;
  }

  // read from the cache and generate a response object to be populated with values from cache
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
        // get the hashes to populate from the existent query in the cache
        const rootQueryValue = rootQuery[queryHash];
        if (!rootQueryValue || !Array.isArray(rootQueryValue)) {
          return null;
        }
        const arrayHashes = rootQueryValue as string[];
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
    let wasFoundIn: string | null = null;
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
        // first check SLRU
        let resp = await this.SLRU.get(hash);
        // next, check the window LRU
        if (resp) wasFoundIn = "SLRU";
        if (!resp) resp = await this.WLRU.get(hash);
        if (resp && !wasFoundIn) wasFoundIn = "WLRU";
        if (resp) this.sketch.increment(JSON.stringify(resp));
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
          if (wasFoundIn === "SLRU") await this.SLRU.put(hash, "DELETED");
          else if (wasFoundIn === "WLRU") await this.WLRU.put(hash, "DELETED");
        } else if (resp) {
          const newObj = Object.assign(resp, resFromNormalize[hash]);
          // write to the appropriate cache
          if (wasFoundIn === "SLRU") await this.SLRU.put(hash, newObj);
          else if (wasFoundIn === "WLRU") await this.WLRU.put(hash, newObj);
        } else {
          const typeName = hash.slice(0, hash.indexOf("~"));
          await this.putAndPromote(hash, resFromNormalize[hash]);
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

  // Note: WholeQuery is not a currently-functioning option in Obsidian Wrapper
  async writeWholeQuery(queryStr: string, respObj: unknown): Promise<unknown> {
    const hash = queryStr.replace(/\s/g, "");
    await this.putAndPromote(hash, respObj);
    return respObj;
  }

  // Note: WholeQuery is not a currently-functioning option in Obsidian Wrapper
  readWholeQuery(queryStr: string): unknown {
    const hash = queryStr.replace(/\s/g, "");
    const rootQueryValue = this.ROOT_QUERY[hash];
    if (rootQueryValue && typeof rootQueryValue === "string") {
      const slruVal = this.SLRU.get(rootQueryValue);
      if (slruVal) return slruVal;
      return this.WLRU.get(rootQueryValue);
    }
    return undefined;
  }

  /*****
   * TinyLFU Admission Policy
   *****/
  async TinyLFU(
    WLRUCandidate: { key: string; value: unknown },
    SLRUCandidate: { key: string; value: unknown },
  ): Promise<{ key: string; value: unknown }> {
    // get the frequency values of both items
    const WLRUFreq = await this.sketch.frequency(
      JSON.stringify(WLRUCandidate.value),
    );
    const SLRUFreq = await this.sketch.frequency(
      JSON.stringify(SLRUCandidate.value),
    );
    // return the object with the higher frequency, prioritizing items in the window cache,
    return WLRUFreq >= SLRUFreq ? WLRUCandidate : SLRUCandidate;
  }

  cacheClear(): void {
    this.ROOT_QUERY = {};
    this.ROOT_MUTATION = {};
    this.WLRU.nodeHash.clear();
    this.SLRU.probationaryLRU.nodeHash.clear();
    this.SLRU.protectedLRU.nodeHash.clear();
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
