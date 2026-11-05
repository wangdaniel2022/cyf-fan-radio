/**
 * 陈一发儿 · 发友留声机
 * Cloudflare Pages Functions API
 *
 * 所有 Navidrome 凭据只保存在服务端环境变量里，浏览器只能拿到站内代理地址。
 * 绑定：
 *   ND_BASE      音乐库地址，例如 https://music.example.com
 *   ND_USER      Navidrome 用户名
 *   ND_PASS      Navidrome 密码
 *   PLAYLIST_KV  可选，Cloudflare KV，用于歌单分享同步
 */

const CLIENT_NAME = "cyf-fan-radio";
const API_VERSION = "1.16.1";
const SYNC_TTL = 90 * 24 * 60 * 60;
const MAX_TRACKS = 300;
const MAX_BODY = 256 * 1024;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { allow: "GET, POST, PUT, DELETE, OPTIONS" } });
  }

  try {
    const path = url.pathname.replace(/^\/api\/?/, "");

    if (path === "health") return handleHealth(env);
    if (path === "home") return handleHome(request, env);
    if (path === "albums") return handleAlbums(request, env);
    if (path === "search") return handleSearch(request, env);
    if (path === "community") return handleCommunity(env);
    if (path === "sync" && request.method === "POST") return createSync(request, env, url);
    if (path.startsWith("sync/")) return handleSync(request, env, path.slice(5));
    if (path.startsWith("album/")) return handleAlbum(request, env, decodeURIComponent(path.slice(6)));
    if (path.startsWith("cover/")) return handleCover(request, env, decodeURIComponent(path.slice(6)));
    if (path.startsWith("stream/")) return handleStream(request, env, decodeURIComponent(path.slice(7)));
    if (path.startsWith("download/")) return handleDownload(request, env, url, decodeURIComponent(path.slice(9)));

    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    console.error("[cyf-api]", error?.message || String(error));
    return json({ error: "服务暂时开小差了，请稍后再试" }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* Navidrome                                                          */
/* ------------------------------------------------------------------ */

function getConfig(env) {
  return {
    base: String(env.ND_BASE || "https://music.xn--4gqy2fnwcsx7i.top").replace(/\/+$/, ""),
    user: String(env.ND_USER || ""),
    pass: String(env.ND_PASS || ""),
  };
}

async function nd(env, endpoint, params = {}, init = {}) {
  const cfg = getConfig(env);
  if (!cfg.user || !cfg.pass) {
    const error = new Error("音乐库账号尚未配置");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const target = new URL(`${cfg.base}/rest/${endpoint}`);
  const query = {
    u: cfg.user,
    p: cfg.pass,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: "json",
    ...params,
  };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, value);
  });

  const hasSignal = Object.prototype.hasOwnProperty.call(init, "signal");
  const response = await fetch(target, {
    ...init,
    headers: {
      accept: "application/json, image/*, audio/*, */*",
      ...(init.headers || {}),
    },
    signal: hasSignal ? init.signal : AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const error = new Error(`音乐库返回 ${response.status}`);
    error.status = response.status === 401 ? 502 : 502;
    throw error;
  }

  if (init.raw) return response;

  const data = await response.json();
  const body = data["subsonic-response"];
  if (!body || body.status !== "ok") {
    const error = new Error(body?.error?.message || "音乐库返回了异常数据");
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

async function ndRaw(env, endpoint, params = {}, init = {}) {
  return nd(env, endpoint, params, { ...init, raw: true });
}

/* ------------------------------------------------------------------ */
/* Normalizers                                                        */
/* ------------------------------------------------------------------ */

function coverUrl(id) {
  if (!id) return "/assets/img/cover-fallback.svg";
  return `/api/cover/${encodeURIComponent(id)}`;
}

function normalizeSong(song) {
  if (!song || song.isDir) return null;
  const title = cleanText(song.title || song.name || "未命名歌曲");
  return {
    id: song.id,
    title,
    artist: cleanText(song.displayArtist || song.artist || "陈一发儿"),
    album: cleanText(song.album || ""),
    albumId: song.albumId || "",
    coverArt: song.coverArt || "",
    cover: coverUrl(song.coverArt),
    duration: Number(song.duration) || 0,
    suffix: song.suffix || "mp3",
    bitRate: Number(song.bitRate) || 0,
    size: Number(song.size) || 0,
    track: Number(song.track) || 0,
    year: Number(song.year) || 0,
    playCount: Number(song.playCount) || 0,
    genre: cleanText(song.genre || ""),
  };
}

function normalizeAlbum(album) {
  if (!album) return null;
  const name = cleanText(album.name || "未命名专辑");
  return {
    id: album.id,
    name,
    artist: cleanText(album.displayArtist || album.artist || "陈一发儿"),
    coverArt: album.coverArt || "",
    cover: coverUrl(album.coverArt),
    songCount: Number(album.songCount) || 0,
    duration: Number(album.duration) || 0,
    year: albumYear(name, album.year),
    playCount: Number(album.playCount) || 0,
    created: album.created || "",
    category: albumCategory(name),
  };
}

function albumYear(name, fallback) {
  const matched = String(name).match(/20\d{2}/);
  return matched ? Number(matched[0]) : Number(fallback) || 0;
}

function albumCategory(name) {
  if (/茶话会/.test(name)) return "茶话会";
  if (/直播|Live|live|集锦|聊天|邮件/.test(name)) return "直播";
  if (/电台|彩蛋|网易云/.test(name)) return "电台";
  if (/童话镇|阿婆说|弦上有春秋|原创|Spotify|陈一发儿|热门华语|最新热歌/.test(name)) return "原创";
  return "其他";
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
}

function normalizeArtist(artist) {
  const albums = (artist.album || []).map(normalizeAlbum).filter(Boolean);
  const songs = albums.reduce((sum, album) => sum + album.songCount, 0);
  const duration = albums.reduce((sum, album) => sum + album.duration, 0);
  return {
    id: artist.id,
    name: cleanText(artist.name || "陈一发儿"),
    cover: coverUrl(artist.coverArt),
    coverArt: artist.coverArt || "",
    albumCount: albums.length || Number(artist.albumCount) || 0,
    songCount: songs,
    duration,
    hours: Math.round(duration / 360) / 10,
    albums,
  };
}

/* ------------------------------------------------------------------ */
/* Home                                                               */
/* ------------------------------------------------------------------ */

const ARTIST_IDS = [
  "7yfP0IcpGCyV4x9UXURctf", // 陈一发儿（简体归档）
  "1Hzv657YXvoAWycVswzpW3", // 陳一發兒（繁体直播归档，含 2024–2026）
];
const ARTIST_NAMES = ["陈一发儿", "陳一發兒"];

const FEATURED_NAMES = [
  "2026直播歌曲集",
  "2025直播歌曲集",
  "2024直播歌曲集",
  "童话镇",
  "阿婆说",
  "弦上有春秋",
  "陈一发儿",
  "2020茶话会",
  "2023直播歌曲集",
  "Spotify发行单曲",
  "网易云电台",
];

const MEMORY_CACHE = new Map();
const MEMORY_CACHE_TTL = 10 * 60 * 1000;

async function fetchMergedArtist(env) {
  const bodies = await Promise.all(
    ARTIST_IDS.map((id) => nd(env, "getArtist", { id }).catch(() => null))
  );
  const rawArtists = bodies.map((body) => body?.artist).filter(Boolean);
  if (!rawArtists.length) throw new Error("找不到陈一发儿的音乐档案");

  const primary = normalizeArtist(rawArtists[0]);
  const albumMap = new Map();
  rawArtists.forEach((artist) => {
    ensureArray(artist.album).forEach((album) => {
      if (album?.id && !albumMap.has(album.id)) albumMap.set(album.id, album);
    });
  });

  const albums = [...albumMap.values()].map(normalizeAlbum).filter(Boolean);
  const songCount = albums.reduce((sum, album) => sum + album.songCount, 0);
  const duration = albums.reduce((sum, album) => sum + album.duration, 0);

  return {
    ...primary,
    albumCount: albums.length,
    songCount,
    duration,
    hours: Math.round(duration / 360) / 10,
    albums,
  };
}

async function handleHome(request, env) {
  const cfg = getConfig(env);
  if (!cfg.user || !cfg.pass) {
    return json({
      configured: false,
      error: "音乐库还没有配置",
      hint: "请在 Cloudflare Pages 中设置 ND_USER 和 ND_PASS 环境变量，本地开发请写入 .dev.vars。",
    }, 503);
  }

  const cacheKey = new Request(new URL("/api/home?v=5", request.url), { method: "GET" });
  const cached = await cacheMatch(cacheKey);
  if (cached) return cached;

  const [artist, ...topResults] = await Promise.all([
    fetchMergedArtist(env),
    ...ARTIST_NAMES.map((name) => nd(env, "getTopSongs", { artist: name, count: 30 }).catch(() => null)),
  ]);
  const topSongs = dedupeSongs(
    topResults.flatMap((body) => ensureArray(body?.topSongs?.song).map(normalizeSong).filter(Boolean))
  ).sort((a, b) => b.playCount - a.playCount);

  // Both simplified and traditional artist archives feed the same shelf, so
  // 2024–2026 live recordings are not lost behind an artist-name split.
  const songs = topSongs;
  const featured = chooseFeatured(artist.albums);
  const eras = buildEras(artist.albums);
  const heroSong = songs.find((song) => song.title.includes("童话镇")) || songs[0] || null;

  const payload = {
    configured: true,
    artist: {
      ...artist,
      albums: undefined,
    },
    songs: songs.slice(0, 24),
    featured,
    eras,
    heroSong,
    stats: {
      albums: artist.albumCount,
      songs: artist.songCount,
      hours: artist.hours,
    },
    generatedAt: new Date().toISOString(),
  };

  return cachedJson(cacheKey, payload, 300);
}

function chooseFeatured(albums) {
  const result = [];
  const seen = new Set();

  for (const name of FEATURED_NAMES) {
    const album = albums.find((item) => item.name === name && item.songCount > 1);
    if (album && !seen.has(album.id)) {
      result.push(album);
      seen.add(album.id);
    }
  }

  const sorted = [...albums]
    .filter((album) => album.songCount > 1 && album.songCount <= 180 && !/聊天|邮件|Unknown/i.test(album.name))
    .filter((album) => album.name !== "原创大碟")
    .sort((a, b) => b.playCount - a.playCount || b.songCount - a.songCount);

  for (const album of sorted) {
    if (result.length >= 12) break;
    if (seen.has(album.id)) continue;
    if (result.some((item) => item.coverArt === album.coverArt)) continue;
    result.push(album);
    seen.add(album.id);
  }

  return result.slice(0, 12);
}

function buildEras(albums) {
  const byYear = new Map();
  albums.forEach((album) => {
    if (!album.year) return;
    const item = byYear.get(album.year) || { year: album.year, albums: 0, songs: 0 };
    item.albums += 1;
    item.songs += album.songCount;
    byYear.set(album.year, item);
  });
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

function dedupeSongs(songs) {
  const seen = new Set();
  return songs.filter((song) => {
    if (!song || seen.has(song.id)) return false;
    seen.add(song.id);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Albums / search                                                    */
/* ------------------------------------------------------------------ */

async function handleAlbums(request, env) {
  const artist = await fetchMergedArtist(env);
  const albums = [...artist.albums].sort((a, b) => b.year - a.year || b.playCount - a.playCount);

  return json({
    artist: { id: artist.id, name: artist.name },
    albums,
    stats: { albums: artist.albumCount, songs: artist.songCount, hours: artist.hours },
  }, 200, { "cache-control": "public, max-age=300" });
}

async function handleAlbum(request, env, id) {
  if (!isSafeId(id)) return json({ error: "专辑编号不正确" }, 400);
  const body = await nd(env, "getAlbum", { id });
  const album = normalizeAlbum(body.album);
  const songs = ensureArray(body.album?.song)
    .map(normalizeSong)
    .filter(Boolean)
    .sort((a, b) => a.track - b.track || a.title.localeCompare(b.title, "zh"));

  return json({ album, songs }, 200, { "cache-control": "public, max-age=300" });
}

async function handleSearch(request, env) {
  const url = new URL(request.url);
  const query = cleanText(url.searchParams.get("q") || "").slice(0, 60);
  if (!query) return json({ query: "", songs: [], albums: [], artists: [] });

  const body = await nd(env, "search3", {
    query,
    artistCount: 5,
    albumCount: 12,
    songCount: 40,
  });
  const result = body.searchResult3 || {};
  return json({
    query,
    songs: ensureArray(result.song).map(normalizeSong).filter(Boolean),
    albums: ensureArray(result.album).map(normalizeAlbum).filter(Boolean),
    artists: ensureArray(result.artist).map((artist) => ({
      id: artist.id,
      name: cleanText(artist.name),
      cover: coverUrl(artist.coverArt),
      albumCount: Number(artist.albumCount) || 0,
    })),
  }, 200, { "cache-control": "public, max-age=120" });
}

/* ------------------------------------------------------------------ */
/* Media proxies                                                      */
/* ------------------------------------------------------------------ */

async function handleCover(request, env, id) {
  if (!isSafeId(id)) return placeholderCover("封面编号不正确");
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("size")) || 600;
  const size = [300, 600, 900, 1200].includes(requested) ? requested : 600;

  const cacheKey = new Request(new URL(`/api/cover/${encodeURIComponent(id)}?size=${size}`, request.url), { method: "GET" });
  const cached = await cacheMatch(cacheKey);
  if (cached) return cached;

  try {
    const upstream = await ndRaw(env, "getCoverArt", { id, size });
    const bytes = await upstream.arrayBuffer();
    if (!bytes.byteLength) return placeholderCover("暂无封面");

    const response = new Response(bytes, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/jpeg",
        "cache-control": "public, max-age=604800, immutable",
        "x-content-type-options": "nosniff",
      },
    });
    await cachePut(cacheKey, response.clone());
    return response;
  } catch (error) {
    console.warn("[cyf-api] cover failed", error?.message || String(error));
    return placeholderCover("封面走丢了");
  }
}

async function handleStream(request, env, id) {
  if (!isSafeId(id)) return new Response("歌曲编号不正确", { status: 400 });
  const range = request.headers.get("range") || undefined;
  const upstream = await ndRaw(env, "stream", { id }, {
    headers: range ? { range } : {},
    redirect: "follow",
    signal: null,
  });

  const headers = new Headers();
  copyHeader(upstream, headers, "content-type", "audio/mpeg");
  copyHeader(upstream, headers, "content-length");
  copyHeader(upstream, headers, "content-range");
  copyHeader(upstream, headers, "accept-ranges", "bytes");
  copyHeader(upstream, headers, "etag");
  copyHeader(upstream, headers, "last-modified");
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  headers.set("x-content-type-options", "nosniff");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function handleDownload(request, env, url, id) {
  if (!isSafeId(id)) return new Response("歌曲编号不正确", { status: 400 });
  const name = sanitizeFilename(url.searchParams.get("name") || "");
  const ext = sanitizeExtension(url.searchParams.get("ext") || "mp3");

  const upstream = await ndRaw(env, "download", { id }, { redirect: "follow", signal: null });
  const headers = new Headers();
  copyHeader(upstream, headers, "content-type", "application/octet-stream");
  copyHeader(upstream, headers, "content-length");

  const filename = name || `陈一发儿-${id}`;
  const withExt = /\.[a-z0-9]{2,5}$/i.test(filename) ? filename : `${filename}.${ext}`;
  headers.set("content-disposition", contentDisposition(withExt));
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, { status: upstream.status, headers });
}

/* ------------------------------------------------------------------ */
/* Playlist sync (KV)                                                 */
/* ------------------------------------------------------------------ */

async function createSync(request, env, url) {
  if (!sameOrigin(request)) return json({ error: "跨站请求已被拒绝" }, 403);
  if (!env.PLAYLIST_KV) return json({ error: "云端同步还没有开启", code: "KV_NOT_CONFIGURED" }, 503);
  if (!hasJsonBody(request)) return json({ error: "请求内容过大" }, 413);

  const limited = await rateLimit(request, env);
  if (limited) return json({ error: "今天创建的分享有点多，明天再来吧" }, 429);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "歌单数据格式不正确" }, 400);
  }

  const playlist = sanitizePlaylist(payload);
  if (!playlist.tracks.length) return json({ error: "空歌单还不能分享哦" }, 400);

  const code = await uniqueCode(env);
  const token = randomHex(24);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const record = {
    code,
    name: playlist.name,
    author: playlist.author,
    note: playlist.note,
    tracks: playlist.tracks,
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + SYNC_TTL * 1000).toISOString(),
    tokenHash,
  };

  await env.PLAYLIST_KV.put(`sync:${code}`, JSON.stringify(record), { expirationTtl: SYNC_TTL });
  await env.PLAYLIST_KV.put(`recent:${Date.now().toString().padStart(13, "0")}:${code}`, code, {
    expirationTtl: SYNC_TTL,
  });

  return json({
    code,
    token,
    version: 1,
    url: `${url.origin}/s/${code}`,
    expiresAt: record.expiresAt,
  }, 201);
}

