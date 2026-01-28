import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import WTinyLFUCache from "./wTinyLFUBrowserCache.ts";

Deno.test("WTinyLFU cache functionality - WTinyLFU Initialization - should initialize with corect capacities", () => {
  const cache = new WTinyLFUCache(1000);
  assertEquals(cache.capacity, 1000);
  assertEquals(cache.WLRU.capacity, 10);
  assertEquals(cache.SLRU.probationaryLRU.capacity, 198);
  assertEquals(cache.SLRU.protectedLRU.capacity, 792);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should add new item to the windowLRU when adding to WTLFU cache", () => {
  const cache = new WTinyLFUCache(100);
  cache.putAndPromote("one", 1);
  assertEquals(cache.WLRU.get("one"), 1);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should move items ejected from windowLRU into the probationaryLRU cache", async () => {
  const cache = new WTinyLFUCache(100);
  await cache.putAndPromote("one", 1);
  await cache.putAndPromote("two", 2);
  assertEquals(cache.WLRU.get("one"), null);
  assertEquals(cache.SLRU.probationaryLRU.peek("one"), 1);
  assertEquals(cache.WLRU.get("two"), 2);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should promote items from probationaryLRU to the protectedLRU when accessed", async () => {
  const cache = new WTinyLFUCache(100);
  await cache.putAndPromote("one", 1);
  await cache.putAndPromote("two", 2);
  assertEquals(cache.SLRU.get("one"), 1);
  assertEquals(cache.SLRU.probationaryLRU.get("one"), null);
  assertEquals(cache.SLRU.protectedLRU.peek("one"), 1);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should demote items ejected from protectedLRU to probationary LRU", async () => {
  const cache = new WTinyLFUCache(100);
  cache.SLRU.protectedLRU.capacity = 1;
  cache.SLRU.protectedLRU.put("one", 1);
  await cache.SLRU.putAndDemote("two", 2);
  assertEquals(cache.SLRU.protectedLRU.get("one"), null);
  assertEquals(cache.SLRU.probationaryLRU.get("one"), 1);
  assertEquals(cache.SLRU.protectedLRU.get("two"), 2);
});

Deno.test({
  name:
    "WTinyLFU cache functionality - Window cache functionality - should move highest frequency item into full probationary cache",
  ignore: true,
  fn: async () => {
    const cache = new WTinyLFUCache(100);
    cache.SLRU.probationaryLRU.capacity = 1;
    await cache.putAndPromote("one", 1);
    await cache.putAndPromote("two", 2);
    assertEquals(cache.SLRU.probationaryLRU.get("one"), 1);
    // Access "one" multiple times to build up its frequency in the sketch
    // This simulates it being accessed more frequently than "two"
    for (let i = 0; i < 5; i++) {
      await cache.SLRU.get("one"); // Access "one" to increment its frequency
    }
    // Access "two" fewer times
    for (let i = 0; i < 2; i++) {
      await cache.WLRU.get("two"); // Access "two" to increment its frequency
    }
    await cache.putAndPromote("three", 3);
    assertEquals(cache.SLRU.probationaryLRU.get("one"), 1);
    assertEquals(cache.SLRU.probationaryLRU.get("two"), null);
    assertEquals(
      cache.SLRU.probationaryLRU.get("three"),
      null,
    );
    assertEquals(cache.WLRU.get("one"), null);
    assertEquals(cache.WLRU.get("two"), null);
    assertEquals(cache.WLRU.get("three"), 3);
  },
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should evict least recently used item from WLRU", async () => {
  const cache = new WTinyLFUCache(200);
  await cache.WLRU.put("one", 1);
  await cache.WLRU.put("two", 2);
  await cache.WLRU.put("three", 3);
  assertEquals(cache.WLRU.get("one"), null);
  assertEquals(cache.WLRU.get("two"), 2);
  assertEquals(cache.WLRU.get("three"), 3);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should evict least recently used item from ProbationaryLRU", async () => {
  const cache = new WTinyLFUCache(100);
  cache.SLRU.probationaryLRU.capacity = 2;
  await cache.SLRU.probationaryLRU.put("one", 1);
  await cache.SLRU.probationaryLRU.put("two", 2);
  await cache.SLRU.probationaryLRU.put("three", 3);
  assertEquals(cache.SLRU.probationaryLRU.get("one"), null);
  assertEquals(cache.SLRU.probationaryLRU.get("two"), 2);
  assertEquals(cache.SLRU.probationaryLRU.get("three"), 3);
});

Deno.test("WTinyLFU cache functionality - Window cache functionality - should evict least recently used item from ProtectedLRU", async () => {
  const cache = new WTinyLFUCache(100);
  cache.SLRU.protectedLRU.capacity = 2;
  await cache.SLRU.protectedLRU.put("one", 1);
  await cache.SLRU.protectedLRU.put("two", 2);
  await cache.SLRU.protectedLRU.put("three", 3);
  assertEquals(cache.SLRU.protectedLRU.get("one"), null);
  assertEquals(cache.SLRU.protectedLRU.get("two"), 2);
  assertEquals(cache.SLRU.protectedLRU.get("three"), 3);
});
