# Obsidian

> **GraphQL, built for Deno.**

Obsidian is a high-performance GraphQL client and server library for Deno,
featuring intelligent caching, query normalization, and first-class GitHub API
support. Whether you're building a GraphQL client for any API or specifically
need a Deno-native GitHub client, Obsidian provides the tools you need.

## Why Obsidian?

- 🚀 **Deno-native**: Built from the ground up for Deno
- ⚡ **Intelligent caching**: Multiple cache algorithms (LFU, LRU, W-TinyLFU)
  with automatic normalization
- 🔒 **Production-ready**: DoS protection, persistent queries, and comprehensive
  error handling
- 🐙 **GitHub-first**: Specialized `GithubClient` with rate limit tracking and
  GitHub API optimizations
- 📦 **JSR package**: Published on
  [JSR](https://jsr.io/@chesapeake/obsidian-gql) for Deno and for Node.js/Bun
  client usage via JSR's npm compatibility layer

## Quick Start

### For GitHub API Users

If you're building a GitHub integration or automation tool, `GithubClient`
provides a streamlined experience:

```typescript
import { GithubClient } from "jsr:@chesapeake/obsidian-gql";

const github = new GithubClient({
  token: Deno.env.get("GITHUB_TOKEN"),
  useCache: true,
});

// Query a repository
const response = await github.query(
  `query GetRepo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      description
      stargazerCount
      forkCount
    }
  }`,
  { variables: { owner: "denoland", name: "deno" } },
);

// Check rate limits
const rateLimit = github.getRateLimit();
console.log(`Remaining: ${rateLimit?.remaining}/${rateLimit?.limit}`);
```

**Key features for GitHub users:**

- Automatic POST-only requests (GitHub requirement)
- Built-in rate limit tracking
- Token convenience (automatically sets Authorization header)
- Default endpoint configured for GitHub API

### For General GraphQL Users

If you need a GraphQL client for any API, `ObsidianClient` provides flexible
caching and powerful features:

```typescript
import { ObsidianClient } from "jsr:@chesapeake/obsidian-gql";

const client = new ObsidianClient({
  endpoint: "https://api.example.com/graphql",
  useCache: true,
  algo: "LRU", // "LFU" | "LRU" | "W-TinyLFU"
  capacity: 5000,
  headers: {
    Authorization: "Bearer your-token",
  },
});

// Query with variables
const response = await client.query(
  `query GetUser($id: ID!) {
    user(id: $id) {
      name
      email
    }
  }`,
  { variables: { id: "123" } },
);

// Mutation
const mutation = await client.mutate(
  `mutation UpdateUser($id: ID!, $name: String!) {
    updateUser(id: $id, name: $name) {
      id
      name
    }
  }`,
  { variables: { id: "123", name: "New Name" } },
);

// Always check both data and errors
if (response.errors) {
  console.error("GraphQL errors:", response.errors);
}
if (response.data) {
  console.log("Data:", response.data);
}
```

## Installation

