import { readdir, stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseline = JSON.parse(await readFile(path.join(root, "bundle-size-baseline.json"), "utf8"));
const assetsDirectory = path.join(root, "dist", "assets");
const entries = await readdir(assetsDirectory);

async function bytesFor(extension) {
  const files = entries.filter((entry) => entry.endsWith(extension));
  const sizes = await Promise.all(files.map(async (entry) => (await stat(path.join(assetsDirectory, entry))).size));
  return sizes.reduce((total, size) => total + size, 0);
}

const actual = {
  javascript: await bytesFor(".js"),
  css: await bytesFor(".css"),
};
actual.total = actual.javascript + actual.css;

const limitFactor = 1 + baseline.maximumIncreasePercent / 100;
const failures = Object.entries(actual).filter(
  ([kind, bytes]) => bytes > Math.floor(baseline.assets[kind] * limitFactor),
);

for (const [kind, bytes] of Object.entries(actual)) {
  const delta = ((bytes / baseline.assets[kind] - 1) * 100).toFixed(2);
  console.log(`${kind}: ${bytes} bytes (${delta}% from baseline)`);
}

if (failures.length > 0) {
  console.error(`Bundle budget exceeded: no asset group may grow by more than ${baseline.maximumIncreasePercent}%.`);
  process.exitCode = 1;
} else {
  console.log(`Bundle budget passed (strict ${baseline.maximumIncreasePercent}% maximum increase).`);
}
