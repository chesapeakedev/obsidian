import { ObsidianService } from "./src/Obsidian.ts";
import * as gqlModule from "npm:graphql-tag@^2.12.0";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => any;

// Server-side exports
export { gql, ObsidianService };

// Client-side exports
export {
  ObsidianClient,
  type ObsidianClientOptions,
  type QueryOptions,
  type MutationOptions,
  type GraphQLResponse,
  type CacheAlgorithm,
} from "./src/Client/ObsidianClient.ts";
