#!/usr/bin/env node
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

function findCli() {
  const candidates = [
    path.resolve(__dirname, "../../node_modules/playwright/cli.js"),
    path.resolve(process.cwd(), "../node_modules/playwright/cli.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Unable to locate Playwright CLI. Run npm install at the repository root.");
}

const result = childProcess.spawnSync(process.execPath, [findCli(), ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
