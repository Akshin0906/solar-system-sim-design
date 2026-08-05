import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));

const normalizeBasePath = (value) => {
  if (!value || value === ".") {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

const portArgumentIndex = process.argv.indexOf("--port");
const portValue =
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.PREVIEW_PORT ?? "4173";
const port = Number(portValue);
const basePath = normalizeBasePath(process.env.PREVIEW_BASE_PATH ?? process.env.PLAYWRIGHT_APP_PATH);

if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid preview port: ${portValue}`);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
]);

const isWithinDist = (path) => {
  const pathFromDist = relative(distDir, path);
  return pathFromDist !== ".." && !pathFromDist.startsWith(`..${sep}`) && !isAbsolute(pathFromDist);
};

const sendText = (response, statusCode, body) => {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  if (basePath !== "/" && pathname === basePath.slice(0, -1)) {
    response.writeHead(308, { Location: basePath });
    response.end();
    return;
  }

  if (!pathname.startsWith(basePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const requestedPath = pathname.slice(basePath.length) || "index.html";
  let filePath = resolve(distDir, requestedPath);

  if (!isWithinDist(filePath)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    fileStats = null;
  }

  if (!fileStats?.isFile()) {
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (!acceptsHtml) {
      sendText(response, 404, "Not found");
      return;
    }

    filePath = resolve(distDir, "index.html");
    fileStats = await stat(filePath);
  }

  const extension = extname(filePath).toLowerCase();
  const cacheControl =
    extension === ".html" || filePath.endsWith(`${sep}service-worker.js`)
      ? "no-cache"
      : "public, max-age=3600";

  response.writeHead(200, {
    "Cache-Control": cacheControl,
    "Content-Length": fileStats.size,
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${distDir} at http://127.0.0.1:${port}${basePath}`);
});
