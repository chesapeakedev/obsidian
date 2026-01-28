GraphQL, built for Deno.

Obsidian is Deno's first native GraphQL caching client and server module. It
provides intelligent caching with normalization strategies to support scalable,
high-performance applications.

## Features

- **Client-side caching** with multiple algorithms (LFU, LRU, W-TinyLFU)
- **Server-side caching** with Redis integration
- **Query normalization** for efficient cache storage and retrieval
- **Persistent queries** to minimize network payload
- **Cache invalidation** for mutations
- **DoS protection** via query depth limiting
- **Configurable caching options** for complete control

## Installation

```typescript
import {
  gql,
  ObsidianClient,
  ObsidianService,
} from "jsr:@chesapeake/obsidian-gql";
```

## Usage

### Server

```typescript
import { gql, ObsidianService } from "jsr:@chesapeake/obsidian-gql";
import { resolvers } from "./resolvers.ts";
import { types } from "./schema/types.ts";

const handler = await ObsidianService({
  typeDefs: types,
  resolvers: resolvers,
});

Deno.serve({ port: 8000 }, handler);
```

### Client

```typescript
import { ObsidianClient } from "jsr:@chesapeake/obsidian-gql";

const client = new ObsidianClient({
  endpoint: "/graphql",
  useCache: true,
  algo: "LRU", // "LFU" | "LRU" | "W-TinyLFU"
  capacity: 5000,
  persistQueries: true,
  searchTerms: ["title", "director", "genre"],
  headers: {
    Authorization: "Bearer your-token",
  },
});

// Query
const response = await client.query(`query {
  movies {
    id
    title
    releaseYear
  }
}`);

// Mutation
const mutation = await client.mutate(`mutation {
  addMovie(input: {title: "Movie", releaseYear: 2024}) {
    id
    title
  }
}`);
```

## Redis Setup

For server-side caching, Redis must be running. Create a `.env` file:

```bash
REDIS_HOST=127.0.0.1
```

Configure the Redis port via `ObsidianService` options (default: 6379).

## Documentation

[getobsidian.io](http://getobsidian.io/)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

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