async function handleSync(request, env, code) {
  if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: "同步码格式不正确" }, 400);
  if (!env.PLAYLIST_KV) return json({ error: "云端同步还没有开启", code: "KV_NOT_CONFIGURED" }, 503);

  const key = `sync:${code}`;
  const raw = await env.PLAYLIST_KV.get(key, "text");
  if (!raw) return json({ error: "这个同步码不存在，或歌单已经过期" }, 404);

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return json({ error: "歌单数据损坏了" }, 500);
  }

  if (request.method === "GET") {
    return json({ ...publicRecord(record), shared: true });
  }

  if (!sameOrigin(request)) return json({ error: "跨站请求已被拒绝" }, 403);

  if (request.method === "DELETE") {
    if (!(await verifyToken(request, record))) return json({ error: "没有修改这个歌单的权限" }, 403);
    await env.PLAYLIST_KV.delete(key);
    return json({ ok: true });
  }

  if (request.method === "PUT") {
    if (!(await verifyToken(request, record))) return json({ error: "没有修改这个歌单的权限" }, 403);
    if (!hasJsonBody(request)) return json({ error: "请求内容过大" }, 413);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "歌单数据格式不正确" }, 400);
    }

    if (payload.baseVersion !== undefined && Number(payload.baseVersion) !== Number(record.version)) {
      return json({
        error: "云端歌单有了新版本，请先载入最新版本再保存",
        code: "VERSION_CONFLICT",
        server: publicRecord(record),
      }, 409);
    }

    const next = sanitizePlaylist(payload);
    if (!next.tracks.length) return json({ error: "空歌单还不能同步哦" }, 400);

    record.name = next.name;
    record.author = next.author;
    record.note = next.note;
    record.tracks = next.tracks;
    record.version = Number(record.version) + 1;
    record.updatedAt = new Date().toISOString();

    await env.PLAYLIST_KV.put(key, JSON.stringify(record), { expirationTtl: SYNC_TTL });
    return json({
      code: record.code,
      version: record.version,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    });
  }

  return json({ error: "不支持的请求方式" }, 405);
}

