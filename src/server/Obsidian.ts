import { graphql } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { renderPlaygroundPage } from "graphql-playground-html";
import { Cache } from "./cache/quickCache.ts";
import queryDepthLimiter from "./DoSSecurity.ts";
import { restructure } from "./restructure.ts";
import { type GenericObject, normalizeObject } from "./normalize.ts";
import { invalidateCache, isMutation } from "./invalidateCacheCheck.ts";
import { mapSelectionSet as _mapSelectionSet } from "./mapSelections.ts";
import { HashTable } from "./queryHash.ts";

export interface ObsidianServiceOptions {
  path?: string;
  typeDefs: unknown;
  resolvers: ResolversProps;
  context?: (req: Request) => unknown | Promise<unknown>;
  usePlayground?: boolean;
  useCache?: boolean;
  redisPort?: number;
  policy?: string;
  maxmemory?: string;
  searchTerms?: string[];
  persistQueries?: boolean;
  hashTableSize?: number;
  maxQueryDepth?: number;
  customIdentifier?: string[];
  mutationTableMap?: Record<string, unknown>; // Deno recommended type name
}

export interface ResolversProps {
  Query?: unknown;
  Mutation?: unknown;
  [dynamicProperty: string]: unknown;
}

// Export developer chosen port for redis database connection //
export const redisPortExport: number = 6379;

// tentative fix to get invalidateCacheCheck.ts access to the cache;
export const scope: Record<string, unknown> = {};

/**
 * Creates an HTTP handler function for GraphQL requests using Deno's built-in HTTP server
 * @param options Configuration options for the Obsidian Service
 * @returns A handler function that can be used with Deno.serve
 */
export function ObsidianService({
  path = "/graphql",
  typeDefs,
  resolvers,
  context,
  usePlayground = false,
  useCache = true, // default to true
  redisPort = 6379,
  policy = "allkeys-lru",
  maxmemory = "2000mb",
  searchTerms = [], // Developer can pass in array of search categories
  persistQueries = false, // default to false
  hashTableSize = 16, // default to 16
  maxQueryDepth = 0,
  customIdentifier = ["__typename", "_id"],
  mutationTableMap = {}, // Developer passes in object where keys are add mutations and values are arrays of affected tables
}: ObsidianServiceOptions): (req: Request) => Promise<Response> {
  const schema = makeExecutableSchema({
    typeDefs: typeDefs as Parameters<
      typeof makeExecutableSchema
    >[0]["typeDefs"],
    resolvers: resolvers as Parameters<
      typeof makeExecutableSchema
    >[0]["resolvers"],
  });

  let cache: Cache | undefined;
  let hashTable: HashTable | undefined;
  if (useCache) {
    cache = new Cache();
    scope.cache = cache;
    cache.connect(redisPort, policy, maxmemory);
  }
  if (persistQueries) {
    hashTable = new HashTable(hashTableSize);
  }

  // Return handler function for Deno.serve
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    // Only handle requests to the configured path
    if (url.pathname !== path) {
      return new Response("Not Found", { status: 404 });
    }

    // Handle POST requests (GraphQL queries/mutations)
    if (req.method === "POST") {
      try {
        let queryStr;
        let body: Record<string, unknown> = {};

        // Parse request body
        if (req.body) {
          body = await req.json();
        } else {
          return new Response("Request body required", { status: 400 });
        }

        if (persistQueries && body.hash && !body.query) {
          const { hash } = body;
          queryStr = hashTable!.get(hash as string);
          // if not found in hash table, respond so we can send full query.
          if (!queryStr) {
            return new Response(null, { status: 204 });
          }
        } else if (persistQueries && body.hash && body.query) {
          const { hash, query } = body;
          hashTable!.add(hash as string, query as string);
          queryStr = query as string;
        } else if (persistQueries && !body.hash) {
          throw new Error(
            "Unable to process request because hashed query was not provided",
          );
        } else if (!persistQueries) {
          queryStr = body.query as string;
        } else {
          throw new Error(
            "Unable to process request because query argument not provided",
          );
        }

        const contextResult = context ? await context(req) : undefined;
        // const selectedFields = mapSelectionSet(queryStr); // Gets requested fields from query and saves into an array
        if (maxQueryDepth) queryDepthLimiter(queryStr as string, maxQueryDepth); // If a securty limit is set for maxQueryDepth, invoke queryDepthLimiter, which throws error if query depth exceeds maximum
        const restructuredQuery = restructure({ query: queryStr as string }); // Restructure gets rid of variables and fragments from the query

        // IF WE ARE USING A CACHE
        if (useCache && cache) {
          const cacheQueryValue = await cache.read(queryStr as string); // Parses query string into query key and checks cache for that key

          // ON CACHE MISS
          if (!cacheQueryValue) {
            // QUERY THE DATABASE
            const gqlResponse = await (graphql as (
              schema: unknown,
              source: string,
              rootValue?: unknown,
              contextValue?: unknown,
              variableValues?: unknown,
              operationName?: string,
            ) => Promise<unknown>)(
              schema,
              queryStr as string,
              resolvers,
              contextResult,
              body.variables || undefined,
              typeof body.operationName === "string"
                ? body.operationName
                : undefined,
            );

            // customIdentifier is a default param for Obsidian Service - defaults to ['__typename', '_id]
            const normalizedGQLResponse = normalizeObject( // Recursively flattens an arbitrarily nested object into an objects with hash key and hashable object pairs
              gqlResponse as GenericObject,
              customIdentifier,
            );

            // If operation is mutation, invalidate relevant responses in cache
            if (restructuredQuery && isMutation({ query: restructuredQuery })) {
              invalidateCache(
                normalizedGQLResponse as { [key: string]: object },
                queryStr as string,
                mutationTableMap,
              );
              // ELSE, simply write to the cache
            } else {
              await cache.write(
                queryStr as string,
                normalizedGQLResponse,
                searchTerms,
              );
            }
            // AFTER HANDLING THE CACHE, RETURN THE ORIGINAL RESPONSE
            return new Response(JSON.stringify(gqlResponse), {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            });
            // ON CACHE HIT
          } else {
            return new Response(JSON.stringify(cacheQueryValue), {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            });
          }
          // IF NOT USING A CACHE
        } else {
          // DIRECTLY QUERY THE DATABASE
          const gqlResponse = await (graphql as (
            schema: unknown,
            source: string,
            rootValue?: unknown,
            contextValue?: unknown,
            variableValues?: unknown,
            operationName?: string,
          ) => Promise<unknown>)(
            schema,
            queryStr as string,
            resolvers,
            contextResult,
            body.variables || undefined,
            typeof body.operationName === "string"
              ? body.operationName
              : undefined,
          );

          return new Response(JSON.stringify(gqlResponse), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : String(error);
        const errorResponse = {
          data: null,
          errors: [
            {
              message: errorMessage,
            },
          ],
        };
        console.error("Error: ", errorMessage);
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }
    }

    // Handle GET requests (GraphQL Playground)
    if (req.method === "GET" && usePlayground) {
      const acceptHeader = req.headers.get("accept") || "";
      const prefersHTML = acceptHeader.includes("text/html");

      if (prefersHTML) {
        const optionsObj: Record<string, unknown> = {
          "schema.polling.enable": false, // enables automatic schema polling
        };

        const playground = renderPlaygroundPage({
          endpoint: url.origin + path,
          subscriptionEndpoint: url.origin,
          settings: optionsObj,
        });

        return new Response(playground, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }
    }

    // Method not allowed
    return new Response("Method Not Allowed", { status: 405 });
  };
}
