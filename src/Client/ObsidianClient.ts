/**
 * Obsidian GraphQL Client
 * A TypeScript client for GraphQL queries and mutations with intelligent caching
 */

import LFUCache from "./cache/lfuCache.ts";
import LRUCache from "./cache/lruCache.ts";
import WTinyLFUCache from "./cache/wTinyLFUBrowserCache.ts";
import { insertTypenames } from "./insertTypenames.ts";

export type CacheAlgorithm = "LFU" | "LRU" | "W-TinyLFU";

export interface BeforeFetchRequest {
  url: string;
  options: RequestInit;
}

export interface AuthError {
  status: number;
  response: Response;
  graphqlErrors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

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
  /**
   * Callback to modify request before fetch (e.g., add auth headers)
   * @param request - The request object with url and options
   * @returns Modified RequestInit options or Promise resolving to RequestInit
   */
  beforeFetch?: (
    request: BeforeFetchRequest,
  ) => RequestInit | Promise<RequestInit>;
  /**
   * Callback invoked when authentication errors occur (401/403 HTTP status or GraphQL auth errors)
   * @param error - Error object containing status, response, and optional GraphQL errors
   */
  onAuthError?: (error: AuthError) => void | Promise<void>;
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
  /**
   * GraphQL variables for parameterized queries.
   * Variables are included in cache keys to prevent collisions between queries with different variable values.
   *
   * @example
   * ```typescript
   * await client.query(
   *   `query GetRepo($owner: String!, $name: String!) { ... }`,
   *   { variables: { owner: "denoland", name: "deno" } }
   * );
   * ```
   */
  variables?: Record<string, unknown>;
  /**
   * HTTP method to use for the request.
   * Defaults to "POST". GET requests encode the query in the URL query string.
   * Note: GET requests have limitations (URL length, no mutations, etc.)
   *
   * @default "POST"
   */
  method?: "GET" | "POST";
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
  /**
   * GraphQL variables for parameterized mutations.
   * Variables are included in cache keys to prevent collisions between mutations with different variable values.
   *
   * @example
   * ```typescript
   * await client.mutate(
   *   `mutation AddRepo($name: String!) { ... }`,
   *   { variables: { name: "my-repo" } }
   * );
   * ```
   */
  variables?: Record<string, unknown>;
}

/**
 * GraphQL response format following the GraphQL specification.
 *
 * **Important**: Always check both `data` and `errors` properties:
 * - `data` may be present even if `errors` exist (partial results)
 * - `errors` may be present even if `data` exists (partial failures)
 * - Both may be undefined/null in edge cases
 *
 * @example
 * ```typescript
 * const response = await client.query<MyType>(query);
 * if (response.errors) {
 *   console.error("GraphQL errors:", response.errors);
 * }
 * if (response.data) {
 *   console.log("Data:", response.data);
 * }
 * ```
 */
