import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  addTypenamesToFieldsStr,
  findClosingBrace,
  insertTypenames,
} from "../../src/client/insertTypenames.ts";
import { test } from "../../_test_variables/client/insertTypenames_variables.ts";

Deno.test("insertTypenames.ts - insertTypenames() - should add __typenames meta field to every level of a graphql query", () => {
  const result = insertTypenames(test.singleQueryInput);
  assertEquals(result, test.singleQueryOutput);
});

Deno.test("insertTypenames.ts - insertTypenames() - should add __typenames meta field to every level of a graphql mutation", () => {
  const result = insertTypenames(test.singleMutationInput);
  assertEquals(result, test.singleMutationOutput);
});

Deno.test("insertTypenames.ts - insertTypenames() - should add __typenames meta field to every level of a graphql operation with multiple queries", () => {
  const result = insertTypenames(test.multipleQueriesInput);
  assertEquals(result, test.multipleQueriesOutput);
});

Deno.test("insertTypenames.ts - addTypenamesToFieldsStr() - should add __typenames meta field to every level of a field string", () => {
  const result = addTypenamesToFieldsStr(test.fieldsStrInput);
  assertEquals(result, test.fieldsStrOutput);
});

Deno.test("insertTypenames.ts - findClosingBrace() - should return the index of the matching closing brace", () => {
  const result = findClosingBrace("asdf{asasd}a", 4);
  assertEquals(result, 10);
});

Deno.test("insertTypenames.ts - findClosingBrace() - should return the index of the matching closing brace when there are other nested brace", () => {
  const result = findClosingBrace("asdf{as{{a}}sd}a", 4);
  assertEquals(result, 14);
});

Deno.test("insertTypenames.ts - insertTypenames() - should add __typenames meta field to graphql alias query", () => {
  const result = insertTypenames(test.newAliasTestQuery);
  assertEquals(result, test.newAliasTestResult);
});
