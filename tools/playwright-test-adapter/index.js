const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

function packageDirFromBinary(binaryPath) {
  if (!binaryPath) return "";
  try {
    const realPath = fs.realpathSync(binaryPath);
    const directory = path.dirname(realPath);
    if (fs.existsSync(path.join(directory, "package.json")) && fs.existsSync(path.join(directory, "test.js"))) {
      return directory;
    }
  } catch {
    return "";
  }
  return "";
}

function globalPackageDir() {
  try {
    const root = childProcess.execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const candidate = path.join(root, "playwright");
    if (fs.existsSync(path.join(candidate, "test.js"))) return candidate;
  } catch {
    return "";
  }
  return "";
}

function resolvePlaywrightTest() {
  const candidates = [
    process.env.PLAYWRIGHT_PACKAGE_DIR || "",
    path.resolve(__dirname, "../../node_modules/playwright"),
    path.resolve(process.cwd(), "node_modules/playwright"),
    path.resolve(process.cwd(), "../node_modules/playwright"),
    packageDirFromBinary(process.argv[1]),
    packageDirFromBinary(childProcess.spawnSync("which", ["playwright"], { encoding: "utf8" }).stdout?.trim()),
    globalPackageDir()
  ];

  for (const candidate of candidates) {
    const testModule = path.join(candidate, "test.js");
    if (candidate && fs.existsSync(testModule)) return testModule;
  }

  throw new Error("Unable to locate the Playwright CLI package. Install Playwright or set PLAYWRIGHT_PACKAGE_DIR.");
}

module.exports = require(resolvePlaywrightTest());