export interface GraphQLResponse<T = unknown> {
  /** Response data, typed to the expected response shape */
  data?: T;
  /** Array of GraphQL errors (validation, execution, or auth errors) */
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

/**
 * Generate a cache key that includes both query string and variables
 * This ensures queries with different variables get different cache entries
 */
function createCacheKey(
  query: string,
  variables?: Record<string, unknown>,
): string {
  if (!variables || Object.keys(variables).length === 0) {
    return query;
  }
  // Sort variables by key for consistent cache keys
  const sortedVars = Object.keys(variables)
    .sort()
    .reduce((acc, key) => {
      acc[key] = variables[key];
      return acc;
    }, {} as Record<string, unknown>);
  return `${query}|${JSON.stringify(sortedVars)}`;
}

/**
 * Obsidian GraphQL Client
 *
 * Provides query and mutation methods with intelligent caching.
 *
 * **Request Method**: Defaults to POST for all requests. GET is supported for queries (via `method` option),
 * but POST is recommended and required for mutations. GitHub API requires POST for all operations.
 *
 * **Response Handling**: Responses follow the GraphQL spec format `{ data?, errors? }`.
 * Always check both properties as partial results/errors are possible.
 *
 * **Variables Support**: Use the `variables` option in `query()` and `mutate()` to pass
 * parameterized values. Variables are automatically included in cache keys to prevent collisions.
 *
 * **Authentication**:
 * - Set static headers via constructor `headers` option
 * - Use `beforeFetch` callback for dynamic header injection (e.g., token refresh)
 * - Use `onAuthError` callback to handle 401/403 HTTP status codes or GraphQL auth errors
 *
 * @example
 * ```typescript
 * const client = new ObsidianClient({
 *   endpoint: "/graphql",
 *   headers: { Authorization: "Bearer token" },
 *   beforeFetch: (req) => ({ ...req.options, headers: {...} }),
 *   onAuthError: (error) => console.error("Auth failed:", error.status),
 * });
 *
 * const response = await client.query(
 *   `query GetRepo($owner: String!) { ... }`,
 *   { variables: { owner: "denoland" } }
 * );
 * ```
 */
export class ObsidianClient {
  private endpoint: string;
  private caching: boolean;
  private cache: LFUCache | LRUCache | WTinyLFUCache | null;
  private searchTerms?: string[];
  private persistQueries: boolean;
  private defaultHeaders: Record<string, string>;
  private pollIntervals: Map<string, number> = new Map();
  private beforeFetch?: (
    request: BeforeFetchRequest,
  ) => RequestInit | Promise<RequestInit>;
  private onAuthError?: (error: AuthError) => void | Promise<void>;
  /** Protected property to store last response for subclasses (e.g., rate limit tracking) */
  protected lastResponse: Response | null = null;

  constructor(options: ObsidianClientOptions = {}) {
    this.endpoint = options.endpoint || "/graphql";
    this.caching = options.useCache !== false;
    this.searchTerms = options.searchTerms;
    this.persistQueries = options.persistQueries || false;
    this.defaultHeaders = options.headers || {};
    this.beforeFetch = options.beforeFetch;
    this.onAuthError = options.onAuthError;

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
   * @param query - GraphQL query string (may include variables like $owner, $name)
   * @param options - Query options including variables, cache settings, etc.
   * @returns Promise resolving to GraphQL response with data and/or errors
   *
   * @example
   * ```typescript
   * const response = await client.query(
   *   `query GetRepo($owner: String!, $name: String!) {
   *     repository(owner: $owner, name: $name) { name }
   *   }`,
   *   { variables: { owner: "denoland", name: "deno" } }
   * );
   * ```
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
      variables,
      method = "POST",
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
      // Double cast necessary: Deno's setInterval returns Timer type, not number.
      // We store it in Map<string, number> for compatibility with clearInterval which
      // accepts both Timer and number. This is a Deno-specific type system limitation.
      this.pollIntervals.set(query, intervalId as unknown as number);
      return Promise.resolve({} as GraphQLResponse<T>);
    }

    // Try cache read if enabled
    if (cacheRead && this.caching && this.cache) {
      const cacheKey = createCacheKey(query, variables);
      let resObj;
      if (wholeQuery && "readWholeQuery" in this.cache) {
        const cacheWithWholeQuery = this.cache as {
          readWholeQuery: (query: string) => unknown;
        };
        resObj = cacheWithWholeQuery.readWholeQuery(cacheKey);
      } else {
        resObj = await this.cache.read(cacheKey);
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
      variables,
      method,
    );
  }

