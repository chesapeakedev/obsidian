# ObsidianClient

A TypeScript GraphQL client with intelligent caching, designed to work with Deno
and any JavaScript/TypeScript environment.

## Features

- **TypeScript Support**: Fully typed API
- **Multiple Cache Algorithms**: LFU, LRU, and W-TinyLFU
- **Deno Compatible**: Works out of the box with Deno
- **Framework Agnostic**: No React or other framework dependencies
- **Custom Headers**: Support for authentication and custom headers
- **Cache Control**: Fine-grained control over cache reads and writes
- **Polling Support**: Built-in support for polling queries

## Installation

The client is part of the Obsidian package. Import it directly:

```typescript
import { ObsidianClient } from "https://deno.land/x/obsidian/mod.ts";
```

## Basic Usage

```typescript
import { ObsidianClient } from "./src/Client/ObsidianClient.ts";

// Create a client
const client = new ObsidianClient({
  endpoint: "https://api.github.com/graphql",
  useCache: true,
  algo: "LFU",
  capacity: 2000,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Execute a query
const response = await client.query(`
  query {
    viewer {
      login
      name
    }
  }
`);

console.log(response.data);
```

## Configuration Options

### ObsidianClientOptions

```typescript
interface ObsidianClientOptions {
  /** GraphQL endpoint URL (default: "/graphql") */
  endpoint?: string;
  /** Enable client-side caching (default: true) */
  useCache?: boolean;
  /** Cache algorithm: "LFU" | "LRU" | "W-TinyLFU" (default: "LFU") */
  algo?: CacheAlgorithm;
  /** Cache capacity (default: 2000) */
  capacity?: number;
  /** Search terms for cache optimization */
  searchTerms?: string[];
  /** Enable persistent queries (default: false) */
  persistQueries?: boolean;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}
```

## Query Options

```typescript
interface QueryOptions {
  /** Override endpoint for this query */
  endpoint?: string;
  /** Read from cache (default: true if caching enabled) */
  cacheRead?: boolean;
  /** Write to cache (default: true if caching enabled) */
  cacheWrite?: boolean;
  /** Polling interval in milliseconds */
  pollInterval?: number | null;
  /** Use whole query for cache */
  wholeQuery?: boolean;
  /** Custom headers for this query */
  headers?: Record<string, string>;
}
```

## Mutation Options

```typescript
interface MutationOptions {
  /** Override endpoint for this mutation */
  endpoint?: string;
  /** Write to cache (default: true if caching enabled) */
  cacheWrite?: boolean;
  /** Delete flag for mutations */
  toDelete?: boolean;
  /** Update function for cache */
  update?: (cache: any, responseObj: any) => void;
  /** Write-through mode (default: true) */
  writeThrough?: boolean;
  /** Custom headers for this mutation */
  headers?: Record<string, string>;
}
```

## Examples

### Basic Query

```typescript
const response = await client.query(`
  query {
    viewer {
      login
    }
  }
`);
```

### Query with Cache Control

```typescript
// Force cache miss
const response = await client.query(query, { cacheRead: false });

// Don't write to cache
const response = await client.query(query, { cacheWrite: false });
```

### Mutation

```typescript
const response = await client.mutate(`
  mutation {
    updateUser(input: { name: "New Name" }) {
      id
      name
    }
  }
`);
```

### Clear Cache

```typescript
client.clearCache();
```

### Polling

```typescript
// Start polling every 5 seconds
await client.query(query, { pollInterval: 5000 });

// Stop polling for a specific query
client.stopPolling(query);

// Stop all polling
client.stopAllPolling();
```

## Cache Algorithms

### LFU (Least Frequently Used) - Default

Tracks access frequency and evicts least frequently used items.

### LRU (Least Recently Used)

Tracks recency and evicts least recently accessed items.

### W-TinyLFU

Advanced algorithm with frequency sketch and admission window for better hit
rates.

## Testing

Tests are available in `test_files/rhum_test_files/client_test.ts`. To run:

```bash
export GITHUB_TOKEN=your_token
deno test --allow-net --allow-env test_files/rhum_test_files/client_test.ts
```

## Migration from React Provider

If you're migrating from the React `ObsidianProvider`, the new client API is
similar:

**Before (React):**

```typescript
const { query, mutate } = useObsidian();
const response = await query(queryString);
```

**After (TypeScript Client):**

```typescript
const client = new ObsidianClient(options);
const response = await client.query(queryString);
```

The main differences:

- No React Context needed
- Direct instantiation instead of Provider wrapper
- Same query/mutate API
- Additional methods like `clearCache()` and polling control
