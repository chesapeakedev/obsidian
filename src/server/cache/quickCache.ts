/** @format */

import "https://deno.land/x/dotenv@v3.2.2/load.ts";
import { connect } from "https://deno.land/x/redis@v0.29.2/mod.ts";
import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => unknown;
import { destructureQueries } from "../destructure.ts";

interface InitialCache {
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
}

export class Cache {
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
  redis: unknown; // Redis client from deno.land/x/redis

  constructor(
    initialCache: InitialCache = {
      ROOT_QUERY: {},
      ROOT_MUTATION: {},
    },
  ) {
    this.ROOT_QUERY = initialCache.ROOT_QUERY;
    this.ROOT_MUTATION = initialCache.ROOT_MUTATION;
  }

  // METHOD TO CONNECT TO CACHE
  async connect(
    port: number,
    policy: string,
    maxmemory: string,
  ): Promise<void> {
    this.redis = await connect({
      hostname: Deno.env.get("REDIS_HOST"),
      port: port,
    });
    console.log("connecting to redis");
    this.cacheClear();
    const redisClient = this.redis as {
      configSet: (key: string, value: string) => Promise<void>;
    };
    await redisClient.configSet("maxmemory-policy", policy);
    await redisClient.configSet("maxmemory", maxmemory);
  }

  // METHOD TO READ FROM REDIS CACHE & RESTRUCTURE THE DATA
  async read(queryStr: string): Promise<unknown> {
    // destructure the query string into an object
    const queries = destructureQueries(queryStr).queries;
    if (!queries) return;
    const responseObject: Record<string, unknown> = {};
    // iterate through each query in the input object
    for (const query in queries) {
      const queryHash = queries[query].name.concat(queries[query].arguments);
      const rootQueryValue = this.ROOT_QUERY[queryHash];
      if (rootQueryValue && Array.isArray(rootQueryValue)) {
        const hashArray = rootQueryValue as string[];
        const respObjProp = queries[query].alias ?? queries[query].name;
        // invoke populateAllHashes to add data object to the response object
        responseObject[respObjProp] = await this.populateAllHashes(
          hashArray,
          queries[query].fields,
        );
        if (!responseObject[respObjProp]) return;
      } else {
        return null;
      }
    }
    return { data: responseObject };
  }

  async populateAllHashes(
    allHashes: string[],
    fields: unknown,
  ): Promise<unknown[]> {
    if (!allHashes.length) return [];
    const tildeInd = allHashes[0].indexOf("~");
    const typeName = allHashes[0].slice(0, tildeInd);
    const reduction = await allHashes.reduce(async (acc, hash) => {
      const redisClient = this.redis as {
        get: (key: string) => Promise<string | null>;
      };
      const readStr = await redisClient.get(hash);
      if (!readStr) return undefined;
      const readVal = JSON.parse(readStr);
      if (!readVal) return;
      const dataObj: Record<string, unknown> = {};
      // iterate over the fields object to populate with data from cache
      if (typeof fields !== "object" || fields === null) {
        return undefined;
      }
      const fieldsRecord = fields as Record<string, unknown>;
      const readValRecord = readVal as Record<string, unknown>;
      for (const field in fieldsRecord) {
        if (typeof fieldsRecord[field] !== "object") {
          if (field === "__typename") {
            dataObj[field] = typeName;
          } else {
            dataObj[field] = readValRecord[field] || "n/a";
          }
        } else {
          // if the field from the input query is an array of hashes, recursively invoke
          const fieldValue = readValRecord[field];
          if (Array.isArray(fieldValue)) {
            dataObj[field] = await this.populateAllHashes(
              fieldValue as string[],
              fieldsRecord[field],
            );
          } else {
            return undefined;
          }
          if (dataObj[field] === undefined) return;
        }
      }
      // at this point acc should be an array of response objects for each hash
      const resolvedProm = await Promise.resolve(acc);
      resolvedProm.push(dataObj);
      return resolvedProm;
    }, Promise.resolve([]));
    return reduction;
  }

