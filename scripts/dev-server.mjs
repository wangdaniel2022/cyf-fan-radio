#!/usr/bin/env node
/**
 * 本地开发服务器：静态资源 + Cloudflare Pages Functions 兼容层。
 * 不依赖 Wrangler，方便直接预览和联调。
 *
 *   node scripts/dev-server.mjs
 *   PORT=4173 node scripts/dev-server.mjs
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFile, writeFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const FUNCTIONS_ENTRY = join(ROOT, "functions", "api", "[[catchall]].js");

loadDevVars();

let env;

const { onRequest } = await import(pathToFileURL(FUNCTIONS_ENTRY).href);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  const started = Date.now();
  try {
    const incoming = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (incoming.pathname.startsWith("/api/")) {
      const body = await readRequestBody(req);
      const request = new Request(incoming, {
        method: req.method,
        headers: normalizeHeaders(req.headers),
        body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body,
      });
      const response = await onRequest({ request, env, params: {} });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (!response.body || req.method === "HEAD") {
        res.end();
      } else {
        Readable.fromWeb(response.body).on("error", (error) => {
          console.error("[dev] stream error", error);
          res.destroy(error);
        }).pipe(res);
      }
      log(req.method, incoming.pathname, response.status, started);
      return;
    }

    let pathname = decodeURIComponent(incoming.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    let filePath = resolve(ROOT, `.${normalize(pathname)}`);
    if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || (await stat(filePath)).isDirectory()) {
      // SPA fallback，模拟 _redirects 的 /* /index.html 200
      filePath = join(ROOT, "index.html");
    }

    const ext = extname(filePath).toLowerCase();
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=60",
    });
    if (req.method === "HEAD") res.end();
    else res.end(data);
    log(req.method, incoming.pathname, 200, started);
  } catch (error) {
    console.error("[dev]", error);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "本地开发服务器出错", detail: String(error?.message || error) }));
  }
});

function loadDevVars() {
  for (const name of [".dev.vars", ".env.local"]) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function normalizeHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || ["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

function readRequestBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function log(method, path, status, started) {
  const ms = Date.now() - started;
  const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
  console.log(`${color}${status}\x1b[0m ${method} ${path} ${ms}ms`);
}

/** 简易文件 KV，模拟 Cloudflare KV 的 get/put/delete/list。 */
class FileKV {
  constructor(file) {
    this.file = file;
    this.data = {};
    if (existsSync(file)) {
      try {
        this.data = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  async get(key, type = "text") {
    const entry = this.data[key];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      delete this.data[key];
      await this.persist();
      return null;
    }
    if (type === "json") return JSON.parse(entry.value);
    return entry.value;
  }

  async put(key, value, options = {}) {
    const expiresAt = options.expiration
      ? options.expiration * 1000
      : options.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : null;
    this.data[key] = { value: String(value), expiresAt };
    await this.persist();
  }

  async delete(key) {
    delete this.data[key];
    await this.persist();
  }

  async list(options = {}) {
    const prefix = options.prefix || "";
    const limit = options.limit || 1000;
    const now = Date.now();
    const keys = Object.keys(this.data)
      .filter((key) => key.startsWith(prefix))
      .filter((key) => !this.data[key].expiresAt || this.data[key].expiresAt > now)
      .sort()
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }

  async persist() {
    const now = Date.now();
    for (const [key, entry] of Object.entries(this.data)) {
      if (entry.expiresAt && entry.expiresAt < now) delete this.data[key];
    }
    await writeFile(this.file, JSON.stringify(this.data, null, 2));
  }
}

env = {
  ND_BASE: process.env.ND_BASE || "https://music.xn--4gqy2fnwcsx7i.top",
  ND_USER: process.env.ND_USER || "",
  ND_PASS: process.env.ND_PASS || "",
  PLAYLIST_KV: new FileKV(join(ROOT, ".dev-kv.json")),
};

server.listen(PORT, HOST, () => {
  const configured = Boolean(env.ND_USER && env.ND_PASS);
  console.log(`\n  陈一发儿 · 发友留声机\n  http://${HOST}:${PORT}\n`);
  console.log(`  音乐库账号：${configured ? "已配置" : "未配置（写入 .dev.vars）"}`);
  console.log(`  本地 KV：${env.PLAYLIST_KV.file}\n`);
});