async function handleCommunity(env) {
  if (!env.PLAYLIST_KV) return json({ enabled: false, playlists: [] });
  const listed = await env.PLAYLIST_KV.list({ prefix: "recent:", limit: 30 });
  const keys = (listed.keys || []).slice().sort((a, b) => b.name.localeCompare(a.name)).slice(0, 12);

  const items = await Promise.all(keys.map(async (key) => {
    const code = key.name.split(":").pop();
    const raw = await env.PLAYLIST_KV.get(`sync:${code}`, "text");
    if (!raw) return null;
    try {
      const record = JSON.parse(raw);
      const first = record.tracks?.[0];
      return {
        code: record.code,
        name: record.name,
        author: record.author,
        note: record.note,
        trackCount: record.tracks?.length || 0,
        cover: first?.cover || "",
        updatedAt: record.updatedAt,
        createdAt: record.createdAt,
      };
    } catch {
      return null;
    }
  }));

  return json({
    enabled: true,
    playlists: items.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  }, 200, { "cache-control": "no-store" });
}

function sanitizePlaylist(input) {
  const tracks = ensureArray(input?.tracks).slice(0, MAX_TRACKS).map((track) => ({
    id: cleanText(track?.id).slice(0, 80),
    title: cleanText(track?.title).slice(0, 120),
    artist: cleanText(track?.artist || "陈一发儿").slice(0, 80),
    album: cleanText(track?.album).slice(0, 120),
    albumId: cleanText(track?.albumId).slice(0, 80),
    cover: normalizeStoredCover(track?.cover),
    duration: Math.max(0, Math.min(86400, Number(track?.duration) || 0)),
  })).filter((track) => track.id && track.title);

  return {
    name: cleanText(input?.name || "发友歌单").slice(0, 40) || "发友歌单",
    author: cleanText(input?.author || "匿名发友").slice(0, 24) || "匿名发友",
    note: cleanText(input?.note || "").slice(0, 120),
    tracks,
  };
}