  /**
   * Execute a GraphQL mutation
   * @param mutation - GraphQL mutation string (may include variables)
   * @param options - Mutation options including variables, cache settings, etc.
   * @returns Promise resolving to GraphQL response with data and/or errors
   *
   * @example
   * ```typescript
   * const response = await client.mutate(
   *   `mutation AddRepo($name: String!) {
   *     addRepository(name: $name) { id name }
   *   }`,
   *   { variables: { name: "my-repo" } }
   * );
   * ```
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
      variables,
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
            variables,
          );
          if (cacheWrite && this.cache && responseObj.data) {
            const firstKey = Object.keys(responseObj.data)[0];
            const firstValue =
              (responseObj.data as Record<string, unknown>)[firstKey];
            if (firstValue !== null) {
              const cacheKey = createCacheKey(mutationWithTypenames, variables);
              await this.cache.write(
                cacheKey,
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
            variables,
          );
          if (update && this.cache) {
            // Double cast necessary: this.cache is LFUCache | LRUCache | WTinyLFUCache,
            // but update function expects Record<string, unknown>. Cache classes don't
            // implement this interface directly. responseObj is GraphQLResponse<T> with
            // a data property, but update expects Record<string, unknown>. We cast to
            // satisfy the function signature while maintaining runtime compatibility.
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
              const cacheKey = createCacheKey(mutationWithTypenames, variables);
              await this.cache.write(
                cacheKey,
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
          variables,
        );

        if (!cacheWrite || !this.caching || !this.cache) {
          return responseObj;
        }

        // Handle deletion
        if (toDelete) {
          const cacheKey = createCacheKey(mutationWithTypenames, variables);
          await this.cache.write(
            cacheKey,
            responseObj,
            this.searchTerms,
            true,
          );
          return responseObj;
        }

        // Handle update function
        if (update) {
          // Double cast necessary: this.cache is LFUCache | LRUCache | WTinyLFUCache,
          // but update function expects Record<string, unknown>. Cache classes don't
          // implement this interface directly. responseObj is GraphQLResponse<T> with
          // a data property, but update expects Record<string, unknown>. We cast to
          // satisfy the function signature while maintaining runtime compatibility.
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
            const cacheKey = createCacheKey(mutationWithTypenames, variables);
            await this.cache.write(
              cacheKey,
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
   * Protected to allow subclasses to override for additional functionality (e.g., rate limit tracking)
   */
  protected async hunt<T>(
    query: string,
    endpoint: string,
    cacheWrite: boolean,
    wholeQuery: boolean,
    _startTime: number,
    customHeaders?: Record<string, string>,
    variables?: Record<string, unknown>,
    method: "GET" | "POST" = "POST",
  ): Promise<GraphQLResponse<T>> {
    const queryWithTypenames = wholeQuery ? query : insertTypenames(query);

    // Merge default headers with custom headers
    const baseHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Obsidian-GQL-Client/1.0",
      ...this.defaultHeaders,
      ...customHeaders,
    };

