# Contributing to Obsidian

## Project Overview

Obsidian is Deno's first native GraphQL caching client and server module. It
provides a comprehensive caching solution for GraphQL applications, supporting
both client-side and server-side caching strategies.

### Architecture

Obsidian uses a **two-tier caching architecture**:

1. **Client-side**: In-memory cache using LFU, LRU, or W-TinyLFU algorithms
2. **Server-side**: Redis-backed cache for shared server-side caching

The architecture uses **normalization** - GraphQL responses are flattened into a
normalized structure where each entity is stored once and referenced by a unique
hash key, enabling efficient cache hits even when queries request different
subsets of the same data.

```
┌─────────────────┐
│ ObsidianClient  │ ◄─── Client Cache (LFU/LRU/W-TinyLFU)
└────────┬────────┘
         │
         │ HTTP POST /graphql
         ▼
┌─────────────────┐
│ ObsidianService │ ◄─── Server Cache (Redis)
│  (HTTP Handler) │
└────────┬────────┘
         │
         │ GraphQL Execution
         ▼
┌─────────────────┐
│ GraphQL Schema  │
│   & Resolvers   │
└─────────────────┘
```

## Core Components

### ObsidianService (`src/server/Obsidian.ts`)

Creates an HTTP handler for Deno's HTTP server with GraphQL caching.

**Key Features:**

- Handles GraphQL POST requests
- Redis-backed server-side cache
- Query normalization and restructuring
- Persistent queries via hash table
- GraphQL Playground support
- DoS protection via query depth limiting

**Configuration:** `useCache`, `redisPort`, `persistQueries`, `maxQueryDepth`,
`customIdentifier`, `mutationTableMap`, `searchTerms`

### ObsidianClient (`src/client/ObsidianClient.ts`)

GraphQL client with in-memory caching.

**Key Features:**

- Client-side cache with LFU, LRU, or W-TinyLFU algorithms
- Query normalization
- Persistent queries support
- Configurable cache capacity and policies

**Configuration:** `endpoint`, `useCache`, `algo`, `capacity`, `persistQueries`,
`searchTerms`, `headers`

### Caching Systems

**Server-Side Cache** (`src/server/cache/quickCache.ts`):

- Redis-backed cache
- Normalized storage: `ROOT_QUERY` maps queries to entity hash arrays
- Entities stored as `{__typename}~{id}` → normalized object

**Client-Side Caches** (`src/client/cache/`):

- **LFU Cache**: Tracks access frequency
- **LRU Cache**: Doubly-linked list for O(1) operations
- **W-TinyLFU Cache**: Advanced algorithm with frequency sketch and SLRU

### Normalization

Flattens nested GraphQL responses into a flat structure where each entity is
stored once and referenced by a unique hash key (`{__typename}~{id}`). This
enables:

- Partial cache hits
- Efficient cache invalidation
- Reduced memory usage

### Query Processing

- **Restructuring** (`src/server/restructure.ts`): Creates canonical query form
  (expands fragments, replaces variables)
- **Destructuring** (`src/client/destructure.ts`): Parses queries into
  structured objects for cache key generation

### Cache Invalidation

Mutations trigger cache invalidation:

- **Delete**: Remove entity from cache
- **Add/Update**: Invalidate related queries via `mutationTableMap`

## Data Flow

**Query (Cache Hit):**

```
Client.query() → Check client cache → Return cached response
```

**Query (Cache Miss):**

```
Client.query() → Check client cache → Send to server → 
Check server cache (Redis) → Execute query → Normalize → 
Write to Redis → Write to client cache → Return response
```

**Mutation:**

```
Client.mutate() → Execute mutation → Normalize → 
Invalidate cache → Return response
```

## Design Patterns

- **Strategy Pattern**: Interchangeable cache algorithms (LFU, LRU, W-TinyLFU)
- **Normalization Pattern**: Flatten nested structures for efficient storage
- **Visitor Pattern**: GraphQL AST traversal (in `restructure.ts`,
  `DoSSecurity.ts`)
- **Factory Pattern**: `ObsidianService` and cache implementations

## File Structure

```
obsidian/
├── mod.ts                          # Main entry point
├── src/
│   ├── server/
│   │   ├── Obsidian.ts             # ObsidianService implementation
│   │   ├── cache/
│   │   │   └── quickCache.ts       # Server-side Redis cache
│   │   ├── normalize.ts            # Normalization logic
│   │   ├── restructure.ts          # Query restructuring
│   │   ├── DoSSecurity.ts          # Query depth limiter
│   │   ├── invalidateCacheCheck.ts # Mutation cache invalidation
│   │   ├── queryHash.ts            # Persistent queries hash table
│   │   ├── mapSelections.ts        # Field selection mapping
│   │   └── destructure.ts          # Query destructuring
│   └── client/
│       ├── ObsidianClient.ts       # Client implementation
│       ├── cache/
│       │   ├── lfuCache.ts         # LFU cache
│       │   ├── lruCache.ts         # LRU cache
│       │   ├── wTinyLFUBrowserCache.ts # W-TinyLFU cache
│       │   ├── FrequencySketch.ts  # Frequency sketch
│       │   ├── lruSub-cache.ts     # LRU sub-cache
│       │   └── slruSub-cache.ts    # Segmented LRU sub-cache
│       ├── destructure.ts          # Query destructuring
│       ├── normalizeResult.ts      # Client-side normalization
│       └── insertTypenames.ts     # __typename injection
├── examples/                        # Example code
└── assets/                         # Project assets
```

## Development Guidelines

### Code Style

- TypeScript for all source code
- Follow existing patterns and conventions
- Use Deno's built-in formatter and linter

### Testing

- Test files colocated with source using `.test.ts` suffix
- Test fixtures using `.test.fixtures.ts` suffix
- Test helpers using `.test.helper.ts` suffix
- Use Deno's built-in testing framework

### Running Tests

```bash
deno test --allow-env --allow-net
deno test --allow-env --allow-net src/server/  # Server tests
deno test --allow-net --allow-env src/client/  # Client tests
```

**Note:** Some tests in `src/client/ObsidianClient.test.ts` require a GitHub
personal access token to run. These tests are automatically skipped if the token
is not provided. To run these tests:

```bash
export GITHUB_TOKEN=your_github_token_here
make tests
# or
deno test --allow-env --allow-net
```

You can create a GitHub personal access token at:
https://github.com/settings/tokens

### Dependencies

**Server-side:**

- `graphql`, `@graphql-tools/schema`, `graphql-tag`, `graphql-playground-html`
  (npm)
- `@akin01/deno-redis` (JSR)

**Client-side:**

- No external dependencies (uses native Web APIs)

### Environment Setup

1. Install Deno: https://deno.land/
2. Set up Redis for server-side caching:
   ```bash
   REDIS_HOST=127.0.0.1
   ```
3. Run Redis server (default port: 6379)

### Adding Features

- **New Cache Algorithm**: Create in `src/client/cache/`, implement `read()`,
  `write()`, `cacheClear()`
- **Normalization Changes**: Update `src/server/normalize.ts` and
  `src/client/normalizeResult.ts`
- **Security Features**: Add to `src/server/DoSSecurity.ts` or create new module
