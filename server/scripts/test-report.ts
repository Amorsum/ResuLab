import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, totalmem, platform, release } from "node:os";
import { resolve } from "node:path";
const dir = resolve("../docs/competition/results");
await mkdir(dir, { recursive: true });
const started = performance.now();
const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "tests/contract.test.ts",
    "tests/integration.test.ts",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let stdout = "",
  stderr = "";
child.stdout.on("data", (data) => {
  stdout += String(data);
  process.stdout.write(data);
});
child.stderr.on("data", (data) => {
  stderr += String(data);
  process.stderr.write(data);
});
const code = await new Promise<number>((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});
await writeFile(resolve(dir, "local-tests.tap.txt"), stdout + stderr);
await writeFile(
  resolve(dir, "local-test-environment.json"),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      node: process.version,
      platform: platform(),
      osRelease: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      elapsedMs: Math.round(performance.now() - started),
      exitCode: code,
      database: "PGlite (PostgreSQL WASM); real migration SQL",
      model: "scripted fetch responses only; no remote model calls",
      productionValidated: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = code;
