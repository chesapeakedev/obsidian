import { pluralize } from "pluralize";

import normalizeResult from "./normalizeResult.ts";
import destructureQueries from "./destructure.ts";
import SLRUCache from "./slruSub-cache.ts";
import LRUCache from "./lruSub-cache.ts";
import { FrequencySketch } from "./FrequencySketch.ts";

/*****
 * Overall w-TinyLFU Cache
 *****/
export default class WTinyLFUCache {
  capacity: number;
  ROOT_QUERY: Record<string, any>;
  ROOT_MUTATION: Record<string, any>;
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

  async putAndPromote(key: string, value: any): Promise<void> {
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
    fields: any,
  ): Promise<any[]> {
    if (!allHashesFromQuery.length) return [];
    // isolate the type of search from the rest of the hash name
    const hyphenIdx = allHashesFromQuery[0].indexOf("~");
    const typeName = allHashesFromQuery[0].slice(0, hyphenIdx);
    const reduction = allHashesFromQuery.reduce(async (acc, hash) => {
      // for each hash from the input query, build the response object
      // first, check the SLRU cache
      let readVal = await this.SLRU.get(hash);
      // if the hash is not in the SLRU, check the WLRU
      if (!readVal) readVal = await this.WLRU.get(hash);
      if (readVal === "DELETED") return acc;
      if (readVal) this.sketch.increment(JSON.stringify(readVal));
      if (!readVal) return undefined;
      const dataObj: Record<string, any> = {};
      for (const field in fields) {
        if (readVal[field] === "DELETED") continue;
        // for each field in the fields input query, add the corresponding value from the cache
        // if the field is not another array of hashes
        if (readVal[field] === undefined && field !== "__typename") {
          return undefined;
        }
        if (typeof fields[field] !== "object") {
          // add the typename for the type
          if (field === "__typename") {
            dataObj[field] = typeName;
          } else dataObj[field] = readVal[field]; // assign the value from the cache to the key in the response
        } else {
          // case where the field from the input query is an array of hashes, recursively invoke populateAllHashes
          dataObj[field] = await this.populateAllHashes(
            readVal[field],
            fields[field],
          );
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

  // read from the cache and generate a response object to be populated with values from cache
  async read(queryStr: string): Promise<any> {
    if (typeof queryStr !== "string") {
      throw TypeError("input should be a string");
    }
    // destructure the query string into an object
    const queries = destructureQueries(queryStr).queries;
    // breaks out of function if queryStr is a mutation
    if (!queries) return undefined;
    const responseObject: Record<string, any> = {};
    // iterate through each query in the input queries object
    for (const query in queries) {
      // get the entire str query from the name input query and arguments
      const queryHash = queries[query].name.concat(queries[query].arguments);
      const rootQuery = this.ROOT_QUERY;
      // match in ROOT_QUERY
      if (rootQuery[queryHash]) {
        // get the hashes to populate from the existent query in the cache
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
    respObj: any,
    searchTerms?: string[],
    deleteFlag?: boolean,
  ): Promise<void> {
    let nullFlag = false;
    let deleteMutation = "";
    let wasFoundIn: string | null = null;
    for (const query in respObj.data) {
      if (respObj.data[query] === null) nullFlag = true;
      else if (query.toLowerCase().includes("delete")) {
        deleteMutation = labelId(respObj.data[query]);
      }
    }
    if (!nullFlag) {
      const queryObj = destructureQueries(queryStr);
      const resFromNormalize = normalizeResult(queryObj, respObj, deleteFlag);
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
                for (let i = 0; i < this.ROOT_QUERY[key].length; i++) {
                  if (this.ROOT_QUERY[key][i] === deleteMutation) {
                    this.ROOT_QUERY[key].splice(i, 1);
                    i--;
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
              this.ROOT_QUERY[key].push(hash);
            }
          }
          /****
           * if search terms were provided in the wrapper and the query is an
           * "all"-type query, build out queries in ROOT_QUERY that match the
           * search terms for each item retrieved from the "all"-type query so
           * that future single queries can be looked up directly from the cache
           ****/
          if (searchTerms && queryStr.slice(8, 11) === "all") {
            searchTerms.forEach((el) => {
              const elVal = resFromNormalize[hash][el].replaceAll(" ", "");
              const hashKey = `one${typeName}(${el}:"${elVal}")`;
              if (!this.ROOT_QUERY[hashKey]) this.ROOT_QUERY[hashKey] = [];
              this.ROOT_QUERY[hashKey].push(hash);
            });
          }
        }
      }
    }
  }

  // Note: WholeQuery is not a currently-functioning option in Obsidian Wrapper
  writeWholeQuery(queryStr: string, respObj: any): any {
    const hash = queryStr.replace(/\s/g, "");
    this.putAndPromote(this.ROOT_QUERY[hash], respObj);
    return respObj;
  }

  // Note: WholeQuery is not a currently-functioning option in Obsidian Wrapper
  readWholeQuery(queryStr: string): any {
    const hash = queryStr.replace(/\s/g, "");
    if (this.ROOT_QUERY[hash]) {
      const slruVal = this.SLRU.get(this.ROOT_QUERY[hash]);
      if (slruVal) return slruVal;
      return this.WLRU.get(this.ROOT_QUERY[hash]);
    }
    return undefined;
  }

  /*****
   * TinyLFU Admission Policy
   *****/
  async TinyLFU(
    WLRUCandidate: { key: string; value: any },
    SLRUCandidate: { key: string; value: any },
  ): Promise<{ key: string; value: any }> {
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
}

function labelId(obj: any): string {
  const id = obj.id || obj.ID || obj._id || obj._ID || obj.Id || obj._Id;
  return obj.__typename + "~" + id;
}
