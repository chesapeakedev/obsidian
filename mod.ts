import { ObsidianService } from "./src/Obsidian.ts";
import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => any;

// Server-side exports
export { gql, ObsidianService };

// Client-side exports
export {
  type CacheAlgorithm,
  type GraphQLResponse,
  type MutationOptions,
  ObsidianClient,
  type ObsidianClientOptions,
  type QueryOptions,
} from "./src/Client/ObsidianClient.ts";
