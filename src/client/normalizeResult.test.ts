import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import normalizeResult from "./normalizeResult.ts";
import { test } from "./normalizeResult.test.fixtures.ts";

Deno.test("normalize.ts - normalizeTestSuite - expected result to equal object with ROOT_QUERY and hash:value pairs", () => {
  const result = normalizeResult(test.queryObject1, test.resultObject1);
  assertEquals(result, test.resultObj1);
});

Deno.test("normalize.ts - normalizeAliasTestSuite - expected result to equal object with ROOT_QUERY and hash:value pairs", () => {
  const result = normalizeResult(
    test.aliasTestQueryObj,
    test.aliasTestResult,
  );
  assertEquals(result, test.aliasTestRootHash);
});
