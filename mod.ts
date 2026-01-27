// Server-side exports
import { ObsidianService } from "./src/server/Obsidian.ts";
import * as gqlModule from "graphql-tag";
import type { DocumentNode } from "graphql/language/ast";

// Vendored types from graphql-tag package
// Source: https://github.com/apollographql/graphql-tag/blob/main/src/index.ts
// Type definition source: /Users/mooch/Library/Caches/deno/npm/registry.npmjs.org/graphql-tag/2.12.6/lib/index.d.ts
// The gql function accepts template literal strings or regular strings
// and returns a DocumentNode from GraphQL
type GqlFunction = (
  literals: string | readonly string[],
  ...args: unknown[]
) => DocumentNode;

// Vendored type for the default export structure
// The default export is the gql function, but TypeScript sees it as a namespace type
// when imported via namespace import, so we need to cast through the function type
// Source: graphql-tag/lib/index.d.ts line 14: export default gql;
type GqlDefaultExport = GqlFunction;

// Cast is necessary because Deno's type system does not properly recognize that
// graphql-tag's default export is callable, so we explicitly cast to our vendored type
const gql = gqlModule.default as unknown as GqlDefaultExport;

export { gql, ObsidianService };
export type {
  ObsidianServiceOptions,
  ResolversProps,
} from "./src/server/Obsidian.ts";

// Client-side exports
export {
  type CacheAlgorithm,
  type GraphQLResponse,
  type MutationOptions,
  ObsidianClient,
  type ObsidianClientOptions,
  type QueryOptions,
} from "./src/client/ObsidianClient.ts";
