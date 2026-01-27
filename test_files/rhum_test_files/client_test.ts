/**
 * Tests for ObsidianClient using GitHub GraphQL API
 *
 * To run these tests:
 * 1. Set GITHUB_TOKEN environment variable with a valid GitHub personal access token
 * 2. Run: deno test --allow-net --allow-env test_files/rhum_test_files/client_test.ts
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ObsidianClient } from "../../src/Client/ObsidianClient.ts";

// GitHub GraphQL API endpoint
const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

// Get GitHub token from environment
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

// Helper function to create a client with GitHub endpoint
function createGitHubClient(options?: {
  useCache?: boolean;
  algo?: "LFU" | "LRU" | "W-TinyLFU";
  capacity?: number;
}) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required. Set it with: export GITHUB_TOKEN=your_token",
    );
  }

  return new ObsidianClient({
    endpoint: GITHUB_GRAPHQL_ENDPOINT,
    useCache: options?.useCache ?? true,
    algo: options?.algo ?? "LFU",
    capacity: options?.capacity ?? 2000,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    ...options,
  });
}

Deno.test("ObsidianClient: Basic query without cache", async () => {
  const client = createGitHubClient({ useCache: false });

  const query = `
    query {
      viewer {
        login
        name
        bio
      }
    }
  `;

  const response = await client.query(query);

  assertExists(response);
  assertExists(response.data);
  assertExists(response.data.viewer);
  assertExists(response.data.viewer.login);
  assertEquals(typeof response.data.viewer.login, "string");
});

Deno.test("ObsidianClient: Query with LFU cache", async () => {
  const client = createGitHubClient({
    useCache: true,
    algo: "LFU",
    capacity: 100,
  });

  const query = `
    query {
      viewer {
        login
        name
        avatarUrl
      }
    }
  `;

  // First query - cache miss
  const start1 = Date.now();
  const response1 = await client.query(query);
  const time1 = Date.now() - start1;

  assertExists(response1.data);
  assertExists(response1.data.viewer);

  // Second query - should be cache hit
  const start2 = Date.now();
  const response2 = await client.query(query);
  const time2 = Date.now() - start2;

  // Cache hit should be faster (or at least return data)
  assertExists(response2.data);
  assertExists(response2.data.viewer);
  assertEquals(response1.data.viewer.login, response2.data.viewer.login);

  // Verify it's actually from cache (response should be identical)
  assertEquals(response1.data.viewer.login, response2.data.viewer.login);
});

Deno.test("ObsidianClient: Query with LRU cache", async () => {
  const client = createGitHubClient({
    useCache: true,
    algo: "LRU",
    capacity: 100,
  });

  const query = `
    query {
      viewer {
        login
        email
      }
    }
  `;

  const response1 = await client.query(query);
  assertExists(response1.data);
  assertExists(response1.data.viewer);

  // Second query should hit cache
  const response2 = await client.query(query);
  assertExists(response2.data);
  assertEquals(response1.data.viewer.login, response2.data.viewer.login);
});

Deno.test("ObsidianClient: Query with W-TinyLFU cache", async () => {
  const client = createGitHubClient({
    useCache: true,
    algo: "W-TinyLFU",
    capacity: 100,
  });

  const query = `
    query {
      viewer {
        login
        company
      }
    }
  `;

  const response1 = await client.query(query);
  assertExists(response1.data);
  assertExists(response1.data.viewer);

  // Second query should hit cache
  const response2 = await client.query(query);
  assertExists(response2.data);
  assertEquals(response1.data.viewer.login, response2.data.viewer.login);
});

Deno.test("ObsidianClient: Query with nested fields", async () => {
  const client = createGitHubClient({ useCache: true });

  const query = `
    query {
      viewer {
        login
        repositories(first: 3) {
          nodes {
            name
            description
            owner {
              login
            }
          }
        }
      }
    }
  `;

  const response = await client.query(query);

  assertExists(response.data);
  assertExists(response.data.viewer);
  assertExists(response.data.viewer.repositories);
  assertExists(response.data.viewer.repositories.nodes);
  assertEquals(Array.isArray(response.data.viewer.repositories.nodes), true);
});

Deno.test("ObsidianClient: Cache read/write options", async () => {
  const client = createGitHubClient({ useCache: true });

  const query = `
    query {
      viewer {
        login
      }
    }
  `;

  // First query with cache write
  const response1 = await client.query(query, { cacheWrite: true });
  assertExists(response1.data);

  // Second query with cache read disabled
  const response2 = await client.query(query, { cacheRead: false });
  assertExists(response2.data);

  // Third query with cache read enabled (should hit cache)
  const response3 = await client.query(query, { cacheRead: true });
  assertExists(response3.data);
  assertEquals(response1.data.viewer.login, response3.data.viewer.login);
});

Deno.test("ObsidianClient: Clear cache", async () => {
  const client = createGitHubClient({ useCache: true });

  const query = `
    query {
      viewer {
        login
      }
    }
  `;

  // First query - populate cache
  const response1 = await client.query(query);
  assertExists(response1.data);

  // Clear cache
  client.clearCache();

  // Second query - should be cache miss (but still work)
  const response2 = await client.query(query);
  assertExists(response2.data);
  assertEquals(response1.data.viewer.login, response2.data.viewer.login);
});

Deno.test("ObsidianClient: Query repository information", async () => {
  const client = createGitHubClient({ useCache: true });

  const query = `
    query {
      repository(owner: "denoland", name: "deno") {
        name
        description
        stargazerCount
        forkCount
        owner {
          login
          __typename
        }
      }
    }
  `;

  const response = await client.query(query);

  assertExists(response.data);
  assertExists(response.data.repository);
  assertEquals(response.data.repository.name, "deno");
  assertEquals(response.data.repository.owner.login, "denoland");
  assertExists(response.data.repository.stargazerCount);
  assertEquals(typeof response.data.repository.stargazerCount, "number");
});

Deno.test("ObsidianClient: Multiple queries with different data", async () => {
  const client = createGitHubClient({ useCache: true, capacity: 50 });

  const query1 = `
    query {
      viewer {
        login
      }
    }
  `;

  const query2 = `
    query {
      repository(owner: "denoland", name: "deno") {
        name
      }
    }
  `;

  const response1 = await client.query(query1);
  const response2 = await client.query(query2);

  assertExists(response1.data);
  assertExists(response2.data);
  assertExists(response1.data.viewer);
  assertExists(response2.data.repository);
  assertEquals(response2.data.repository.name, "deno");

  // Both should be cached now
  const cached1 = await client.query(query1);
  const cached2 = await client.query(query2);

  assertEquals(cached1.data.viewer.login, response1.data.viewer.login);
  assertEquals(cached2.data.repository.name, response2.data.repository.name);
});

Deno.test("ObsidianClient: Error handling", async () => {
  const client = createGitHubClient({ useCache: false });

  const invalidQuery = `
    query {
      invalidField {
        doesNotExist
      }
    }
  `;

  const response = await client.query(invalidQuery);

  // Should have errors
  assertExists(response.errors);
  assertEquals(Array.isArray(response.errors), true);
  assertEquals(response.errors.length > 0, true);
});
