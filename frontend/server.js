const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const portFlagIndex = args.indexOf("--port");
const port = Number(process.env.FRONTEND_PORT || (portFlagIndex >= 0 ? args[portFlagIndex + 1] : 5173));
const root = __dirname;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, "0.0.0.0", () => {
  console.log(`Frontend listening on http://localhost:${port}`);
});
