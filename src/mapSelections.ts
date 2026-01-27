/** @format */

import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => unknown;

export function mapSelectionSet(query: string): string[] {
  // Gets fields from query and stores all in an array - used to selectively query cache
  const selectionKeysMap: Record<string, string> = {};
  const ast = gql(query) as {
    definitions: Array<{
      selectionSet: { selections: Array<Record<string, unknown>> };
    }>;
  };
  const selections = ast.definitions[0].selectionSet.selections;
  const tableName = (selections[0].name as { value: string }).value;

  const recursiveMap = (recurseSelections: unknown[]): void => {
    for (const selection of recurseSelections) {
      const sel = selection as Record<string, unknown>;
      if (sel.name && (sel.name as { value: string }).value) {
        selectionKeysMap[(sel.name as { value: string }).value] =
          (sel.name as { value: string }).value;
      }
      if (sel.alias && (sel.alias as { value: string }).value) {
        selectionKeysMap[(sel.alias as { value: string }).value] =
          (sel.name as { value: string }).value;
      }

      if (
        sel.selectionSet &&
        (sel.selectionSet as { selections: unknown[] }).selections
      ) {
        recursiveMap(
          (sel.selectionSet as { selections: unknown[] }).selections,
        );
      }
    }
  };
  recursiveMap(selections);

  // filter out table name from array, leaving only fields
  const selectedFields = Object.keys(selectionKeysMap).filter(
    (key) => key !== tableName,
  );
  return selectedFields;
}
