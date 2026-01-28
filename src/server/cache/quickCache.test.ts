/**
 * NOTES:
 * 1.This file will test the read method on the Cache class functionalities:
 * Should return a graphql response object if all required values are found in the cache.
 * Should return undefined if any field is missing value  in the cache.
 * Should accept multiple queries in one query operation.
 * Should ignore the elements with a 'DELETE' value and not throw a cache miss if asked for in the query string
 * 2. This file will test populateAllHashes functionalities:
 * Should return undefined if any field is missing from the cache.
 * Should return an array of field objects if all the elements are found in the cache.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Cache } from "./quickCache.test.helper.ts";
import { test } from "./quickCache.test.fixtures.ts";
import { test as testWrite } from "./quickCache.test.write.fixtures.ts";

const REDIS_AVAILABLE = await (async () => {
  try {
    const cache = new Cache(test.cache);
    await cache.read(test.singularInputQuery);
    return true;
  } catch {
    return false;
  }
})();

Deno.test({
  name:
    "read method on Cache class - read() - should return a graphql response object if all required values are found in the cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.read(test.singularInputQuery);
    assertEquals(result, test.singularQueryResObj);
  },
});

Deno.test({
  name:
    "read method on Cache class - read() - should return undefined if any field is missing a value in the cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.read(test.undefinedInputQuery);
    assertEquals(result, undefined);
  },
});

Deno.test({
  name:
    "read method on Cache class - read() - should accept multiple queries in one query operation",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.read(test.multipleInputQuery);
    assertEquals(result, test.multipleQueriesResObj);
  },
});

Deno.test({
  name:
    "read method on Cache class - read() - should ignore the elements with a 'DELETE' value and not throw a cache miss if asked for in the query string",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.read(test.queryStrDelete);
    assertEquals(result, test.multipleQueriesResObj);
  },
});

Deno.test({
  name: "read method on Cache class - read() - should accept alias queries",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.aliasCache);
    const result = await cache.read(test.aliasQueryString);
    assertEquals(result, test.aliasResObj);
  },
});

Deno.test({
  name:
    "read method on Cache class - populateAllHashes() - should return undefined if any field is missing from the cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.populateAllHashes(
      ["Actor~1"],
      test.fieldsUndefined,
    );
    assertEquals(result, undefined);
  },
});

Deno.test({
  name:
    "read method on Cache class - populateAllHashes() - should return an array of field objects if all the elements are found in the cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    const result = await cache.populateAllHashes(
      ["Actor~1"],
      test.fieldsComplete,
    );
    assertEquals(result, [
      {
        __typename: "Actor",
        id: "1",
        firstName: "Harrison",
      },
    ]);
  },
});

Deno.test({
  name:
    "write method on Cache class - write - should return the new updated cache when the cache was successfully updated with the same reference to the original cache",
  ignore: !REDIS_AVAILABLE,
  fn: () => {
    const cache = new Cache(testWrite.originalCache);
    cache.write(testWrite.queryStr, testWrite.respObj);
    assertEquals(cache.storage, testWrite.originalCache);
  },
});

Deno.test({
  name:
    "write method on Cache class - write - should update the original cache with the new fields and queries",
  ignore: !REDIS_AVAILABLE,
  fn: () => {
    const cache = new Cache(testWrite.originalCache);
    cache.write(testWrite.queryStr, testWrite.respObj);
    assertEquals(cache.storage, testWrite.expectedResultCache);
  },
});

Deno.test({
  name:
    "write method on Cache class - write - should not overwrite the fields in the original cache with the new fields if the fields are not the same",
  ignore: !REDIS_AVAILABLE,
  fn: () => {
    const cache = new Cache(testWrite.originalCache);
    cache.write(testWrite.queryStrTwo, testWrite.respObj);
    assertEquals(testWrite.originalCache, cache.storage);
  },
});

Deno.test({
  name: "Write to Cache class - write() - Should write to redis cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(testWrite.originalCache);
    await cache.write(testWrite.queryStr, testWrite.respObj);
    assertEquals(cache.storage, testWrite.originalCache);
  },
});

Deno.test({
  name:
    "Write to Cache class - write() - should not overwrite the fields in the original cache with the new fields if the fields are not the same",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(testWrite.originalCache);
    await cache.write(testWrite.queryStrTwo, testWrite.respObj);
    assertEquals(testWrite.originalCache, cache.storage);
  },
});

Deno.test({
  name:
    "Write to Cache class - read() - should return a graphql response object if all required values are found in the cache",
  ignore: !REDIS_AVAILABLE,
  fn: async () => {
    const cache = new Cache(test.cache);
    cache.write(test.singularInputQuery, test.singularQueryResObj);
    const result = await cache.read(test.singularInputQuery);
    assertEquals(result, test.singularQueryResObj);
  },
});
