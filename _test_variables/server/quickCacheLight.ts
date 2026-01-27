// Lightweight cache implementation for testing purposes. Uses redis v0.23.2 for compatibility.
import { connect } from "https://deno.land/x/redis@v0.23.2/mod.ts";
import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => unknown;
import { type DocumentNode, print, visit } from "graphql";

interface InitialCache {
  ROOT_QUERY: Record<string, unknown>;
  ROOT_MUTATION: Record<string, unknown>;
}

interface RedisClient {
  configSet: (parameter: string, value: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  setex: (key: string, seconds: number, value: string) => Promise<unknown>;
  del: (key: string) => Promise<number>;
  rpush: (key: string, ...values: string[]) => Promise<number>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  hset: (key: string, ...fieldValues: string[]) => Promise<number>;
  hget: (key: string, field: string) => Promise<string | null>;
  hgetall: (key: string) => Promise<string[]>;
  flushdb: (callback?: (err: Error | null, successful: string) => void) => Promise<string>;
}

// set up a redis server
let redis: RedisClient;
const context = "server";

if (context === "server") {
  redis = await connect({
    hostname: "127.0.0.1",
    port: 6379,
  }) as RedisClient;
}

export class Cache {
  storage: Record<string, unknown>;
  context: string;

  constructor(
    initialCache: InitialCache = {
      ROOT_QUERY: {},
      ROOT_MUTATION: {},
    },
  ) {
    this.storage = initialCache;
    this.context = "server";
  }

  // set cache configurations
  async configSet(parameter: string, value: string): Promise<unknown> {
    return await redis.configSet(parameter, value);
  }

  // Main functionality methods
  // for reading the initial query
  async read(queryStr: string): Promise<unknown> {
    console.log("in the read func");
    //the queryStr it gets is the JSON stringified
    const returnedValue = await this.cacheRead(queryStr);
    console.log("returnedValue -> ", returnedValue);

    if (returnedValue) {
      return JSON.parse(returnedValue as string);
    } else {
      return undefined;
    }
  }
  async write(queryStr: string, respObj: unknown): Promise<void> {
    // update the original cache with same reference
    await this.cacheWrite(queryStr, JSON.stringify(respObj));
  }

  //will overwrite a list at the given hash by default
  //if you pass a false value to overwrite, it will append the list items to the end

  //Probably be used in normalize
  cacheWriteList = async (hash: string, array: unknown[], overwrite: boolean = true): Promise<void> => {
    if (overwrite) {
      await redis.del(hash);
    }
    const stringifiedArray = array.map((element) => JSON.stringify(element));
    await redis.rpush(hash, ...stringifiedArray);
  };

  cacheReadList = async (hash: string): Promise<unknown[]> => {
    let cachedArray = await redis.lrange(hash, 0, -1);
    cachedArray = cachedArray.map((element) => JSON.parse(element));

    return cachedArray;
  };

  cacheWriteObject = async (hash: string, obj: Record<string, unknown>): Promise<void> => {
    let entries = Object.entries(obj).flat();
    entries = entries.map((entry) => JSON.stringify(entry));

    await redis.hset(hash, ...entries);
  };

  cacheReadObject = async (hash: string, field?: string): Promise<unknown> => {
    if (field) {
      const returnValue = await redis.hget(hash, JSON.stringify(field));

      if (returnValue === null || returnValue === undefined) return undefined;
      return JSON.parse(returnValue);
    } else {
      const objArray = await redis.hgetall(hash);
      if (objArray.length == 0) return undefined;
      const parsedArray = objArray.map((entry) => JSON.parse(entry));

      if (parsedArray.length % 2 !== 0) {
        return undefined;
      }
      const returnObj: Record<string, unknown> = {};
      for (let i = 0; i < parsedArray.length; i += 2) {
        returnObj[parsedArray[i] as string] = parsedArray[i + 1];
      }

      return returnObj;
    }
  };

  createBigHash(inputfromQuery: string): string {
    const ast = gql(inputfromQuery) as DocumentNode;

    const returned = visit(ast, { enter: () => print(ast) });
    const finalReturn = print(returned);
    return JSON.stringify(finalReturn);
  }

  async cacheRead(hash: string): Promise<unknown> {
    console.log("in the cacheRead func");
    console.log("context: ", context);
    console.log("hash: ", hash);

    if (this.context === "client") {
      return this.storage[hash];
    } else {
      console.log("In the else block...");
      if (hash === "ROOT_QUERY" || hash === "ROOT_MUTATION") {
        const hasRootQuery = await redis.get("ROOT_QUERY");

        if (!hasRootQuery) {
          await redis.set("ROOT_QUERY", JSON.stringify({}));
        }
        const hasRootMutation = await redis.get("ROOT_MUTATION");

        if (!hasRootMutation) {
          await redis.set("ROOT_MUTATION", JSON.stringify({}));
        }
      }
      const hashedQuery = await redis.get(hash);
      console.log("Response from redis -> ", hashedQuery);

      if (hashedQuery === null || hashedQuery === undefined) return undefined;
      return JSON.parse(hashedQuery);
    }
  }
  async cacheWrite(hash: string, value: unknown): Promise<void> {
    // writes value to object cache or JSON.stringified value to redis cache
    if (this.context === "client") {
      this.storage[hash] = value;
    } else {
      const stringifiedValue = JSON.stringify(value);
      await redis.setex(hash, 6000, stringifiedValue);
    }
  }

  async cacheWriteList(hash: string, array: string[]): Promise<void> {
    await redis.rpush(hash, ...array);
  }

  async cacheReadList(hash: string): Promise<string[]> {
    const cachedArray = await redis.lrange(hash, 0, -1);
    return cachedArray;
  }

  async cacheDelete(hash: string): Promise<void> {
    // deletes the hash/value pair on either object cache or redis cache
    if (this.context === "client") {
      delete this.storage[hash];
    } else await redis.del(hash);
  }
  async cacheClear(): Promise<void> {
    // erases either object cache or redis cache
    if (this.context === "client") {
      this.storage = { ROOT_QUERY: {}, ROOT_MUTATION: {} };
    } else {
      await redis.flushdb((err: Error | null, successful: string) => {
        if (err) console.log("redis error", err);
        console.log(successful, "clear");
      });
      await redis.set("ROOT_QUERY", JSON.stringify({}));
      await redis.set("ROOT_MUTATION", JSON.stringify({}));
    }
  }

  // functionality to stop polling
  stopPollInterval(interval: number): void {
    clearInterval(interval);
  }

  async populateAllHashes(
    allHashes: string[],
    fields: Record<string, unknown>,
  ): Promise<unknown[]> {
    if (!allHashes.length) return [];
    const tildeInd = allHashes[0].indexOf("~");
    const typeName = allHashes[0].slice(0, tildeInd);
    const reduction = await allHashes.reduce(async (acc, hash) => {
      const readStr = await redis.get(hash);
      if (!readStr) return undefined;
      const readVal = JSON.parse(readStr);
      if (!readVal) return;
      const dataObj: Record<string, unknown> = {};
      // iterate over the fields object to populate with data from cache
      if (typeof fields !== "object" || fields === null) {
        return undefined;
      }
      const readValRecord = readVal as Record<string, unknown>;
      for (const field in fields) {
        if (typeof fields[field] !== "object") {
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
              fields[field] as Record<string, unknown>,
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
    }, Promise.resolve([] as unknown[]));
    return reduction;
  }
}
