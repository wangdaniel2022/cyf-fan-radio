/* Small DOM + formatting helpers. No framework. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function icon(name, className = "") {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(value) {
  return esc(value).replace(/\n/g, " ");
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatHours(hours) {
  const value = Number(hours) || 0;
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Math.round(value).toLocaleString("zh-CN");
}

export function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return n.toLocaleString("zh-CN");
}

export function timeAgo(iso) {
  if (!iso) return "刚刚";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export function debounce(fn, wait = 250) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function throttle(fn, wait = 120) {
  let last = 0;
  let timer = 0;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = 0;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

export function uid(prefix = "id") {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((byte) => byte.toString(36)).join("")}`;
}

export function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

export function normalizeQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function downloadBlob(filename, content, type = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function triggerDownload(url, filename = "") {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

export function parseRoute(pathname = location.pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") return { name: "home" };
  if (clean === "/albums") return { name: "albums" };
  if (clean === "/community") return { name: "community" };
  if (clean === "/library") return { name: "library" };
  if (clean === "/about") return { name: "about" };
  if (clean === "/search") return { name: "search" };
  let match = clean.match(/^\/album\/([^/]+)$/);
  if (match) return { name: "album", id: decodeURIComponent(match[1]) };
  match = clean.match(/^\/playlist\/([^/]+)$/);
  if (match) return { name: "playlist", id: decodeURIComponent(match[1]) };
  match = clean.match(/^\/s\/([A-Za-z0-9]{6})$/);
  if (match) return { name: "shared", code: match[1].toUpperCase() };
  return { name: "notfound" };
}

export function setMeta(name, content) {
  let node = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(name.startsWith("og:") ? "property" : "name", name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

export function thumb(url, size = 300) {
  const value = String(url || "");
  if (!value.startsWith("/api/cover/")) return value || "/assets/img/cover-fallback.svg";
  return `${value}${value.includes("?") ? "&" : "?"}size=${size}`;
}

export function coverFallback(img) {
  img.addEventListener("error", () => {
    if (!img.src.endsWith("cover-fallback.svg")) img.src = "/assets/img/cover-fallback.svg";
  }, { once: true });
}

export function shuffleArray(list) {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
