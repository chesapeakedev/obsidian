/**
 * Obsidian GraphQL Client
 * A TypeScript client for GraphQL queries and mutations with intelligent caching
 */

import LFUCache from "./cache/lfuCache.ts";
import LRUCache from "./cache/lruCache.ts";
import WTinyLFUCache from "./cache/wTinyLFUBrowserCache.ts";
import { insertTypenames } from "./insertTypenames.ts";

export type CacheAlgorithm = "LFU" | "LRU" | "W-TinyLFU";

export interface ObsidianClientOptions {
  /** GraphQL endpoint URL */
  endpoint?: string;
  /** Enable client-side caching */
  useCache?: boolean;
  /** Cache algorithm to use */
  algo?: CacheAlgorithm;
  /** Cache capacity */
  capacity?: number;
  /** Search terms for cache optimization */
  searchTerms?: string[];
  /** Enable persistent queries (send hash instead of full query) */
  persistQueries?: boolean;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}

export interface QueryOptions {
  /** GraphQL endpoint URL (overrides client default) */
  endpoint?: string;
  /** Read from cache */
  cacheRead?: boolean;
  /** Write to cache */
  cacheWrite?: boolean;
  /** Polling interval in milliseconds */
  pollInterval?: number | null;
  /** Use whole query for cache (currently non-functional) */
  wholeQuery?: boolean;
  /** Custom headers to include in request (merged with client default headers) */
  headers?: Record<string, string>;
}

export interface MutationOptions {
  /** GraphQL endpoint URL (overrides client default) */
  endpoint?: string;
  /** Write to cache */
  cacheWrite?: boolean;
  /** Delete flag for mutations */
  toDelete?: boolean;
  /** Update function for cache */
  update?: (
    cache: Record<string, unknown>,
    responseObj: Record<string, unknown>,
  ) => void;
  /** Write-through mode */
  writeThrough?: boolean;
  /** Custom headers to include in request (merged with client default headers) */
  headers?: Record<string, string>;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

/**
 * Obsidian GraphQL Client
 * Provides query and mutation methods with intelligent caching
 */
export class ObsidianClient {
  private endpoint: string;
  private caching: boolean;
  private cache: LFUCache | LRUCache | WTinyLFUCache | null;
  private searchTerms?: string[];
  private persistQueries: boolean;
  private defaultHeaders: Record<string, string>;
  private pollIntervals: Map<string, number> = new Map();

  constructor(options: ObsidianClientOptions = {}) {
    this.endpoint = options.endpoint || "/graphql";
    this.caching = options.useCache !== false;
    this.searchTerms = options.searchTerms;
    this.persistQueries = options.persistQueries || false;
    this.defaultHeaders = options.headers || {};

    // Initialize cache based on algorithm
    if (this.caching) {
      const capacity = options.capacity || 2000;
      const algo = options.algo || "LFU";

      if (algo === "LRU") {
        this.cache = new LRUCache(capacity);
      } else if (algo === "W-TinyLFU") {
        this.cache = new WTinyLFUCache(capacity);
      } else {
        this.cache = new LFUCache(capacity);
      }
    } else {
      this.cache = null;
    }
  }

