import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import destructureQueries, {
  createQueriesObj,
  findClosingBrace,
  findQueryFields,
  findQueryStrings,
} from "./destructure.ts";
import { test } from "./destructure.test.fixtures.ts";

Deno.test("destructure.ts - destructure helper function tests - findQueryStrings test", () => {
  const results = findQueryStrings(test.findQueryStringsTestData);
  assertEquals(test.findQueryStringsResultData, results);
});

Deno.test("destructure.ts - destructure helper function tests - createQueriesObj test", () => {
  const results = createQueriesObj(
    test.createQueriesObjTestData,
    "queries",
  );
  assertEquals(test.createQueriesObjResultsData, results);
});

Deno.test("destructure.ts - destructure helper function tests - findQueryFields test", () => {
  const results = findQueryFields(test.findQueryFieldsTestData);
  assertEquals(test.findQueryFieldsResultData, results);
});

Deno.test("destructure.ts - destructure helper function tests - findClosingBrace test", () => {
  const results = findClosingBrace(test.findClosingBraceTestData, 62);
  assertEquals(test.findClosingBraceResultData, results);
});

Deno.test("destructure.ts - destructure single query tests - destructure single query string - no inputs", () => {
  const result = destructureQueries(test.ALL_ACTORS);
  assertEquals(test.allActorsTestResult, result);
});

Deno.test("destructure.ts - destructure single query tests - destructure single query string - inputs", () => {
  const result = destructureQueries(test.ALL_ACTION_MOVIES);
  assertEquals(test.allActionTestResult, result);
});

Deno.test("destructure.ts - destructure multi query tests - destructure multi query - input / non input", () => {
  const result = destructureQueries(test.ALL_ACTION_MOVIES_AND_ALL_ACTORS);
  assertEquals(test.allActionActorsTestResult, result);
});

Deno.test("destructure.ts - destructure alias query tests - destructure multi alias query - input / non input", () => {
  const result = destructureQueries(test.newAliasTestQuery);
  assertEquals(test.newAliasTestResult, result);
});

Deno.test("destructure.ts - destructure fragment tests - destructure fragment tests - results in two seperate queries", () => {
  const result = destructureQueries(test.fragmentTestData);
  assertEquals(test.fragmentResultData, result);
});

Deno.test("destructure.ts - destructure fragment tests - destructure fragment tests - results in one query", () => {
  const result = destructureQueries(test.fragmentTestData2);
  assertEquals(test.fragmentResultData2, result);
});

Deno.test("destructure.ts - destructure fragment tests - destructure fragment tests - nested fragments", () => {
  const result = destructureQueries(test.fragmentTestData3);
  assertEquals(test.fragmentResultData3, result);
});

Deno.test("destructure.ts - destructure single variable query tests - destructure single variable query string", () => {
  const result = destructureQueries(
    test.singleVariableTestData,
    test.singleVariableTestValue,
  );
  assertEquals(test.singleVariableTestResult, result);
});

Deno.test("destructure.ts - destructure multi variable query tests - destructure multi variable query", () => {
  const result = destructureQueries(
    test.multiVariableTestData,
    test.multiVariableTestValue,
  );
  assertEquals(test.multiVariableTestResult, result);
});

Deno.test("destructure.ts - destructure @include directive query tests - destructure @include directive (true) query", () => {
  const result = destructureQueries(
    test.includeDirectiveTestData,
    test.includeDirectiveTrueValues,
  );
  assertEquals(test.includeDirectiveTrueResult, result);
});

Deno.test("destructure.ts - destructure @include directive query tests - destructure @include directive (false) query", () => {
  const result = destructureQueries(
    test.includeDirectiveTestData,
    test.includeDirectiveFalseValues,
  );
  assertEquals(test.includeDirectiveFalseResult, result);
});

Deno.test("destructure.ts - destructure @skip directive query tests - destructure @skip directive (true) query", () => {
  const result = destructureQueries(
    test.skipDirectiveTestData,
    test.skipDirectiveTrueValues,
  );
  assertEquals(test.skipDirectiveTrueResult, result);
});

Deno.test("destructure.ts - destructure @skip directive query tests - destructure @skip directive (false) query", () => {
  const result = destructureQueries(
    test.skipDirectiveTestData,
    test.skipDirectiveFalseValues,
  );
  assertEquals(test.skipDirectiveFalseResult, result);
});
