/* Browser-side API client. Credentials never reach this file. */

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let payload = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.error || `请求失败（${response.status}）`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

export const api = {
  home() {
    return request("/api/home");
  },
  albums() {
    return request("/api/albums");
  },
  album(id) {
    return request(`/api/album/${encodeURIComponent(id)}`);
  },
  search(query) {
    return request(`/api/search?q=${encodeURIComponent(query)}`);
  },
  community() {
    return request("/api/community");
  },
  health() {
    return request("/api/health");
  },
  sync(code) {
    return request(`/api/sync/${encodeURIComponent(code)}`);
  },
  createSync(playlist) {
    return request("/api/sync", {
      method: "POST",
      body: JSON.stringify(playlist),
    });
  },
  updateSync(code, token, playlist, baseVersion) {
    return request(`/api/sync/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...playlist, baseVersion }),
    });
  },
  deleteSync(code, token) {
    return request(`/api/sync/${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  },
};

export function coverUrl(songOrAlbum, size = 600) {
  const raw = songOrAlbum?.cover || songOrAlbum?.coverArt || "";
  if (!raw) return "/assets/img/cover-fallback.svg";
  if (raw.startsWith("/api/cover/")) {
    const separator = raw.includes("?") ? "&" : "?";
    return `${raw}${separator}size=${size}`;
  }
  return raw;
}

export function streamUrl(song) {
  return `/api/stream/${encodeURIComponent(song.id)}`;
}

export function downloadUrl(song) {
  const name = `${song.artist || "陈一发儿"} - ${song.title || "歌曲"}`;
  const ext = song.suffix || "mp3";
  return `/api/download/${encodeURIComponent(song.id)}?name=${encodeURIComponent(name)}&ext=${encodeURIComponent(ext)}`;
}

export function shareUrl(code) {
  return `${location.origin}/s/${encodeURIComponent(code)}`;
}
