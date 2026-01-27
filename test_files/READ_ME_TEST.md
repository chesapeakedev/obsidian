Please see below for details on how to run Obsidian's test suite and additional
testing resources:

How to Run Obsidian Tests: To run all tests call: deno test --allow-env --allow-net
This can be called from the root obsidian directory and it will locate and call all test
files

To run a specific test file call: deno test --allow-env --allow-net path/test_file.ts
Example: deno test --allow-env --allow-net _test/server/restructure_test.ts

To run test suites:
- Server tests: deno test --allow-env --allow-net _test/server/
- Client tests: deno test --allow-net --allow-env _test/client/

Additional Deno Testing Resources:

1. Deno Testing Docs: https://deno.land/manual/testing