function normalizeStoredCover(value) {
  const cover = String(value || "");
  if (/^\/api\/cover\/[A-Za-z0-9_\-%.]+$/.test(cover)) return cover;
  if (/^[A-Za-z0-9_\-]{4,120}$/.test(cover)) return `/api/cover/${encodeURIComponent(cover)}`;
  return "/assets/img/cover-fallback.svg";
}

function publicRecord(record) {
  return {
    code: record.code,
    name: record.name,
    author: record.author,
    note: record.note,
    tracks: record.tracks || [],
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  };
}

async function verifyToken(request, record) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !record.tokenHash) return false;
  return (await sha256(token)) === record.tokenHash;
}

async function rateLimit(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const day = new Date().toISOString().slice(0, 10);
  const key = `rate:${ip}:${day}`;
  try {
    const count = Number(await env.PLAYLIST_KV.get(key)) || 0;
    if (count >= 12) return true;
    await env.PLAYLIST_KV.put(key, String(count + 1), { expirationTtl: 86400 });
  } catch {
    return false;
  }
  return false;
}

async function uniqueCode(env) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
    if (!(await env.PLAYLIST_KV.get(`sync:${code}`))) return code;
  }
  throw new Error("无法生成同步码");
}

/* ------------------------------------------------------------------ */
/* Health / utilities                                                 */
/* ------------------------------------------------------------------ */

