/* Anonymous, local-first library. Everything stays in this browser unless shared. */

import { uid } from "./utils.js?v=20261109-1";

const KEY = "cyf.radio.state.v1";
const BACKUP_KEY = "cyf.radio.backup.v1";
const MAX_TRACKS = 300;

const EMPTY = {
  version: 1,
  fanName: "",
  favorites: [],
  playlists: [],
  queue: [],
  current: null,
  position: 0,
  volume: 0.8,
  muted: false,
  repeat: "all",
  shuffle: false,
  createdAt: "",
  updatedAt: "",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTrack(track) {
  if (!track || !track.id) return null;
  return {
    id: String(track.id).slice(0, 80),
    title: String(track.title || "未命名歌曲").slice(0, 120),
    artist: String(track.artist || "陈一发儿").slice(0, 80),
    album: String(track.album || "").slice(0, 120),
    albumId: String(track.albumId || "").slice(0, 80),
    cover: String(track.cover || track.coverArt || "").slice(0, 240),
    duration: Math.max(0, Number(track.duration) || 0),
    suffix: String(track.suffix || "mp3").slice(0, 8),
  };
}

function normalizePlaylist(playlist) {
  if (!playlist) return null;
  const tracks = Array.isArray(playlist.tracks)
    ? playlist.tracks.map(normalizeTrack).filter(Boolean).slice(0, MAX_TRACKS)
    : [];
  return {
    id: String(playlist.id || uid("pl")),
    name: String(playlist.name || "未命名歌单").slice(0, 40),
    note: String(playlist.note || "").slice(0, 120),
    tracks,
    createdAt: playlist.createdAt || new Date().toISOString(),
    updatedAt: playlist.updatedAt || new Date().toISOString(),
    remote: playlist.remote && playlist.remote.code
      ? {
        code: String(playlist.remote.code),
        token: String(playlist.remote.token || ""),
        version: Number(playlist.remote.version) || 1,
        updatedAt: playlist.remote.updatedAt || "",
        expiresAt: playlist.remote.expiresAt || "",
      }
      : null,
  };
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.load();
    this.saveTimer = 0;
    this.state.createdAt ||= new Date().toISOString();
    this.state.updatedAt ||= new Date().toISOString();
    this.saveNow();
  }

  load() {
    const main = readJSON(KEY);
    const backup = readJSON(BACKUP_KEY);
    const source = main?.version === 1 ? main : backup?.version === 1 ? backup : null;

    if (!source) {
      return {
        ...clone(EMPTY),
        fanName: `发友 ${String(Math.floor(100 + Math.random() * 900))}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...clone(EMPTY),
      ...source,
      favorites: Array.isArray(source.favorites) ? source.favorites.map(normalizeTrack).filter(Boolean) : [],
      playlists: Array.isArray(source.playlists) ? source.playlists.map(normalizePlaylist).filter(Boolean) : [],
      queue: Array.isArray(source.queue) ? source.queue.map(normalizeTrack).filter(Boolean) : [],
      current: normalizeTrack(source.current),
      position: Number(source.position) || 0,
      volume: Number.isFinite(Number(source.volume)) ? Math.min(1, Math.max(0, Number(source.volume))) : 0.8,
      muted: Boolean(source.muted),
      repeat: ["off", "all", "one"].includes(source.repeat) ? source.repeat : "all",
      shuffle: Boolean(source.shuffle),
      fanName: source.fanName || `发友 ${String(Math.floor(100 + Math.random() * 900))}`,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(detail = {}) {
    this.listeners.forEach((fn) => fn(this.state, detail));
  }

  update(updater, detail = {}) {
    const next = typeof updater === "function" ? updater(this.state) : { ...this.state, ...updater };
    this.state = { ...next, updatedAt: new Date().toISOString() };
    this.scheduleSave();
    this.emit(detail);
    return this.state;
  }

  setFanName(name) {
    const clean = String(name || "").trim().slice(0, 24);
    if (!clean) return;
    this.update({ fanName: clean }, { type: "profile" });
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 250);
  }

  saveNow() {
    try {
      const serialized = JSON.stringify(this.state);
      localStorage.setItem(KEY, serialized);
      localStorage.setItem(BACKUP_KEY, serialized);
      if (this.state.playlists.length) {
        const meta = {
          version: 1,
          savedAt: new Date().toISOString(),
          playlists: this.state.playlists.length,
          favorites: this.state.favorites.length,
        };
        localStorage.setItem("cyf.radio.backup.meta.v1", JSON.stringify(meta));
      }
    } catch (error) {
      console.warn("本地存储写入失败", error);
      this.emit({ type: "storage-error" });
    }
  }

  /* Favorites ------------------------------------------------------------ */

  isFavorite(id) {
    return this.state.favorites.some((track) => track.id === id);
  }

  toggleFavorite(track) {
    const song = normalizeTrack(track);
    if (!song) return false;
    const exists = this.isFavorite(song.id);
    this.update((state) => ({
      ...state,
      favorites: exists
        ? state.favorites.filter((item) => item.id !== song.id)
        : [song, ...state.favorites].slice(0, MAX_TRACKS),
    }), { type: "favorite", song, active: !exists });
    return !exists;
  }

  /* Playlists ------------------------------------------------------------ */

  getPlaylist(id) {
    return this.state.playlists.find((playlist) => playlist.id === id) || null;
  }

  createPlaylist(name = "新的歌单", tracks = []) {
    const now = new Date().toISOString();
    const playlist = normalizePlaylist({
      id: uid("pl"),
      name: String(name || "新的歌单").slice(0, 40),
      tracks: tracks.slice(0, MAX_TRACKS),
      createdAt: now,
      updatedAt: now,
    });
    this.update((state) => ({
      ...state,
      playlists: [playlist, ...state.playlists],
    }), { type: "playlists", playlist });
    return playlist;
  }

  renamePlaylist(id, name) {
    const clean = String(name || "").trim().slice(0, 40);
    if (!clean) return;
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => playlist.id === id
        ? { ...playlist, name: clean, updatedAt: new Date().toISOString() }
        : playlist),
    }), { type: "playlists" });
  }

  updatePlaylistNote(id, note) {
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => playlist.id === id
        ? { ...playlist, note: String(note || "").slice(0, 120), updatedAt: new Date().toISOString() }
        : playlist),
    }), { type: "playlists" });
  }

  addTrack(playlistId, track) {
    const song = normalizeTrack(track);
    if (!song) return { ok: false, reason: "missing" };
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return { ok: false, reason: "missing" };
    if (playlist.tracks.some((item) => item.id === song.id)) {
      return { ok: false, reason: "duplicate" };
    }
    if (playlist.tracks.length >= MAX_TRACKS) {
      return { ok: false, reason: "full" };
    }
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((item) => item.id === playlistId
        ? { ...item, tracks: [...item.tracks, song], updatedAt: new Date().toISOString() }
        : item),
    }), { type: "playlists", playlistId });
    return { ok: true };
  }

  removeTrack(playlistId, trackId) {
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => playlist.id === playlistId
        ? {
          ...playlist,
          tracks: playlist.tracks.filter((track) => track.id !== trackId),
          updatedAt: new Date().toISOString(),
        }
        : playlist),
    }), { type: "playlists", playlistId });
  }

  deletePlaylist(id) {
    this.update((state) => ({
      ...state,
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
    }), { type: "playlists" });
  }

  setRemote(id, remote) {
    this.update((state) => ({
      ...state,
      playlists: state.playlists.map((playlist) => playlist.id === id
        ? { ...playlist, remote: remote ? { ...remote } : null }
        : playlist),
    }), { type: "playlists" });
  }

  importShared(remote, { author } = {}) {
    const now = new Date().toISOString();
    const playlist = normalizePlaylist({
      id: uid("pl"),
      name: remote.name || "发友分享的歌单",
      note: remote.note || `来自 ${remote.author || author || "一位发友"} 的分享`,
      tracks: remote.tracks || [],
      createdAt: now,
      updatedAt: now,
    });
    this.update((state) => ({
      ...state,
      playlists: [playlist, ...state.playlists],
    }), { type: "playlists" });
    return playlist;
  }

  /* Playback persistence ------------------------------------------------- */

  savePlayback({ queue, current, position, volume, muted, repeat, shuffle }) {
    this.update((state) => ({
      ...state,
      ...(queue ? { queue } : {}),
      ...(current !== undefined ? { current } : {}),
      ...(Number.isFinite(position) ? { position } : {}),
      ...(Number.isFinite(volume) ? { volume } : {}),
      ...(typeof muted === "boolean" ? { muted } : {}),
      ...(repeat ? { repeat } : {}),
      ...(typeof shuffle === "boolean" ? { shuffle } : {}),
    }), { type: "playback" });
  }

  /* Backup / restore ----------------------------------------------------- */

  exportData() {
    return {
      app: "陈一发儿 · 发友留声机",
      format: "cyf-radio-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      fanName: this.state.fanName,
      favorites: this.state.favorites,
      playlists: this.state.playlists.map(({ remote, ...playlist }) => playlist),
    };
  }

  importData(data, mode = "merge") {
    if (!data || data.format !== "cyf-radio-backup" || !Array.isArray(data.playlists)) {
      throw new Error("这不是有效的发友留声机备份文件");
    }

    const importedPlaylists = data.playlists.map(normalizePlaylist).filter(Boolean);
    const importedFavorites = Array.isArray(data.favorites)
      ? data.favorites.map(normalizeTrack).filter(Boolean)
      : [];

    this.update((state) => {
      if (mode === "replace") {
        return {
          ...state,
          fanName: data.fanName || state.fanName,
          playlists: importedPlaylists,
          favorites: importedFavorites,
        };
      }

      const existingIds = new Set(state.playlists.map((playlist) => playlist.id));
      const existingNames = new Set(state.playlists.map((playlist) => playlist.name));
      const merged = importedPlaylists
        .filter((playlist) => !existingIds.has(playlist.id))
        .map((playlist) => existingNames.has(playlist.name)
          ? { ...playlist, name: `${playlist.name}（导入）`.slice(0, 40) }
          : playlist);
      const favIds = new Set(state.favorites.map((track) => track.id));
      return {
        ...state,
        playlists: [...merged, ...state.playlists],
        favorites: [...state.favorites, ...importedFavorites.filter((track) => !favIds.has(track.id))].slice(0, MAX_TRACKS),
      };
    }, { type: "playlists" });

    return { playlists: importedPlaylists.length, favorites: importedFavorites.length };
  }

  storageBytes() {
    try {
      return new Blob([localStorage.getItem(KEY) || ""]).size;
    } catch {
      return 0;
    }
  }
}

export { normalizeTrack, normalizePlaylist, MAX_TRACKS };