Install from [JSR](https://jsr.io/@chesapeake/obsidian-gql):

```typescript
import {
  GithubClient, // GitHub-specific client
  gql, // GraphQL tag helper
  ObsidianClient, // General GraphQL client
  ObsidianService, // GraphQL server handler
} from "jsr:@chesapeake/obsidian-gql";
```

No configuration needed - Deno will automatically download and cache the package
on first import.

### Runtime compatibility

| Component                               | Deno      | Node.js / Bun     |
| --------------------------------------- | --------- | ----------------- |
| `ObsidianClient`, `GithubClient`, `gql` | Supported | Supported         |
| `ObsidianService` (server)              | Supported | Not yet supported |

Node.js and Bun compatibility currently applies to the **client API only**.
`ObsidianService` depends on Deno-specific server dependencies (for example
`@akin01/deno-redis`) and is intended for Deno deployments today. Server-side
Node.js support is tracked in
[GitHub issue #1](https://github.com/chesapeakedev/obsidian/issues/1).

## Features

### Client Features

- **Multiple cache algorithms**: Choose from LFU, LRU, or W-TinyLFU based on
  your access patterns
- **Query normalization**: Efficient cache storage that enables cache hits even
  for different query shapes
- **Persistent queries**: Minimize network payload by sending query hashes
  instead of full queries
- **Smart cache invalidation**: Automatic cache clearing on mutations
- **Authentication helpers**: `beforeFetch` callback for dynamic headers,
  `onAuthError` for auth error handling
- **TypeScript support**: Full type definitions included

### Server Features

- **Redis-backed caching**: Shared server-side cache for high-performance
  applications
- **Query depth limiting**: Built-in DoS protection
- **Query normalization**: Server-side normalization for efficient cache storage
- **Persistent queries**: Hash-based query storage

## Usage Guide

### ObsidianClient (General GraphQL Client)

```typescript
import { ObsidianClient } from "jsr:@chesapeake/obsidian-gql";

const client = new ObsidianClient({
  endpoint: "/graphql",
  useCache: true,
  algo: "LRU", // "LFU" | "LRU" | "W-TinyLFU"
  capacity: 5000,
  persistQueries: true,
  searchTerms: ["title", "director", "genre"], // For cache normalization
  headers: {
    Authorization: "Bearer your-token",
  },
  // Optional: Modify requests before fetch (e.g., refresh tokens)
  beforeFetch: (request) => {
    const headers = new Headers(request.options.headers as HeadersInit);
    headers.set("Authorization", `Bearer ${getToken()}`);
    return { ...request.options, headers: Object.fromEntries(headers) };
  },
  // Optional: Handle authentication errors
  onAuthError: (error) => {
    console.error("Auth error:", error.status, error.graphqlErrors);
    // Handle token refresh, redirect to login, etc.
  },
});

// Query without variables
const response = await client.query(`query {
  movies {
    id
    title
    releaseYear
  }
}`);

// Query with variables (recommended)
const repoResponse = await client.query(
  `query GetRepo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      description
    }
  }`,
  { variables: { owner: "denoland", name: "deno" } },
);

// Mutation with variables
const mutation = await client.mutate(
  `mutation AddMovie($title: String!, $year: Int!) {
    addMovie(input: {title: $title, releaseYear: $year}) {
      id
      title
    }
  }`,
  { variables: { title: "Movie", year: 2024 } },
);
```

**Important Notes:**

- **Request Method**: Defaults to POST for all requests. GET is supported for
  queries via the `method` option, but POST is recommended and required for
  mutations.
- **Response Shape**: All responses follow the GraphQL spec format:
  `{ data?, errors? }`. Always check both properties as partial results/errors
  are possible.
- **Variables**: Use the `variables` option to pass parameterized values.
  Variables are included in cache keys to prevent collisions.
- **Authentication**: Use `beforeFetch` to dynamically add auth headers, or set
  static headers in the constructor. Use `onAuthError` to handle 401/403
  responses or GraphQL auth errors.

### GithubClient (GitHub API Client)

`GithubClient` extends `ObsidianClient` with GitHub-specific optimizations:

```typescript
import { GithubClient } from "jsr:@chesapeake/obsidian-gql";

const github = new GithubClient({
  token: process.env.GITHUB_TOKEN, // Automatically sets Authorization header
  useCache: true,
  algo: "LRU",
  capacity: 5000,
});

// Query with variables
const response = await github.query(
  `query GetRepo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      stargazerCount
      description
      issues(first: 10) {
        nodes {
          title
          author {
            login
          }
        }
      }
    }
  }`,
  { variables: { owner: "denoland", name: "deno" } },
);

// Check rate limits
const rateLimit = github.getRateLimit();
if (rateLimit) {
  console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
  console.log(`Resets in: ${github.getSecondsUntilReset()} seconds`);

  if (github.isRateLimited()) {
    console.warn("Rate limit exhausted!");
  }
}
```

**GithubClient Features:**

- **POST-only enforcement**: All requests use POST (GitHub requirement)
- **Default endpoint**: Automatically uses `https://api.github.com/graphql`
- **Token convenience**: Pass `token` option to automatically set
  `Authorization: Bearer` header
- **Rate limit tracking**: Automatically captures rate limit headers
  (`X-RateLimit-*`)
- **GitHub-specific headers**: Sets appropriate `Accept` header for GitHub API

### ObsidianService (GraphQL Server)

Build a GraphQL server with Redis-backed caching:

```typescript
import { gql, ObsidianService } from "jsr:@chesapeake/obsidian-gql";
import { resolvers } from "./resolvers.ts";
import { types } from "./schema/types.ts";

const handler = await ObsidianService({
  typeDefs: types,
  resolvers: resolvers,
  useCache: true,
  redisPort: 6379,
  persistQueries: true,
  maxQueryDepth: 10, // DoS protection
});

Deno.serve({ port: 8000 }, handler);
```