  /**
   * Execute a GraphQL query
   */
  async query<T = unknown>(
    query: string,
    options: QueryOptions = {},
  ): Promise<GraphQLResponse<T>> {
    const startTime = Date.now();

    const {
      endpoint = this.endpoint,
      cacheRead = this.caching,
      cacheWrite = this.caching,
      pollInterval = null,
      wholeQuery = false,
    } = options;

    // Handle polling
    if (pollInterval) {
      const intervalId = setInterval(() => {
        this.query(query, {
          pollInterval: null,
          cacheRead: false,
          ...options,
        });
      }, pollInterval);
      this.pollIntervals.set(query, intervalId as unknown as number);
      return Promise.resolve({} as GraphQLResponse<T>);
    }

    // Try cache read if enabled
    if (cacheRead && this.caching && this.cache) {
      let resObj;
      if (wholeQuery && "readWholeQuery" in this.cache) {
        const cacheWithWholeQuery = this.cache as {
          readWholeQuery: (query: string) => unknown;
        };
        resObj = cacheWithWholeQuery.readWholeQuery(query);
      } else {
        resObj = await this.cache.read(query);
      }

      if (resObj) {
        const _cacheHitResponseTime = Date.now() - startTime;
        return Promise.resolve(resObj);
      }
    }

    // Cache miss or cache disabled - execute query
    return this.hunt<T>(
      query,
      endpoint,
      cacheWrite,
      wholeQuery,
      startTime,
      options.headers,
    );
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate<T = unknown>(
    mutation: string,
    options: MutationOptions = {},
  ): Promise<GraphQLResponse<T>> {
    const _startTime = Date.now();
    const mutationWithTypenames = insertTypenames(mutation);

    const {
      endpoint = this.endpoint,
      cacheWrite = this.caching,
      toDelete = false,
      update = null,
      writeThrough = true,
    } = options;

    try {
      const mutationHeaders = options.headers;

      if (!writeThrough) {
        // Write-through mode: update cache optimistically
        if (toDelete) {
          // For deletions, we'd need writeThrough method on cache
          // Since it's not implemented, fall back to normal flow
          const responseObj = await this.executeMutation<T>(
            mutationWithTypenames,
            endpoint,
            mutationHeaders,
          );
          if (cacheWrite && this.cache && responseObj.data) {
            const firstKey = Object.keys(responseObj.data)[0];
            const firstValue =
              (responseObj.data as Record<string, unknown>)[firstKey];
            if (firstValue !== null) {
              await this.cache.write(
                mutationWithTypenames,
                responseObj,
                this.searchTerms,
                true,
              );
            }
          }
          return responseObj;
        } else {
          // For add/update mutations
          const responseObj = await this.executeMutation<T>(
            mutationWithTypenames,
            endpoint,
            mutationHeaders,
          );
          if (update && this.cache) {
            update(
              this.cache as unknown as Record<string, unknown>,
              responseObj as unknown as Record<string, unknown>,
            );
          }
          if (cacheWrite && this.cache && responseObj.data) {
            const firstKey = Object.keys(responseObj.data)[0];
            const firstValue =
              (responseObj.data as Record<string, unknown>)[firstKey];
            if (firstValue !== null) {
              await this.cache.write(
                mutationWithTypenames,
                responseObj,
                this.searchTerms,
              );
            }
          }
          return responseObj;
        }
      } else {
        // Normal mode: execute mutation then update cache
        const responseObj = await this.executeMutation<T>(
          mutationWithTypenames,
          endpoint,
          mutationHeaders,
        );

        if (!cacheWrite || !this.caching || !this.cache) {
          return responseObj;
        }

        // Handle deletion
        if (toDelete) {
          await this.cache.write(
            mutationWithTypenames,
            responseObj,
            this.searchTerms,
            true,
          );
          return responseObj;
        }

        // Handle update function
        if (update) {
          update(
            this.cache as unknown as Record<string, unknown>,
            responseObj as unknown as Record<string, unknown>,
          );
        }

        // Write to cache if no errors
        if (!responseObj.errors && responseObj.data) {
          const firstKey = Object.keys(responseObj.data)[0];
          const firstValue =
            (responseObj.data as Record<string, unknown>)[firstKey];
          if (firstValue !== null) {
            await this.cache.write(
              mutationWithTypenames,
              responseObj,
              this.searchTerms,
            );
          }
        }

        return responseObj;
      }
    } catch (e) {
      console.error("Mutation error:", e);
      throw e;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    if (this.cache && "cacheClear" in this.cache) {
      this.cache.cacheClear();
    }
  }

  /**
   * Stop polling for a specific query
   */
  stopPolling(query: string): void {
    const intervalId = this.pollIntervals.get(query);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollIntervals.delete(query);
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    for (const intervalId of this.pollIntervals.values()) {
      clearInterval(intervalId);
    }
    this.pollIntervals.clear();
  }

  /**
   * Internal method to execute a query (cache miss or cache disabled)
   */
  private async hunt<T>(
    query: string,
    endpoint: string,
    cacheWrite: boolean,
    wholeQuery: boolean,
    startTime: number,
    customHeaders?: Record<string, string>,
  ): Promise<GraphQLResponse<T>> {
    const queryWithTypenames = wholeQuery ? query : insertTypenames(query);

    // Merge default headers with custom headers
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.defaultHeaders,
      ...customHeaders,
    };

    try {
      let resJSON: Response;

      // Handle persistent queries
      if (this.persistQueries) {
        const encoder = new TextEncoder();
        const data = encoder.encode(queryWithTypenames);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        resJSON = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ hash }),
        });

        // If hash not found, send query with hash
        if (resJSON.status === 204) {
          resJSON = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ hash, query: queryWithTypenames }),
          });
        }
      } else {
        // Normal query
        resJSON = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: queryWithTypenames }),
        });
      }

      const resObj: GraphQLResponse<T> = await resJSON.json();
      const deepResObj = { ...resObj };

      // Write to cache if enabled
      if (
        cacheWrite &&
        this.caching &&
        this.cache &&
        resObj.data &&
        Object.keys(resObj.data).length > 0
      ) {
        const firstKey = Object.keys(resObj.data)[0];
        const firstValue = (resObj.data as Record<string, unknown>)[firstKey];
        if (firstValue !== null) {
          if (wholeQuery && "writeWholeQuery" in this.cache) {
            this.cache.writeWholeQuery(queryWithTypenames, deepResObj);
          } else {
            const dataLength = Array.isArray(firstValue)
              ? firstValue.length
              : 1;
            if (dataLength > this.cache.capacity) {
              console.warn(
                "Cache capacity exceeded. Please increase cache capacity.",
              );
            } else {
              await this.cache.write(
                queryWithTypenames,
                deepResObj,
                this.searchTerms,
              );
            }
          }
        }
      }

      const cacheMissResponseTime = Date.now() - startTime;
      console.log(cacheMissResponseTime);

      return resObj;
    } catch (e) {
      console.error("Query error:", e);
      throw e;
    }
  }

  /**
   * Internal method to execute a mutation
   */
  private async executeMutation<T>(
    mutation: string,
    endpoint: string,
    customHeaders?: Record<string, string>,
  ): Promise<GraphQLResponse<T>> {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.defaultHeaders,
      ...customHeaders,
    };

    const resJSON = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: mutation }),
    });

    return await resJSON.json();
  }
}