    try {
      let resJSON: Response;
      const requestBody: Record<string, unknown> = {
        query: queryWithTypenames,
      };
      if (variables && Object.keys(variables).length > 0) {
        requestBody.variables = variables;
      }

      // Handle persistent queries
      if (this.persistQueries) {
        const encoder = new TextEncoder();
        const data = encoder.encode(queryWithTypenames);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        let fetchOptions: RequestInit = {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify({ hash }),
        };

        // Apply beforeFetch hook if provided
        if (this.beforeFetch) {
          fetchOptions = await this.beforeFetch({
            url: endpoint,
            options: fetchOptions,
          });
        }

        resJSON = await fetch(endpoint, fetchOptions);

        // If hash not found, send query with hash
        if (resJSON.status === 204) {
          fetchOptions = {
            method: "POST",
            headers: baseHeaders,
            body: JSON.stringify({ hash, ...requestBody }),
          };

          if (this.beforeFetch) {
            fetchOptions = await this.beforeFetch({
              url: endpoint,
              options: fetchOptions,
            });
          }

          resJSON = await fetch(endpoint, fetchOptions);
        }
      } else {
        // Normal query - support both GET and POST
        let fetchOptions: RequestInit;
        let requestUrl = endpoint;

        if (method === "GET") {
          // For GET requests, encode query and variables in URL
          const params = new URLSearchParams();
          params.set("query", queryWithTypenames);
          if (variables && Object.keys(variables).length > 0) {
            params.set("variables", JSON.stringify(variables));
          }
          requestUrl = `${endpoint}?${params.toString()}`;
          fetchOptions = {
            method: "GET",
            headers: baseHeaders,
          };
        } else {
          // POST request with body
          fetchOptions = {
            method: "POST",
            headers: baseHeaders,
            body: JSON.stringify(requestBody),
          };
        }

        // Apply beforeFetch hook if provided
        if (this.beforeFetch) {
          fetchOptions = await this.beforeFetch({
            url: requestUrl,
            options: fetchOptions,
          });
        }

        resJSON = await fetch(requestUrl, fetchOptions);
      }

      // Store response for subclasses (e.g., rate limit tracking)
      this.lastResponse = resJSON;

      // Check for HTTP auth errors (401, 403)
      if (resJSON.status === 401 || resJSON.status === 403) {
        let graphqlErrors: AuthError["graphqlErrors"];
        try {
          const errorResponse = await resJSON.clone().json() as GraphQLResponse;
          graphqlErrors = errorResponse.errors;
        } catch {
          // If response is not JSON, ignore GraphQL errors
        }

        if (this.onAuthError) {
          await this.onAuthError({
            status: resJSON.status,
            response: resJSON,
            graphqlErrors,
          });
        }
      }

      const resObj: GraphQLResponse<T> = await resJSON.json();

      // Check for GraphQL auth errors in response
      if (resObj.errors && this.onAuthError) {
        const hasAuthError = resObj.errors.some(
          (error) =>
            error.message.toLowerCase().includes("unauthorized") ||
            error.message.toLowerCase().includes("forbidden") ||
            error.message.toLowerCase().includes("authentication") ||
            error.message.toLowerCase().includes("authorization"),
        );

        if (hasAuthError) {
          await this.onAuthError({
            status: resJSON.status,
            response: resJSON,
            graphqlErrors: resObj.errors,
          });
        }
      }

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
          const cacheKey = createCacheKey(queryWithTypenames, variables);
          if (wholeQuery && "writeWholeQuery" in this.cache) {
            this.cache.writeWholeQuery(cacheKey, deepResObj);
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
                cacheKey,
                deepResObj,
                this.searchTerms,
              );
            }
          }
        }
      }

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
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    const baseHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Obsidian-GQL-Client/1.0",
      ...this.defaultHeaders,
      ...customHeaders,
    };

    const requestBody: Record<string, unknown> = {
      query: mutation,
    };
    if (variables && Object.keys(variables).length > 0) {
      requestBody.variables = variables;
    }

    let fetchOptions: RequestInit = {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(requestBody),
    };

    // Apply beforeFetch hook if provided
    if (this.beforeFetch) {
      fetchOptions = await this.beforeFetch({
        url: endpoint,
        options: fetchOptions,
      });
    }

    const resJSON = await fetch(endpoint, fetchOptions);

    // Check for HTTP auth errors (401, 403)
    if (resJSON.status === 401 || resJSON.status === 403) {
      let graphqlErrors: AuthError["graphqlErrors"];
      try {
        const errorResponse = await resJSON.clone().json() as GraphQLResponse;
        graphqlErrors = errorResponse.errors;
      } catch {
        // If response is not JSON, ignore GraphQL errors
      }

      if (this.onAuthError) {
        await this.onAuthError({
          status: resJSON.status,
          response: resJSON,
          graphqlErrors,
        });
      }
    }

    const resObj: GraphQLResponse<T> = await resJSON.json();

    // Check for GraphQL auth errors in response
    if (resObj.errors && this.onAuthError) {
      const hasAuthError = resObj.errors.some(
        (error) =>
          error.message.toLowerCase().includes("unauthorized") ||
          error.message.toLowerCase().includes("forbidden") ||
          error.message.toLowerCase().includes("authentication") ||
          error.message.toLowerCase().includes("authorization"),
      );

      if (hasAuthError) {
        await this.onAuthError({
          status: resJSON.status,
          response: resJSON,
          graphqlErrors: resObj.errors,
        });
      }
    }

    return resObj;
  }
}

/**
 * GitHub-specific GraphQL Client
 *
 * Extends ObsidianClient with GitHub GraphQL API conventions:
 * - Enforces POST-only requests (GitHub requires POST for all GraphQL operations)
 * - Default endpoint: https://api.github.com/graphql
 * - Bearer token authentication convenience
 * - Rate limit information helpers
 *
 * @example
 * ```typescript
 * const github = new GithubClient({
 *   token: process.env.GITHUB_TOKEN,
 *   useCache: true,
 * });
 *
 * const response = await github.query(
 *   `query GetRepo($owner: String!, $name: String!) {
 *     repository(owner: $owner, name: $name) {
 *       name
 *       stargazerCount
 *     }
 *   }`,
 *   { variables: { owner: "denoland", name: "deno" } }
 * );
 *
 * // Check rate limits
 * const rateLimit = github.getRateLimit();
 * console.log(`Remaining: ${rateLimit?.remaining}/${rateLimit?.limit}`);
 * ```
 */
