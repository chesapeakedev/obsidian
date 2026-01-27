import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import queryDepthLimiter from "../../src/server/DoSSecurity.ts";
import { test } from "../../_test_variables/server/DoSSecurity_variables.ts";

Deno.test("DoSSecurity.ts - Query depth limit NOT exceeded tests - Test query depth of 2 does not exceed allowable depth 2", () => {
  const results = queryDepthLimiter(test.DEPTH_2_QUERY, 2);
  assertEquals(undefined, results);
});

Deno.test("DoSSecurity.ts - Query depth limit NOT exceeded tests - Test mutation depth of 2 does not exceed allowable depth of 2", () => {
  const results = queryDepthLimiter(test.DEPTH_2_MUTATION, 2);
  assertEquals(undefined, results);
});

Deno.test("DoSSecurity.ts - Query/mutation depth limit IS EXCEEDED tests - Test query depth 2 should exceed depth limit of 1", () => {
  assertThrows(
    () => {
      queryDepthLimiter(test.DEPTH_2_QUERY, 1);
    },
    Error,
    "Security Error: Query depth exceeded maximum query depth limit",
  );
});

Deno.test("DoSSecurity.ts - Query/mutation depth limit IS EXCEEDED tests - Test mutation depth 2 should exceed depth limit of 1", () => {
  assertThrows(
    () => {
      queryDepthLimiter(test.DEPTH_2_MUTATION, 1);
    },
    Error,
    "Security Error: Query depth exceeded maximum mutation depth limit",
  );
});

Deno.test("DoSSecurity.ts - Query depth limit NOT exceeded, multiple query tests - Test multiple queries of depth 2 should not exceed allowable depth 2", () => {
  const results = queryDepthLimiter(test.MULTIPLE_DEPTH_2_QUERY, 2);
  assertEquals(undefined, results);
});

Deno.test("DoSSecurity.ts - Query depth limit NOT exceeded, multiple query tests - Test multiple mutations of depth 2 should not exceed allowable depth 2", () => {
  const results = queryDepthLimiter(test.MULTIPLE_DEPTH_2_MUTATION, 2);
  assertEquals(undefined, results);
});

Deno.test("DoSSecurity.ts - Multiple query/mutation depth limit IS EXCEEDED tests - Test multiple query depth should be exceeded", () => {
  assertThrows(
    () => {
      queryDepthLimiter(test.MULTIPLE_DEPTH_2_QUERY, 1);
    },
    Error,
    "Security Error: Query depth exceeded maximum query depth limit",
  );
});

Deno.test("DoSSecurity.ts - Multiple query/mutation depth limit IS EXCEEDED tests - Test multiple mutation depth should be exceeded", () => {
  assertThrows(
    () => {
      queryDepthLimiter(test.MULTIPLE_DEPTH_2_MUTATION, 1);
    },
    Error,
    "Security Error: Query depth exceeded maximum mutation depth limit",
  );
});
