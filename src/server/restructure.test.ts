import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { restructure } from "./restructure.ts";
import { test } from "./restructure.test.fixtures.ts";
import * as gqlModule from "npm:graphql-tag@^2.12.0";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => unknown;
import { type ASTNode, print } from "npm:graphql@^15.0.0";

Deno.test("restructure.ts - restructure fragment test - restructure fragment test - no fragments", () => {
  const result = restructure(test.fragmentTestData0);
  assertEquals(
    result,
    print(gql(test.fragmentResultData0) as ASTNode),
  );
});

Deno.test("restructure.ts - restructure fragment test - restructure fragment test - results in two seperate queries", () => {
  const result = restructure(test.fragmentTestData);
  assertEquals(
    result,
    print(gql(test.fragmentResultData) as ASTNode),
  );
});

Deno.test("restructure.ts - restructure fragment test - restructure fragment test - result in one query", () => {
  const result = restructure(test.fragmentTestData2);
  assertEquals(
    result,
    print(gql(test.fragmentResultData2) as ASTNode),
  );
});

Deno.test("restructure.ts - restructure fragment test - restructure fragment test - nested fragments", () => {
  const fragmentData = test.fragmentTestData3 as { query: string };
  const result = restructure(fragmentData);
  assertEquals(
    result,
    print(gql(fragmentData.query) as ASTNode),
  );
});

Deno.test("restructure.ts - restructure single variable query tests - restructure single variable query string", () => {
  const result = restructure(
    test.singleVariableTestData,
  );
  assertEquals(
    result,
    print(gql(test.singleVariableTestResult) as ASTNode),
  );
});

Deno.test("restructure.ts - restructure multi variable query test - restructure multi variable query", () => {
  const result = restructure(
    test.multiVariableTestData,
  );
  assertEquals(
    result,
    print(gql(test.multiVariableTestResult) as ASTNode),
  );
});
