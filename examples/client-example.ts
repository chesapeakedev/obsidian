/**
 * Example usage of ObsidianClient with GitHub GraphQL API
 *
 * To run this example:
 * 1. Set GITHUB_TOKEN environment variable: export GITHUB_TOKEN=your_token
 * 2. Run: deno run --allow-net --allow-env examples/client-example.ts
 */

import { ObsidianClient } from "../src/Client/ObsidianClient.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

if (!GITHUB_TOKEN) {
  console.error("Please set GITHUB_TOKEN environment variable");
  Deno.exit(1);
}

// Create a client with GitHub GraphQL API endpoint
const client = new ObsidianClient({
  endpoint: "https://api.github.com/graphql",
  useCache: true,
  algo: "LFU",
  capacity: 1000,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
  },
});

async function main() {
  console.log("=== ObsidianClient Example ===\n");

  // Example 1: Query viewer information
  console.log("1. Querying viewer information...");
  const viewerQuery = `
    query {
      viewer {
        login
        name
        bio
        avatarUrl
      }
    }
  `;

  const viewerResponse = await client.query(viewerQuery);
  console.log("Viewer:", viewerResponse.data?.viewer);
  console.log();

  // Example 2: Query with cache (second call should be faster)
  console.log("2. Querying again (should hit cache)...");
  const start = Date.now();
  const cachedResponse = await client.query(viewerQuery);
  const time = Date.now() - start;
  console.log(`Cached response time: ${time}ms`);
  console.log("Viewer (cached):", cachedResponse.data?.viewer);
  console.log();

  // Example 3: Query repository information
  console.log("3. Querying repository information...");
  const repoQuery = `
    query {
      repository(owner: "denoland", name: "deno") {
        name
        description
        stargazerCount
        forkCount
        owner {
          login
        }
      }
    }
  `;

  const repoResponse = await client.query(repoQuery);
  console.log("Repository:", repoResponse.data?.repository);
  console.log();

  // Example 4: Query with nested fields
  console.log("4. Querying with nested fields...");
  const nestedQuery = `
    query {
      repository(owner: "denoland", name: "deno") {
        name
        issues(first: 3) {
          nodes {
            title
            author {
              login
            }
          }
        }
      }
    }
  `;

  const nestedResponse = await client.query(nestedQuery);
  console.log("Repository with issues:", nestedResponse.data?.repository);
  console.log();

  // Example 5: Clear cache
  console.log("5. Clearing cache...");
  client.clearCache();
  console.log("Cache cleared!");
  console.log();

  // Example 6: Query with different cache algorithm
  console.log("6. Creating client with LRU cache...");
  const lruClient = new ObsidianClient({
    endpoint: "https://api.github.com/graphql",
    useCache: true,
    algo: "LRU",
    capacity: 500,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
  });

  const lruResponse = await lruClient.query(viewerQuery);
  console.log("LRU cached response:", lruResponse.data?.viewer);
  console.log();

  console.log("=== Example Complete ===");
}

main().catch((error) => {
  console.error("Error:", error);
  Deno.exit(1);
});