export interface GithubClientOptions
  extends Omit<ObsidianClientOptions, "endpoint"> {
  /** GitHub personal access token (automatically sets Authorization header) */
  token?: string;
  /** GraphQL endpoint (defaults to GitHub's API) */
  endpoint?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
}

export class GithubClient extends ObsidianClient {
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(options: GithubClientOptions = {}) {
    const githubEndpoint = options.endpoint || "https://api.github.com/graphql";

    // Set up headers with Bearer token if provided
    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    // GitHub requires User-Agent, but we'll use the default from ObsidianClient
    // GitHub also recommends Accept header for preview APIs
    headers.Accept = options.headers?.Accept || "application/vnd.github+json";

    // Wrap beforeFetch to chain with user's beforeFetch and capture responses
    const originalBeforeFetch = options.beforeFetch;
    const wrappedBeforeFetch = async (request: BeforeFetchRequest) => {
      // Apply user's beforeFetch if provided
      if (originalBeforeFetch) {
        request.options = await originalBeforeFetch(request);
      }
      return request.options;
    };

    super({
      ...options,
      endpoint: githubEndpoint,
      headers,
      beforeFetch: wrappedBeforeFetch,
      // Override onAuthError to handle GitHub-specific auth errors
      onAuthError: async (error) => {
        // Call user's onAuthError if provided
        if (options.onAuthError) {
          await options.onAuthError(error);
        }
      },
    });
  }

  /**
   * Execute a GraphQL query (POST-only, method option removed)
   *
   * @param query - GraphQL query string
   * @param options - Query options (method option is not available)
   * @returns Promise resolving to GraphQL response
   */
  override async query<T = unknown>(
    query: string,
    options: Omit<QueryOptions, "method"> = {},
  ): Promise<GraphQLResponse<T>> {
    // Enforce POST - remove method option if somehow provided
    const { method: _method, ...restOptions } = options as QueryOptions;
    return await super.query<T>(query, { ...restOptions, method: "POST" });
  }

  /**
   * Get rate limit information from the last response
   *
   * Rate limit headers are captured automatically:
   * - X-RateLimit-Limit: Maximum requests per hour
   * - X-RateLimit-Remaining: Remaining requests in current window
   * - X-RateLimit-Reset: Unix timestamp when rate limit resets
   * - X-RateLimit-Used: Number of requests used in current window
   *
   * @returns Rate limit information or null if not available
   */
  getRateLimit(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Check if rate limit is exhausted
   *
   * @returns true if remaining requests is 0 or less
   */
  isRateLimited(): boolean {
    return this.rateLimitInfo !== null && this.rateLimitInfo.remaining <= 0;
  }

  /**
   * Get seconds until rate limit resets
   *
   * @returns Seconds until reset, or null if rate limit info not available
   */
  getSecondsUntilReset(): number | null {
    if (!this.rateLimitInfo) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, this.rateLimitInfo.reset - now);
  }

  /**
   * Internal method override to capture rate limit headers and enforce POST-only
   */
  protected override async hunt<T>(
    query: string,
    endpoint: string,
    cacheWrite: boolean,
    wholeQuery: boolean,
    startTime: number,
    customHeaders?: Record<string, string>,
    variables?: Record<string, unknown>,
    _method: "GET" | "POST" = "POST",
  ): Promise<GraphQLResponse<T>> {
    // Always use POST for GitHub (enforce POST-only)
    const response = await super.hunt<T>(
      query,
      endpoint,
      cacheWrite,
      wholeQuery,
      startTime,
      customHeaders,
      variables,
      "POST",
    );

    // Update rate limit info from last response (stored by parent class)
    if (this.lastResponse) {
      this.updateRateLimitFromResponse(this.lastResponse);
    }

    return response;
  }

  /**
   * Update rate limit information from GitHub API response headers
   */
  private updateRateLimitFromResponse(response: Response): void {
    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");
    const used = response.headers.get("X-RateLimit-Used");

    if (limit && remaining && reset && used) {
      this.rateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
        used: parseInt(used, 10),
      };
    }
  }
}
