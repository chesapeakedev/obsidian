/**
 * NOTES:
 * This file will test the read and write method on the Cache class functionality.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Cache } from "../../_test_variables/server/quickCacheLight.ts";
import { test as testWrite } from "../../_test_variables/server/writeCache_variables.ts";
import { test as testRead } from "../../_test_variables/server/readCache_variables.ts";

Deno.test("Write to Cache class - write() - Should write to redis cache", async () => {
  const cache = new Cache(testWrite.originalCache);
  await cache.write(testWrite.queryStr, testWrite.respObj);
  assertEquals(cache.storage, testWrite.originalCache);
});

Deno.test("Write to Cache class - write() - should not overwrite the fields in the original cache with the new fields if the fields are not the same", async () => {
  const cache = new Cache(testWrite.originalCache);
  await cache.write(testWrite.queryStrTwo, testWrite.respObj);
  assertEquals(testWrite.originalCache, cache.storage);
});

Deno.test("Write to Cache class - read() - should return a graphql response object if all required values are found in the cache", async () => {
  const cache = new Cache(testRead.cache);
  cache.write(testRead.singularInputQuery, testRead.singularQueryResObj);
  const result = await cache.read(testRead.singularInputQuery);
  assertEquals(result, testRead.singularQueryResObj);
});