  // METHOD TO WRITE TO REDIS CACHE
  async write(
    queryStr: string,
    respObj: Record<string, unknown>,
    searchTerms: string[],
    _deleteFlag?: boolean,
  ): Promise<void> {
    const hash = this.createQueryKey(queryStr);
    const array = Object.keys(respObj);
    // isolate type of of query - 'person,' 'book,' etc.
    const tildeInd = array[0].indexOf("~");
    const typeName = array[0].slice(0, tildeInd);
    // store the array of keys to ROOT_QUERY
    this.ROOT_QUERY[hash] = array;
    // write each item in the array to the cache
    for (let i = 0; i < array.length; i++) {
      const redisClient = this.redis as {
        set: (key: string, value: string) => Promise<void>;
      };
      await redisClient.set(array[i], JSON.stringify(respObj[array[i]]));
      // if using searchTerms, iterate throuogh those and also store each item
      // according to those terms in ROOT_QUERY
      if (searchTerms.length && queryStr.slice(8, 11) === "all") {
        const arrayItem = respObj[array[i]];
        if (typeof arrayItem === "object" && arrayItem !== null) {
          const arrayItemRecord = arrayItem as Record<string, unknown>;
          searchTerms.forEach((el) => {
            const elValRaw = arrayItemRecord[el];
            if (typeof elValRaw === "string") {
              const elVal = elValRaw.replaceAll(" ", "");
              const hashKey = `one${typeName}(${el}:"${elVal}")`;
              if (!this.ROOT_QUERY[hashKey]) {
                this.ROOT_QUERY[hashKey] = [];
              }
              const rootQueryValue = this.ROOT_QUERY[hashKey];
              if (Array.isArray(rootQueryValue)) {
                rootQueryValue.push(array[i]);
              }
            }
          });
        }
      }
    }
  }

  // CURRENTLY BEING UTILIZED BY invalidateCacheCheck.ts, WHICH IS A FILE THAT SHOULD BE REFACTORED IN FUTURE ITERATION
  cacheWriteObject = async (
    hash: string,
    obj: Record<string, unknown>,
  ): Promise<void> => {
    const entries = Object.entries(obj).flat();
    const stringEntries = entries.map((entry) => JSON.stringify(entry));
    // adding as nested strings? take out one layer for clarity.
    const redisClient = this.redis as {
      hset: (hash: string, ...entries: string[]) => Promise<number>;
    };
    await redisClient.hset(hash, ...stringEntries);
  };

  // CURRENTLY BEING UTILIZED BY invalidateCacheCheck.ts, WHICH IS A FILE THAT SHOULD BE REFACTORED IN FUTURE ITERATION
  cacheReadObject = async (
    hash: string,
    fields: string[] = [],
  ): Promise<unknown> => {
    // Checks for the fields requested, then queries cache for those specific keys in the hashes
    if (fields.length !== 0) {
      const fieldObj: Record<string, unknown> = {};
      const redisClient = this.redis as {
        hget: (hash: string, field: string) => Promise<string>;
      };
      for (const field of fields) {
        const rawCacheValue = await redisClient.hget(
          hash,
          JSON.stringify(field),
        );
        fieldObj[field] = JSON.parse(rawCacheValue);
      }
      return fieldObj;
    } else {
      const redisClient = this.redis as {
        hgetall: (hash: string) => Promise<string[]>;
      };
      const objArray = await redisClient.hgetall(hash);
      if (objArray.length == 0) return undefined;
      const parsedArray = objArray.map((entry: string) => JSON.parse(entry));

      if (parsedArray.length % 2 !== 0) {
        return undefined;
      }
      const returnObj: Record<string, unknown> = {};
      for (let i = 0; i < parsedArray.length; i += 2) {
        returnObj[parsedArray[i]] = parsedArray[i + 1];
      }

      return returnObj;
    }
  };

  /*
  Creates a string to search the cache or add as a key in the cache.
  */
  createQueryKey(queryStr: string): string {
    // traverses AST and gets object name, and any filter keys in the query
    const ast = gql(queryStr);
    const tableName = ast.definitions[0].selectionSet.selections[0].name.value;
    let queryKey = `${tableName}`;

    if (ast.definitions[0].operation === "mutation") return queryKey;
    if (ast.definitions[0].selectionSet.selections[0].arguments.length) {
      const fieldsArray =
        ast.definitions[0].selectionSet.selections[0].arguments;
      const resultsObj: Record<string, unknown> = {};
      fieldsArray.forEach((el: Record<string, unknown>) => {
        const name = el.name.value;
        const value = el.value.value;
        resultsObj[name] = value;
      });

      let parens = ""; // name:"Yoda"
      for (const key in resultsObj) {
        parens += `${key}:"${resultsObj[key]}"`;
      }
      queryKey = queryKey + "(" + parens + ")";
    }
    return queryKey;
  }

  async cacheDelete(hash: string): Promise<void> {
    const redisClient = this.redis as { del: (key: string) => Promise<number> };
    await redisClient.del(hash);
  }

  async cacheClear(): Promise<void> {
    await (this.redis as {
      flushdb: (callback: (err: unknown, successful: unknown) => void) => void;
    }).flushdb((err: unknown, successful: unknown) => {
      if (err) console.log("redis error", err);
      console.log(successful, "clear");
    });
  }

  // functionality to stop polling
  stopPollInterval(interval: number): void {
    clearInterval(interval);
  }
}
