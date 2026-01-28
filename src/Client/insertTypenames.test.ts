import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  addTypenamesToFieldsStr,
  findClosingBrace,
  insertTypenames,
} from "./insertTypenames.ts";

// Test fixtures
const test = {
  singleQueryInput: `
  query AllActionMoviesAndAllActors {
    movies(input: { genre: ACTION }) {
      __typename
      id
      title
      genre
      actors {
        id
        firstName
        lastName
      }
    }
  }
  }`,

  singleQueryOutput:
    "query AllActionMoviesAndAllActors { movies(input: { genre: ACTION }) { __typename id title genre actors { __typename  id firstName lastName } } } }",

  singleMutationInput: `
  mutation AllActionMoviesAndAllActors {
    movies(input: { genre: ACTION }) {
      id
      title
      genre
      actors {
        id
        firstName
        lastName
      }
    }
  }
  }`,

  singleMutationOutput:
    "mutation AllActionMoviesAndAllActors { movies(input: { genre: ACTION }) { __typename  id title genre actors { __typename  id firstName lastName } } } }",

  multipleQueriesInput: `
  query AllActionMoviesAndAllActors {
    movies(input: { genre: ACTION }) {
      __typename
      id
      title
      genre
      actors {
        id
        firstName
        lastName
      }
    }
    actors {
      id
      firstName
      lastName
      films {
        __typename
        id
        title
      }
    }
  }
  }`,

  multipleQueriesOutput:
    "query AllActionMoviesAndAllActors { movies(input: { genre: ACTION }) { __typename id title genre actors { __typename  id firstName lastName } } actors { __typename  id firstName lastName films { __typename id title } } } }",

  fieldsStrInput:
    "{ __typename id title genre actors { id firstName lastName } }",
  fieldsStrOutput:
    "{ __typename id title genre actors { __typename  id firstName lastName } }",

  newAliasTestQuery: `
    query twoHeros {
      empireHero: hero(episode: EMPIRE) {
        name
      }
      jediHero: hero(episode: JEDI) {
        name
      }
    }`,

  newAliasTestResult:
    `query twoHeros { empireHero: hero(episode: EMPIRE) { __typename  name } jediHero: hero(episode: JEDI) { __typename  name } }`,
};

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