async function handleHealth(env) {
  let library = false;
  let version = "";
  try {
    const body = await nd(env, "ping");
    library = body.status === "ok";
    version = body.serverVersion || "";
  } catch {
    library = false;
  }
  return json({
    ok: library,
    library,
    sync: Boolean(env.PLAYLIST_KV),
    version,
    site: "陈一发儿 · 发友留声机",
  });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isSafeId(id) {
  return typeof id === "string" && id.length > 0 && id.length < 160 && /^[A-Za-z0-9_\-]+$/.test(id);
}

function copyHeader(source, target, name, fallback = "") {
  const value = source.headers.get(name) || fallback;
  if (value) target.set(name, value);
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function sanitizeExtension(value) {
  const ext = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "ape"].includes(ext) ? ext : "mp3";
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function hasJsonBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  return length <= MAX_BODY;
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function placeholderCover(message) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#241b17"/><stop offset="1" stop-color="#47251d"/></linearGradient></defs>
  <rect width="600" height="600" rx="24" fill="url(#g)"/>
  <circle cx="300" cy="300" r="170" fill="none" stroke="#e5c9a0" stroke-opacity=".16" stroke-width="1.5"/>
  <circle cx="300" cy="300" r="110" fill="none" stroke="#e5c9a0" stroke-opacity=".12" stroke-width="1.5"/>
  <text x="300" y="322" text-anchor="middle" font-size="112" font-family="serif" fill="#e7c99b" fill-opacity=".78">发</text>
  <text x="300" y="388" text-anchor="middle" font-size="18" font-family="sans-serif" letter-spacing="6" fill="#e7c99b" fill-opacity=".45">CHEN YIFA</text>
  </svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

async function cacheMatch(key) {
  if (typeof caches !== "undefined" && caches.default) {
    try {
      const cached = await caches.default.match(key);
      if (cached) return cached;
    } catch {
      /* fall through to isolate memory */
    }
  }
  const memory = MEMORY_CACHE.get(key.url);
  if (memory && memory.expires > Date.now()) return memory.response.clone();
  if (memory) MEMORY_CACHE.delete(key.url);
  return null;
}

async function cachePut(key, response) {
  if (typeof caches !== "undefined" && caches.default) {
    try {
      await caches.default.put(key, response.clone());
    } catch {
      /* cache is best-effort */
    }
  }
  if (MEMORY_CACHE.size >= 120) {
    const oldest = MEMORY_CACHE.keys().next().value;
    MEMORY_CACHE.delete(oldest);
  }
  MEMORY_CACHE.set(key.url, {
    expires: Date.now() + MEMORY_CACHE_TTL,
    response: response.clone(),
  });
}

async function cachedJson(key, data, seconds) {
  const response = new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${seconds}, s-maxage=${seconds}`,
    },
  });
  await cachePut(key, response.clone());
  return response;
}
