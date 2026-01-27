/**
 * NOTES:
 * 1.This file will test the write method on the Cache class functionality:
 * Should return the new updated cache when the cache was successfully updated with the same reference to the original cache
// Should return the string 'Cache update' when the cache was successfully updated.
 * Should update the original cache with the new fields and queries.
 * Should not overwrite the fields in the original cache with the new fields if the fields are not the same
 *
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Cache } from "../../_test_variables/server/quickCacheLight.ts";
import { test } from "../../_test_variables/server/writeCache_variables.ts";

Deno.test("write method on Cache class - write - should return the new updated cache when the cache was successfully updated with the same reference to the original cache", () => {
  const cache = new Cache(test.originalCache);
  cache.write(test.queryStr, test.respObj);
  assertEquals(cache.storage, test.originalCache);
});

Deno.test("write method on Cache class - write - should update the original cache with the new fields and queries", () => {
  const cache = new Cache(test.originalCache);
  cache.write(test.queryStr, test.respObj);
  assertEquals(cache.storage, test.expectedResultCache);
});

Deno.test("write method on Cache class - write - should not overwrite the fields in the original cache with the new fields if the fields are not the same", () => {
  const cache = new Cache(test.originalCache);
  cache.write(test.queryStrTwo, test.respObj);
  assertEquals(test.originalCache, cache.storage);
});

// The following test requires the redis server to be started to test functionality.
//
// Deno.test("write method on Cache class - write - alias test case", async () => {
//   const cache = new CacheServer(test.originalCache);
//   await cache.write(test.aliasQuery, test.aliasResponse);
//   await console.log(cache.storage);
//   assertEquals(cache.storage, test.originalCache);
// });