**Server Configuration:**

- **Redis**: Required for server-side caching. Set `REDIS_HOST` environment
  variable (default: `127.0.0.1`)
- **Redis Port**: Configure via `redisPort` option (default: `6379`)
- **Query Depth**: Set `maxQueryDepth` to prevent DoS attacks
- **Persistent Queries**: Enable `persistQueries` to use query hashes instead of
  full queries

## Server Setup

### Redis Configuration

For server-side caching with `ObsidianService`, Redis must be running. Create a
`.env` file:

```bash
REDIS_HOST=127.0.0.1
```

Configure the Redis port via `ObsidianService` options (default: `6379`):

```typescript
const handler = await ObsidianService({
  typeDefs: types,
  resolvers: resolvers,
  redisPort: 6379, // Optional, defaults to 6379
});
```

## Cache Algorithms

Obsidian supports three cache algorithms, each optimized for different access
patterns:

- **LFU (Least Frequently Used)**: Best for workloads where frequently accessed
  items should stay cached
- **LRU (Least Recently Used)**: Best for workloads with temporal locality
  (recent items are likely to be accessed again)
- **W-TinyLFU**: Advanced algorithm combining frequency and recency, ideal for
  mixed workloads

Choose based on your application's access patterns. W-TinyLFU is recommended for
most use cases.

## Examples

See the [`examples/`](./examples/) directory for complete working examples.

## Requirements

- **Deno**: Version 1.28.0 or higher
- **Redis**: Required only for server-side caching (optional for client-only
  usage)

## Documentation

Full documentation available at [getobsidian.io](http://getobsidian.io/)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for
development guidelines and setup instructions.

## License

See [LICENSE](./LICENSE) for details.

## Authors

[David Kim](https://github.com/davidtoyoukim)\
[David Norman](https://github.com/DavidMNorman)\
[Eileen Cho](https://github.com/exlxxn)\
[Joan Manto](https://github.com/JoanManto)\
[Alex Lopez](https://github.com/AlexLopez7)\
[Kevin Huang](https://github.com/kevin-06-huang)\
[Matthew Weisker](https://github.com/mweisker)\
[Ryan Ranjbaran](https://github.com/ranjrover)\
[Derek Okuno](https://github.com/okunod)\
[Liam Johnson](https://github.com/liamdimitri)\
[Josh Reed](https://github.com/joshreed104)\
[Jonathan Fangon](https://github.com/jonathanfangon)\
[Liam Jeon](https://github.com/laj52)\
[Yurii Shchyrba](https://github.com/YuriiShchyrba)\
[Linda Zhao](https://github.com/lzhao15)\
[Ali Fay](https://github.com/ali-fay)\
[Anthony Guan](https://github.com/guananthony)\
[Yasir Choudhury](https://github.com/Yasir-Choudhury)\
[Yogi Paturu](https://github.com/YogiPaturu)\
[Michael Chin](https://github.com/mikechin37)\
[Dana Flury](https://github.com/dmflury)\
[Sardor Akhmedov](https://github.com/sarkamedo)\
[Christopher Berry](https://github.com/cjamesb)\
[Olivia Yeghiazarian](https://github.com/Olivia-code)\
[Michael Melville](https://github.com/meekle)\
[John Wong](https://github.com/johnwongfc)\
[Kyung Lee](https://github.com/kyunglee1)\
[Justin McKay](https://github.com/justinwmckay)\
[Patrick Sullivan](https://github.com/pjmsullivan)\
[Cameron Simmons](https://github.com/cssim22)\
[Raymond Ahn](https://github.com/raymondcodes)\
[Alonso Garza](https://github.com/Alonsog66)\
[Burak Caliskan](https://github.com/CaliskanBurak)\
[Matt Meigs](https://github.com/mmeigs)\
[Travis Frank](https://github.com/TravisFrankMTG/)\
[Lourent Flores](https://github.com/lourentflores)\
[Esma Sahraoui](https://github.com/EsmaShr)\
[Derek Miller](https://github.com/dsymiller)\
[Eric Marcatoma](https://github.com/ericmarc159)\
[Spencer Stockton](https://github.com/tonstock)
