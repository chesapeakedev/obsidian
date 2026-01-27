# Contributing to Obsidian

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Key Design Patterns](#key-design-patterns)
- [File Structure](#file-structure)
- [Development Guidelines](#development-guidelines)

## Project Overview

Obsidian is Deno's first native GraphQL caching client and server module. It
provides a comprehensive caching solution for GraphQL applications, supporting
both client-side and server-side caching strategies. The project is built with
TypeScript/JavaScript and designed specifically for Deno runtime.

### Key Features

- **Client-side caching** with multiple algorithms (LFU, LRU, W-TinyLFU)
- **Server-side caching** with Redis integration
- **Query normalization** for efficient cache storage and retrieval
- **Persistent queries** to minimize network payload
- **Cache invalidation** for mutations
- **DoS security** protection via query depth limiting
- **SSR support** for React applications

## Architecture Overview

Obsidian follows a **two-tier caching architecture**:

1. **Client-side**: In-memory browser cache using various eviction policies
2. **Server-side**: Redis-backed cache for shared server-side caching

The architecture is designed around the principle of **normalization** - GraphQL
responses are flattened into a normalized structure where each entity is stored
once and referenced by a unique hash key. This allows for efficient cache hits
even when queries request different subsets of the same data.

### High-Level Architecture

```
┌─────────────────┐
│   React App     │
│  (Client-side)  │
└────────┬────────┘
         │
         │ useObsidian()
         ▼
┌─────────────────┐
│ ObsidianWrapper │ ◄─── Client Cache (LFU/LRU/W-TinyLFU)
│   (Context)     │
└────────┬────────┘
         │
         │ HTTP POST /graphql
         ▼
┌─────────────────┐
│ ObsidianService  │ ◄─── Server Cache (Redis)
│   (HTTP Handler)  │
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

### 1. Server-Side: ObsidianService (`src/Obsidian.ts`)

The `ObsidianService` is the main server-side component that creates an HTTP
handler function for Deno's built-in HTTP server and adds GraphQL caching
capabilities.

**Key Responsibilities:**

- Handles GraphQL POST requests
- Manages Redis connection and server-side cache
- Normalizes GraphQL responses before caching
- Implements query restructuring (removes fragments/variables)
- Handles persistent queries via hash table
- Provides GraphQL Playground support
- Implements DoS protection via query depth limiting

**Configuration Options:**

- `useCache`: Enable/disable caching (default: true)
- `redisPort`: Redis connection port (default: 6379)
- `policy`: Redis eviction policy (default: 'allkeys-lru')
- `maxmemory`: Redis memory limit (default: '2000mb')
- `persistQueries`: Enable persistent queries (default: false)
- `hashTableSize`: Size of query hash table (default: 16)
- `maxQueryDepth`: Maximum query depth for DoS protection (default: 0)
- `customIdentifier`: Keys for entity identification (default: ['__typename',
  '_id'])
- `mutationTableMap`: Maps mutations to affected tables for cache invalidation
- `searchTerms`: Array of searchable fields for cache optimization

**Request Flow:**

1. Receive GraphQL request (with optional hash for persistent queries)
2. Check cache for existing response
3. On cache miss: execute GraphQL query, normalize response, write to cache
4. On cache hit: return cached response
5. Handle mutations: invalidate relevant cache entries

### 2. Client-Side: ObsidianWrapper (`ObsidianWrapper/ObsidianWrapper.jsx`)

The `ObsidianWrapper` is a React Context Provider that manages client-side
caching and provides the `useObsidian` hook.

**Key Responsibilities:**

- Initializes and manages client-side cache instance
- Provides `query()` and `mutate()` functions to child components
- Handles cache reads/writes on client side
- Supports persistent queries (sends hash instead of full query)
- Integrates with developer tools for analytics
- Manages polling intervals for queries

**Cache Algorithms:**

- **LFU (Least Frequently Used)**: Default algorithm, tracks access frequency
- **LRU (Least Recently Used)**: Evicts least recently accessed items
- **W-TinyLFU**: Advanced algorithm with frequency sketch and admission window

**Configuration Options:**

- `useCache`: Enable/disable client caching (default: true)
- `algo`: Cache algorithm ('LFU', 'LRU', 'W-TinyLFU')
- `capacity`: Maximum cache size (default: 2000)
- `persistQueries`: Enable persistent queries (default: false)
- `searchTerms`: Searchable fields for cache optimization

### 3. Caching Systems

#### Server-Side Cache (`src/quickCache.js`)

The `Cache` class manages Redis-backed server-side caching.

**Key Methods:**

- `connect()`: Establishes Redis connection and configures eviction policy
- `read()`: Destructures query, checks cache, and reconstructs response
- `write()`: Normalizes response and writes to Redis with hash keys
- `populateAllHashes()`: Recursively reconstructs nested objects from cache
- `createQueryKey()`: Generates cache key from query string

**Storage Structure:**

- `ROOT_QUERY`: Maps query keys to arrays of entity hash keys
- Individual entities stored as: `{__typename}~{id}` → normalized object

#### Client-Side Caches (`src/Browser/`)

Three cache implementations available:

1. **LFU Cache** (`lfuBrowserCache.js`): Tracks access frequency
2. **LRU Cache** (`lruBrowserCache.js`): Uses doubly-linked list for O(1)
   operations
3. **W-TinyLFU Cache** (`wTinyLFUBrowserCache.js`): Advanced algorithm with:
   - Frequency sketch for approximate frequency counting
   - Admission window (LRU)
   - Main cache (SLRU - Segmented LRU)

All caches support:

- `read()`: Query cache and reconstruct response
- `write()`: Normalize and store response
- `cacheClear()`: Clear all cache entries

### 4. Normalization (`src/normalize.ts`)

Normalization is the process of flattening nested GraphQL responses into a flat
structure where each entity is stored once and referenced by a unique hash.

**Process:**

1. Recursively traverse the response object
2. Identify hashable objects (contain all `customIdentifier` keys)
3. Create hash key: `{__typename}~{id}` (or custom keys)
4. Store normalized object with hash as key
5. Replace nested objects with hash references

**Benefits:**

- Eliminates data duplication
- Enables partial cache hits
- Allows efficient cache invalidation
- Reduces memory usage

**Example:**

```javascript
// Input (nested)
{
  movies: [
    { id: 1, title: "Movie 1", director: { id: 1, name: "Director 1" } }
  ]
}

// Normalized (flat)
{
  "Movie~1": { id: 1, title: "Movie 1", director: "Director~1" },
  "Director~1": { id: 1, name: "Director 1" }
}
```

### 5. Query Processing

#### Query Restructuring (`src/restructure.ts`)

The `restructure()` function processes GraphQL queries to create a canonical
form:

- Expands fragments inline
- Replaces variables with actual values
- Removes fragment definitions
- Handles operation names

This ensures that semantically equivalent queries produce the same cache key.

#### Query Destructuring (`src/Browser/destructure.js`)

The `destructureQueries()` function parses GraphQL query strings into structured
objects:

- Extracts query/mutation names
- Parses arguments
- Builds field selection tree
- Handles fragments and directives

Used for:

- Cache key generation
- Query depth calculation
- Field selection mapping

### 6. Cache Invalidation (`src/invalidateCacheCheck.ts`)

Handles cache invalidation for mutations:

**Process:**

1. Detect mutation operations via AST traversal
2. Normalize mutation response
3. Determine mutation type:
   - **Delete**: Remove entity from cache
   - **Add**: Invalidate related queries via `mutationTableMap`
   - **Update**: Overwrite cached entity
4. Update `ROOT_QUERY` to remove stale query references

**Mutation Table Map:** Maps mutation names to affected data tables:

```javascript
{
  addMovie: ['movies'],
  updateBook: ['books', 'authors']
}
```

### 7. Security: DoS Protection (`src/DoSSecurity.ts`)

The `queryDepthLimiter()` function prevents GraphQL DoS attacks by limiting
query depth.

**Process:**

1. Destructure query into object structure
2. Recursively calculate maximum depth
3. Throw error if depth exceeds `maxQueryDepth`
4. Applied before query execution

### 8. Persistent Queries (`src/queryHash.js`)

Persistent queries allow clients to send a hash instead of the full query
string, reducing network payload.

**Implementation:**

- Client: SHA256 hash of query string
- Server: Hash table (chained hash table with linked lists)
- First request: Client sends hash + query, server stores mapping
- Subsequent requests: Client sends only hash, server looks up query

**Hash Table Structure:**

- Fixed-size array (default: 16)
- Chaining for collision resolution
- Linked list nodes store hash → query mappings

## Data Flow

### Query Flow (Cache Hit)

```
1. Client: query(queryString)
   ↓
2. ObsidianWrapper: Check client cache
   ↓ (cache hit)
3. Return cached response
```

### Query Flow (Cache Miss)

```
1. Client: query(queryString)
   ↓
2. ObsidianWrapper: Check client cache
   ↓ (cache miss)
3. ObsidianWrapper: Insert __typename, send to server
   ↓
4. ObsidianService: Check server cache (Redis)
   ↓ (cache miss)
5. ObsidianService: Execute GraphQL query
   ↓
6. ObsidianService: Normalize response
   ↓
7. ObsidianService: Write to Redis cache
   ↓
8. ObsidianService: Return response
   ↓
9. ObsidianWrapper: Write to client cache
   ↓
10. Client: Receive response
```

### Mutation Flow

```
1. Client: mutate(mutationString)
   ↓
2. ObsidianWrapper: Send to server
   ↓
3. ObsidianService: Execute mutation
   ↓
4. ObsidianService: Normalize response
   ↓
5. ObsidianService: invalidateCache()
   - Determine mutation type (add/update/delete)
   - Update/delete affected entities
   - Invalidate related queries
   ↓
6. ObsidianService: Return response
   ↓
7. ObsidianWrapper: Update client cache (if writeThrough=false)
   ↓
8. Client: Receive response
```

## Key Design Patterns

### 1. Context Provider Pattern

- `ObsidianWrapper` uses React Context to provide cache access
- `useObsidian` hook for consuming components

### 2. Strategy Pattern

- Multiple cache algorithms (LFU, LRU, W-TinyLFU) as interchangeable strategies
- Selected at initialization time

### 3. Normalization Pattern

- Flatten nested data structures for efficient storage
- Reference-based relationships instead of nested objects

### 4. Visitor Pattern

- GraphQL AST traversal using visitor pattern (in `restructure.ts`,
  `DoSSecurity.ts`)
- Allows clean separation of traversal logic from transformation logic

### 5. Factory Pattern

- `ObsidianService` factory function creates configured service instance
- `Cache` class factory for different cache implementations

## File Structure

```
obsidian/
├── mod.ts                          # Main entry point (exports ObsidianService, gql, ObsidianClient)
├── src/
│   ├── Obsidian.ts                 # ObsidianService implementation
│   ├── quickCache.js               # Server-side Redis cache
│   ├── normalize.ts                # Normalization logic
│   ├── restructure.ts              # Query restructuring
│   ├── DoSSecurity.ts              # Query depth limiter
│   ├── invalidateCacheCheck.ts    # Mutation cache invalidation
│   ├── queryHash.js                # Persistent queries hash table
│   ├── mapSelections.js            # Field selection mapping
│   ├── utils.js                    # Utility functions
│   └── Browser/                    # Client-side cache implementations
│       ├── destructure.js          # Query destructuring
│       ├── normalize.js            # Client-side normalization
│       ├── insertTypenames.js      # __typename injection
│       ├── lfuBrowserCache.js      # LFU cache
│       ├── lruBrowserCache.js     # LRU cache
│       ├── wTinyLFUBrowserCache.js # W-TinyLFU cache
│       ├── FrequencySketch.js      # Frequency sketch for W-TinyLFU
│       └── wTinyLFU Sub-Caches/
│           ├── lruSub-cache.js     # LRU sub-cache
│           └── slruSub-cache.js    # Segmented LRU sub-cache
├── ObsidianWrapper/
│   └── ObsidianWrapper.jsx         # React wrapper component
├── test_files/                     # Test files and test variables
└── assets/                         # Project assets (logos, banners)
```

## Development Guidelines

### Code Style

- TypeScript for server-side code (`src/*.ts`)
- JavaScript for client-side code (`src/Browser/*.js`, `ObsidianWrapper/*.jsx`)
- Follow existing patterns and conventions

### Testing

- Test files located in `_test/` directory
- Test variables in `_test_variables/` directory
- Use Deno's built-in testing framework

### Adding New Features

1. **New Cache Algorithm:**
   - Create new file in `src/Browser/`
   - Implement `read()`, `write()`, `cacheClear()` methods
   - Add to `ObsidianWrapper.jsx` algorithm selection logic

2. **New Normalization Strategy:**
   - Modify `normalize.ts` or create new normalization module
   - Update both server and client normalization if needed

3. **New Security Feature:**
   - Add to `DoSSecurity.ts` or create new security module
   - Integrate into `ObsidianService` request handler

### Dependencies

**Server-side:**

- `graphql`: GraphQL core library (npm)
- `@graphql-tools/schema`: GraphQL schema building utilities (npm)
- `graphql-tag`: GraphQL template literal tag (npm)
- `graphql-playground-html`: GraphQL Playground HTML renderer (npm)
- `redis`: Redis client for Deno

**Client-side:**

- `react`: React library (via esm.sh)
- `sha256`: Hashing for persistent queries

### Environment Setup

1. Install Deno: https://deno.land/
2. Set up Redis for server-side caching:
   ```bash
   # Create .env file
   REDIS_HOST=127.0.0.1
   ```
3. Run Redis server on default port 6379

### Common Development Tasks

**Running Tests:**

```bash
deno test --allow-env --allow-net
# Or run specific test suites:
deno test --allow-env --allow-net _test/server/
deno test --allow-net --allow-env _test/client/
```

**Building:**

- No build step required (Deno uses TypeScript directly)
- Entry point: `mod.ts` (exports both server and client)

**Debugging:**

- Use Deno's built-in debugging tools
- Check Redis connection and cache contents
- Monitor client cache via developer tools integration

### Known Limitations & Future Work

- Server-side cache improvements in progress
- More comprehensive mutation support needed
- `searchTerms` option optimization
- Ability to store/read only whole query
- Hill Climber optimization for W-TinyLFU cache size allocation
- Developer Tool server-side cache integration

---

For questions or contributions, please refer to the main README.md or open an
issue on GitHub.
