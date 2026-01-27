/** @format */

import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => any;

export function mapSelectionSet(query: string): string[] {
  // Gets fields from query and stores all in an array - used to selectively query cache
  const selectionKeysMap: Record<string, string> = {};
  const ast = gql(query);
  const selections = ast.definitions[0].selectionSet.selections;
  const tableName = selections[0].name.value;

  const recursiveMap = (recurseSelections: any[]): void => {
    for (const selection of recurseSelections) {
      if (selection.name && selection.name.value) {
        selectionKeysMap[selection.name.value] = selection.name.value;
      }
      if (selection.alias && selection.alias.value) {
        selectionKeysMap[selection.alias.value] = selection.name.value;
      }

      if (selection.selectionSet && selection.selectionSet.selections) {
        recursiveMap(selection.selectionSet.selections);
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
