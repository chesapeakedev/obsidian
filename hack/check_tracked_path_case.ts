const slDir = ".sl";

try {
  await Deno.stat(slDir);
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    console.log("Skipping tracked path case check outside a Sapling checkout.");
    Deno.exit(0);
  }
  throw error;
}

const command = new Deno.Command("sl", {
  args: ["files", "-T", "{path}\\n"],
  stdout: "piped",
  stderr: "piped",
});

const output = await command.output();
if (!output.success) {
  const stderr = new TextDecoder().decode(output.stderr).trim();
  console.error(stderr || "Failed to list Sapling-tracked files.");
  Deno.exit(output.code);
}

const cwd = await Deno.realPath(".");
const trackedPaths = new TextDecoder().decode(output.stdout)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("watchman sockpath"));

const mismatches: string[] = [];

for (const trackedPath of trackedPaths) {
  let realPath: string;
  try {
    realPath = await Deno.realPath(trackedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      continue;
    }
    throw error;
  }

  const relativeRealPath = realPath.slice(cwd.length + 1).replaceAll("\\", "/");
  if (relativeRealPath !== trackedPath) {
    mismatches.push(`${trackedPath} -> ${relativeRealPath}`);
  }
}

if (mismatches.length > 0) {
  console.error("Tracked path casing does not match the filesystem:");
  for (const mismatch of mismatches) {
    console.error(`  ${mismatch}`);
  }
  Deno.exit(1);
}

console.log("Tracked path casing matches the filesystem.");
