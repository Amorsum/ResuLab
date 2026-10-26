// Run by Windows Task Scheduler in one process so stopping the task stops the API.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");

const [releaseRoot, configPath, logDirectory] = process.argv.slice(2);
if (!releaseRoot || !configPath || !logDirectory) {
  throw new Error(
    "Usage: node run-api.cjs <releaseRoot> <configPath> <logDirectory>",
  );
}
fs.mkdirSync(logDirectory, { recursive: true });
for (const name of ["api.stdout.log", "api.stderr.log"]) {
  const file = path.join(logDirectory, name);
  if (fs.existsSync(file) && fs.statSync(file).size >= 10 * 1024 * 1024) {
    for (let index = 3; index >= 1; index--) {
      const previous = index === 1 ? file : `${file}.${index - 1}`;
      if (fs.existsSync(previous)) fs.renameSync(previous, `${file}.${index}`);
    }
  }
}
const output = fs.createWriteStream(path.join(logDirectory, "api.stdout.log"), {
  flags: "a",
});
const errors = fs.createWriteStream(path.join(logDirectory, "api.stderr.log"), {
  flags: "a",
});
process.stdout.write = output.write.bind(output);
process.stderr.write = errors.write.bind(errors);
output.on("error", () => process.exit(1));
errors.on("error", () => process.exit(1));
process.chdir(path.join(releaseRoot, "server"));
console.log(
  JSON.stringify({
    event: "task_start",
    at: new Date().toISOString(),
    release: path.basename(releaseRoot),
  }),
);
Promise.resolve()
  .then(async () => {
    const releaseRequire = createRequire(
      path.join(releaseRoot, "server/package.json"),
    );
    const loaded = releaseRequire("dotenv").config({
      path: configPath,
      quiet: true,
    });
    if (loaded.error) throw new Error("Server configuration could not be read");
    await import(
      pathToFileURL(path.join(releaseRoot, "server/dist/server/src/index.js"))
        .href
    );
  })
  .catch((error) => {
    // Configuration errors may contain their input. Keep the bootstrap error generic.
    console.error(
      JSON.stringify({
        event: "bootstrap_failed",
        error: error?.name ?? "Error",
      }),
    );
    errors.end(() => process.exit(1));
  });
