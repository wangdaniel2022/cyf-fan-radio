/* App bootstrap, router, actions. */

import { api, downloadUrl, shareUrl } from "./api.js?v=20261106-1";
import { getQueue, getSong, registerQueue, registerSongs } from "./data.js?v=20261106-1";
import { Player } from "./player.js?v=20261106-1";
import { Store } from "./store.js?v=20261106-1";
import {
  closeModal,
  closeNowPanel,
  closeQueue,
  confirmDialog,
  modalShell,
  openModal,
  openNowPanel,
  openQueue,
  promptDialog,
  showSearchDialog,
  showShareResult,
  showSongMenu,
  toast,
} from "./ui.js?v=20261106-1";
import {
  aboutView,
  albumView,
  albumsView,
  communityView,
  errorView,
  homeView,
  libraryView,
  notFoundView,
  playlistView,
  searchView,
  sharedMissingView,
  sharedView,
} from "./views.js?v=20261106-1";
import {
  copyText,
  downloadBlob,
  esc,
  icon,
  normalizeQuery,
  parseRoute,
  setMeta,
  triggerDownload,
} from "./utils.js?v=20261106-1";

const store = new Store();
const audio = document.getElementById("audio");
const view = document.getElementById("view");
const player = new Player({
  audio,
  store,
  onError: (message) => toast(message, "info"),
});

const app = {
  home: null,
  albums: null,
  community: null,
  search: new Map(),
  album: new Map(),
  shared: new Map(),
  route: parseRoute(),
  renderToken: 0,
  booted: false,
};

let revealObserver = null;
let parallaxBound = false;

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

player.init();
bindGlobalEvents();
updateLibraryCount();
updateHeaderState();
setGitHubLink();

loadInitial();

async function loadInitial() {
  await renderRoute({ replace: true });
  app.booted = true;
}

/* ------------------------------------------------------------------ */
/* Routing                                                            */
/* ------------------------------------------------------------------ */

async function renderRoute({ preserveScroll = false, replace = false } = {}) {
  const token = ++app.renderToken;
  app.route = parseRoute();
  const route = app.route;
  const scrollY = window.scrollY;
  closeMobileMenu();
  updateNav(route);
  updateHeaderState();

  try {
    if (route.name === "home") {
      if (!app.home) view.innerHTML = skeletonHome();
      const data = await loadHome();
      if (token !== app.renderToken) return;
      view.innerHTML = homeView(data, store.state);
      afterRender({ home: true });
      setPageTitle("陈一发儿 · 发友留声机");
      setMeta("og:title", "陈一发儿 · 发友留声机");
      setMeta("og:description", "把喜欢唱成岁月。发友专属的匿名音乐馆，收录 10,000+ 首歌与十余年直播记忆。");
      return;
    }

    if (route.name === "albums") {
      view.innerHTML = simpleLoader("正在把唱片搬出来…");
      const data = await loadAlbums();
      if (token !== app.renderToken) return;
      const params = new URLSearchParams(location.search);
      view.innerHTML = albumsView(data, {
        year: params.get("year") || "",
        category: params.get("category") || "全部",
      });
      afterRender();
      setPageTitle(`唱片架${params.get("year") ? ` · ${params.get("year")}` : ""} · 陈一发儿留声机`);
      return;
    }

    if (route.name === "album") {
      view.innerHTML = simpleLoader("正在翻开这张唱片…");
      const data = await loadAlbum(route.id);
      if (token !== app.renderToken) return;
      registerQueue(`album:${data.album.id}`, data.songs);
      view.innerHTML = albumView(data, store.state);
      afterRender();
      setPageTitle(`${data.album.name} · 陈一发儿留声机`);
      setMeta("og:title", `${data.album.name} · 陈一发儿`);
      return;
    }

    if (route.name === "search") {
      const query = normalizeQuery(new URLSearchParams(location.search).get("q") || "");
      if (!query) {
        view.innerHTML = searchView("", null, store.state);
        afterRender();
        setPageTitle("找一首歌 · 陈一发儿留声机");
        return;
      }
      view.innerHTML = searchView(query, null, store.state);
      const data = await loadSearch(query);
      if (token !== app.renderToken) return;
      registerQueue("search", data.songs);
      view.innerHTML = searchView(query, data, store.state);
      afterRender();
      setPageTitle(`搜索「${query}」 · 陈一发儿留声机`);
      return;
    }

    if (route.name === "library") {
      const community = await loadCommunity();
      if (token !== app.renderToken) return;
      view.innerHTML = libraryView(store.state, community);
      afterRender();
      setPageTitle("我的歌单 · 陈一发儿留声机");
      return;
    }

    if (route.name === "playlist") {
      await renderPlaylist(route.id, token);
      return;
    }

    if (route.name === "community") {
      view.innerHTML = simpleLoader("正在听发友们最近在听什么…");
      const community = await loadCommunity(true);
      if (token !== app.renderToken) return;
      view.innerHTML = communityView(community, store.state);
      afterRender();
      setPageTitle("发友歌单广场 · 陈一发儿留声机");
      return;
    }

    if (route.name === "shared") {
      view.innerHTML = simpleLoader("正在打开这份发友歌单…");
      const remote = await loadShared(route.code);
      if (token !== app.renderToken) return;
      remote.id = remote.code;
      registerQueue(`playlist:${remote.code}`, remote.tracks || []);
      view.innerHTML = sharedView(remote, store.state);
      afterRender();
      setPageTitle(`${remote.name} · 发友歌单`);
      return;
    }

    if (route.name === "about") {
      let stats = app.home?.stats || { albums: 95, songs: 11907, hours: 1720 };
      view.innerHTML = aboutView({ stats });
      afterRender();
      setPageTitle("关于本站 · 陈一发儿留声机");
      setMeta("og:title", "关于 · 陈一发儿发友留声机");
      return;
    }

    view.innerHTML = notFoundView();
    afterRender();
    setPageTitle("页面走丢了 · 陈一发儿留声机");
  } catch (error) {
    if (token !== app.renderToken) return;
    if (route.name === "shared" && error?.status === 404) {
      view.innerHTML = sharedMissingView(route.code);
      setPageTitle("这份歌单不在了 · 陈一发儿留声机");
      afterRender();
      return;
    }
    console.error("[cyf]", error);
    view.innerHTML = errorView(error, { configured: error?.payload?.configured !== false });
    setPageTitle("暂时听不了 · 陈一发儿留声机");
    afterRender();
  } finally {
    if (preserveScroll) window.scrollTo({ top: scrollY, behavior: "instant" });
    else if (!replace && !location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }
}

async function renderPlaylist(id, token) {
  if (id === "favorites") {
    const playlist = {
      id: "favorites",
      name: "我的收藏",
      note: "所有点过心的歌",
      tracks: store.state.favorites,
    };
    registerQueue("playlist:favorites", playlist.tracks);
    view.innerHTML = playlistView(playlist, { favorites: true, state: store.state });
    afterRender();
    setPageTitle("我的收藏 · 陈一发儿留声机");
    return;
  }

  const playlist = store.getPlaylist(id);
  if (!playlist) {
    view.innerHTML = notFoundView();
    afterRender();
    return;
  }
  if (token !== app.renderToken) return;
  registerQueue(`playlist:${playlist.id}`, playlist.tracks);
  view.innerHTML = playlistView(playlist, { state: store.state });
  afterRender();
  setPageTitle(`${playlist.name} · 我的歌单`);
}

function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) {
    location.href = url.href;
    return;
  }
  if (url.pathname === location.pathname && url.search === location.search) {
    renderRoute();
    return;
  }
  if (replace) history.replaceState({}, "", url.pathname + url.search);
  else history.pushState({}, "", url.pathname + url.search);
  renderRoute();
}

function updateNav(route) {
  const section = route.name === "album" || route.name === "albums"
    ? "albums"
    : route.name === "playlist" || route.name === "library"
      ? "library"
      : route.name === "shared" || route.name === "community"
        ? "community"
        : route.name;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === section);
  });
}

function updateHeaderState() {
  const header = document.getElementById("site-header");
  const nonHome = app.route?.name !== "home";
  header.classList.toggle("is-solid", nonHome);
  header.classList.toggle("is-scrolled", nonHome || window.scrollY > 24);
}

/* ------------------------------------------------------------------ */
/* Data loaders                                                       */
/* ------------------------------------------------------------------ */

async function loadHome(force = false) {
  if (app.home && !force) return app.home;
  const [home, community] = await Promise.all([
    api.home(),
    api.community().catch(() => ({ enabled: false, playlists: [] })),
  ]);
  home.community = community;
  app.home = home;
  app.community = community;
  registerQueue("home", home.songs);
  registerSongs(home.songs);
  if (home.heroSong) registerSongs([home.heroSong]);
  return home;
}

async function loadAlbums(force = false) {
  if (app.albums && !force) return app.albums;
  app.albums = await api.albums();
  registerSongs(app.albums.albums);
  return app.albums;
}

async function loadAlbum(id) {
  if (app.album.has(id)) return app.album.get(id);
  const promise = api.album(id).then((data) => {
    app.album.set(id, data);
    registerSongs(data.songs);
    return data;
  }).catch((error) => {
    app.album.delete(id);
    throw error;
  });
  app.album.set(id, promise);
  return promise;
}

async function loadCommunity(force = false) {
  if (app.community && !force) return app.community;
  try {
    app.community = await api.community();
  } catch {
    app.community = { enabled: false, playlists: [] };
  }
  if (app.home) app.home.community = app.community;
  return app.community;
}

async function loadSearch(query) {
  if (app.search.has(query)) return app.search.get(query);
  const promise = api.search(query).then((data) => {
    app.search.set(query, data);
    return data;
  }).catch((error) => {
    app.search.delete(query);
    throw error;
  });
  app.search.set(query, promise);
  return promise;
}

async function loadShared(code) {
  if (app.shared.has(code)) return app.shared.get(code);
  const promise = api.sync(code).then((data) => {
    app.shared.set(code, data);
    return data;
  });
  app.shared.set(code, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/* Post render                                                        */
/* ------------------------------------------------------------------ */

function afterRender({ home = false } = {}) {
  player.onPageRendered();
  setupReveal();
  setupHeroParallax(home);
  bindPageForms();
  bindArchiveFilters();
  updateLibraryCount();
}

function setupReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }
  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
}

function setupHeroParallax(home) {
  if (!home) return;
  const stage = document.getElementById("hero-stage");
  if (!stage || parallaxBound) return;
  parallaxBound = true;
  const hero = stage.closest(".hero");
  hero?.addEventListener("pointermove", (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 900) return;
    const rect = hero.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    stage.style.setProperty("--px", x.toFixed(3));
    stage.style.setProperty("--py", y.toFixed(3));
  });
  hero?.addEventListener("pointerleave", () => {
    stage.style.setProperty("--px", "0");
    stage.style.setProperty("--py", "0");
  });
}

function bindPageForms() {
  const homeForm = document.getElementById("home-code-form");
  homeForm?.addEventListener("submit", handleCodeSubmit);
  const libraryForm = document.getElementById("library-code-form");
  libraryForm?.addEventListener("submit", handleCodeSubmit);
  const communityForm = document.getElementById("community-code-form");
  communityForm?.addEventListener("submit", handleCodeSubmit);
  const searchForm = document.getElementById("search-page-form");
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = normalizeQuery(new FormData(searchForm).get("q"));
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  });
}

function bindArchiveFilters() {
  const categoryChips = document.querySelectorAll("[data-archive-filter]");
  const yearChips = document.querySelectorAll("[data-archive-year]");
  if (!categoryChips.length && !yearChips.length) return;

  const go = (nextYear, nextCategory) => {
    const params = new URLSearchParams();
    if (nextYear) params.set("year", nextYear);
    if (nextCategory && nextCategory !== "全部") params.set("category", nextCategory);
    navigate(`/albums${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const current = () => ({
    year: new URLSearchParams(location.search).get("year") || "",
    category: new URLSearchParams(location.search).get("category") || "全部",
  });

  categoryChips.forEach((chip) => {
    chip.addEventListener("click", () => go(current().year, chip.dataset.archiveFilter));
  });
  yearChips.forEach((chip) => {
    chip.addEventListener("click", () => go(chip.dataset.archiveYear, current().category));
  });
}

/* ------------------------------------------------------------------ */
/* Global events                                                      */
/* ------------------------------------------------------------------ */

function bindGlobalEvents() {
  history.scrollRestoration = "manual";
  window.addEventListener("popstate", () => renderRoute());
  window.addEventListener("scroll", updateHeaderState, { passive: true });

  document.addEventListener("click", (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (actionNode) {
      event.preventDefault();
      handleAction(actionNode.dataset.action, actionNode, event);
      return;
    }

    const link = event.target.closest("a[data-link]");
    if (link) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target === "_blank") return;
      event.preventDefault();
      navigate(link.getAttribute("href"));
      return;
    }

    const filter = event.target.closest("[data-filter-album]");
    if (filter) {
      event.preventDefault();
      applyAlbumFilter(filter.dataset.filterAlbum);
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );
    const modalOpen = document.getElementById("modal-layer")?.classList.contains("is-open");

    if (event.key === "Escape") {
      closeQueue();
      closeNowPanel();
      if (document.getElementById("mobile-menu")?.hidden === false) closeMobileMenu();
      return;
    }
    if (typing || modalOpen) return;

    if (event.key === "/") {
      event.preventDefault();
      openSearchDialog();
    } else if (event.code === "Space") {
      event.preventDefault();
      player.toggle();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      player.next(true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      player.prev();
    } else if (event.key.toLowerCase() === "m") {
      player.toggleMute();
    } else if (event.key.toLowerCase() === "l") {
      player.toggleFavorite();
    } else if (event.key === "Enter") {
      if (event.target.closest?.("button, a")) return;
      const row = event.target.closest?.("[data-song-id][role='button']");
      if (row) {
        event.preventDefault();
        playSongById(row.dataset.songId, row.dataset.queue);
      }
    }
  });

  document.addEventListener("error", (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && !img.src.endsWith("cover-fallback.svg")) {
      img.src = "/assets/img/cover-fallback.svg";
    }
  }, true);

  document.querySelectorAll("[data-action='close-modal']").forEach((node) => {
    node.addEventListener("click", closeModal);
  });

  maybeRegisterServiceWorker();
}

async function handleAction(action, node, event) {
  switch (action) {
    case "open-search":
      openSearchDialog();
      break;
    case "toggle-menu":
      toggleMobileMenu();
      break;
    case "play-song":
      playSongById(node.dataset.songId, node.dataset.queue);
      break;
    case "play-random":
      playRandom(node.dataset.queue || "home");
      break;
    case "toggle-favorite": {
      const song = resolveSong(node.dataset.songId);
      if (!song) break;
      const active = store.toggleFavorite(song);
      syncFavoriteButtons(song.id);
      toast(active ? `已收藏「${song.title}」` : `已取消收藏「${song.title}」`);
      player.syncFavorite();
      break;
    }
    case "download-song": {
      const song = resolveSong(node.dataset.songId);
      if (!song) break;
      triggerDownload(downloadUrl(song), `${song.artist || "陈一发儿"} - ${song.title}.${song.suffix || "mp3"}`);
      toast(`开始下载「${song.title}」`);
      break;
    }
    case "add-song": {
      const song = resolveSong(node.dataset.songId);
      if (song) openAddSong(song);
      break;
    }
    case "play-album":
    case "play-album-now": {
      const data = await withToast(loadAlbum(node.dataset.albumId));
      if (!data?.songs?.length) break;
      player.play(data.songs[0], data.songs, { autoplay: true });
      player.onPageRendered();
      break;
    }
    case "play-random-album": {
      const data = await withToast(loadAlbum(node.dataset.albumId));
      if (!data?.songs?.length) break;
      const song = data.songs[Math.floor(Math.random() * data.songs.length)];
      player.play(song, data.songs, { autoplay: true });
      player.onPageRendered();
      break;
    }
    case "add-album-to-playlist": {
      const data = await withToast(loadAlbum(node.dataset.albumId));
      if (data) openAddAlbum(data);
      break;
    }
    case "shelf-scroll": {
      const shelf = document.getElementById("album-shelf");
      shelf?.scrollBy({ left: Number(node.dataset.direction) * Math.max(420, shelf.clientWidth * 0.65), behavior: "smooth" });
      break;
    }
    case "toggle-shuffle":
      player.toggleShuffle();
      break;
    case "cycle-repeat":
      player.cycleRepeat();
      break;
    case "toggle-play":
      player.toggle();
      break;
    case "prev":
      player.prev();
      break;
    case "next":
      player.next(true);
      break;
    case "toggle-mute":
      player.toggleMute();
      break;
    case "toggle-current-favorite":
      player.toggleFavorite();
      syncFavoriteButtons(player.current?.id);
      break;
    case "download-current":
      player.downloadCurrent();
      break;
    case "add-current":
      if (player.current) openAddSong(player.current);
      break;
    case "open-now":
      openNowPanel();
      break;
    case "close-now":
      closeNowPanel();
      break;
    case "open-queue":
      openQueue();
      break;
    case "close-queue":
      closeQueue();
      break;
    case "queue-play": {
      const index = Number(node.dataset.index);
      player.playIndex(index, true);
      player.onPageRendered();
      break;
    }
    case "queue-remove":
      event.stopPropagation();
      player.removeFromQueue(node.dataset.id);
      break;
    case "clear-queue":
      player.clearQueue();
      toast("播放队列已清空，只留下正在播放的这首");
      break;
    case "close-modal":
      closeModal();
      break;
    case "new-playlist":
      await createPlaylistFlow();
      break;
    case "edit-fan-name": {
      const name = await promptDialog({
        title: "你的发友名",
        description: "只会出现在你主动分享的歌单上，不会绑定任何账号。",
        label: "昵称",
        value: store.state.fanName,
        maxlength: 24,
        placeholder: "比如：深夜听歌的发友",
      });
      if (!name) break;
      store.setFanName(name);
      toast(`好，以后就叫你「${store.state.fanName}」`);
      renderRoute({ preserveScroll: true });
      break;
    }
    case "rename-playlist":
      await renamePlaylistFlow(node.dataset.playlistId);
      break;
    case "delete-playlist":
      await deletePlaylistFlow(node.dataset.playlistId);
      break;
    case "share-playlist":
      await sharePlaylistById(node.dataset.playlistId);
      break;
    case "open-share-picker":
      await openSharePicker();
      break;
    case "export-backup":
      exportBackup();
      break;
    case "import-backup":
      importBackupFlow();
      break;
    case "export-playlist":
      exportPlaylist(node.dataset.playlistId);
      break;
    case "play-playlist":
    case "play-playlist-now": {
      const playlist = getPlaylistForPlayback(node.dataset.playlistId, node.dataset.favorites === "1");
      if (!playlist?.tracks?.length) {
        toast("这个歌单还是空的");
        break;
      }
      player.play(playlist.tracks[0], playlist.tracks, { autoplay: true });
      player.onPageRendered();
      break;
    }
    case "play-favorites": {
      const tracks = store.state.favorites;
      if (!tracks.length) {
        toast("还没有收藏的歌");
        break;
      }
      player.play(tracks[0], tracks, { autoplay: true });
      player.onPageRendered();
      break;
    }
    case "save-shared": {
      const remote = await app.shared.get(node.dataset.code);
      if (!remote) {
        toast("歌单数据已经过期了", "error");
        break;
      }
      const playlist = store.importShared(remote);
      updateLibraryCount();
      toast(`已保存「${playlist.name}」到我的歌单`);
      navigate(`/playlist/${playlist.id}`);
      break;
    }
    case "retry":
      app.home = null;
      app.albums = null;
      app.album.clear();
      app.search.clear();
      app.community = null;
      renderRoute();
      break;
    case "copy-text": {
      const text = node.dataset.copy || "";
      const ok = await copyText(text);
      toast(ok ? `已复制「${text}」` : "复制失败，请手动选择");
      break;
    }
    case "toggle-secret": {
      const value = node.closest(".login-row")?.querySelector("[data-secret]");
      if (!value) break;
      const nowMasked = value.dataset.masked !== "true";
      value.dataset.masked = String(nowMasked);
      value.textContent = nowMasked ? "••••••••" : value.dataset.value;
      node.classList.toggle("is-masked", nowMasked);
      node.setAttribute("aria-label", nowMasked ? "显示密码" : "隐藏密码");
      node.querySelector("use")?.setAttribute("href", nowMasked ? "#i-eye" : "#i-eye-off");
      break;
    }
    case "scroll-to": {
      document.querySelector(node.dataset.target)?.scrollIntoView({ behavior: "smooth" });
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Playback actions                                                   */
/* ------------------------------------------------------------------ */

function resolveSong(id) {
  return getSong(id) || store.state.favorites.find((song) => song.id === id) || store.state.queue.find((song) => song.id === id) || null;
}

function queueFor(name) {
  if (!name) return [];
  if (name === "home") return app.home?.songs || [];
  if (name === "search") return getQueue("search");
  if (name.startsWith("playlist:")) {
    const id = name.slice("playlist:".length);
    if (id === "favorites") return store.state.favorites;
    return store.getPlaylist(id)?.tracks || getQueue(name);
  }
  return getQueue(name);
}

function playSongById(id, queueName = "home") {
  const song = resolveSong(id);
  if (!song) return;
  const queue = queueFor(queueName);
  if (player.current?.id === song.id) {
    player.toggle();
    return;
  }
  player.play(song, queue.length ? queue : [song], { autoplay: true });
  player.onPageRendered();
}

function playRandom(queueName = "home") {
  const queue = queueFor(queueName);
  if (!queue.length) {
    toast("这个列表还是空的");
    return;
  }
  const pool = queue.length > 1 ? queue.filter((song) => song.id !== player.current?.id) : queue;
  const song = pool[Math.floor(Math.random() * pool.length)];
  player.play(song, queue, { autoplay: true });
  player.onPageRendered();
}

function getPlaylistForPlayback(id, favorites = false) {
  if (favorites || id === "favorites") {
    return { id: "favorites", name: "我的收藏", tracks: store.state.favorites };
  }
  return store.getPlaylist(id);
}

/* ------------------------------------------------------------------ */
/* Favorites / playlists                                               */
/* ------------------------------------------------------------------ */

function syncFavoriteButtons(songId = null) {
  const selector = songId
    ? `[data-action="toggle-favorite"][data-song-id="${CSS.escape(songId)}"]`
    : `[data-action="toggle-favorite"]`;
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("is-fav", store.isFavorite(button.dataset.songId));
  });
}

async function openAddSong(song) {
  if (!store.state.playlists.length) {
    const name = await promptDialog({
      title: "先建一个歌单",
      description: "这首歌会被放进新歌单的第一格。",
      label: "歌单名字",
      value: "我的发友歌单",
      placeholder: "比如：深夜循环",
    });
    if (!name) return;
    const playlist = store.createPlaylist(name, [song]);
    updateLibraryCount();
    toast(`已新建「${playlist.name}」，并收进这首歌`);
    return;
  }

  showSongMenu({
    song,
    playlists: store.state.playlists,
    onCreate: async (choice) => {
      if (choice.type === "new") {
        const name = await promptDialog({
          title: "新建歌单",
          label: "歌单名字",
          value: "新的歌单",
          placeholder: "比如：2017 年的夏天",
        });
        if (!name) return;
        const playlist = store.createPlaylist(name, [song]);
        closeModal();
        updateLibraryCount();
        toast(`已新建「${playlist.name}」，并收进这首歌`);
        return;
      }
      const result = store.addTrack(choice.playlist.id, song);
      closeModal();
      updateLibraryCount();
      if (result.ok) toast(`已收进「${choice.playlist.name}」`);
      else if (result.reason === "duplicate") toast("这个歌单里已经有这首歌了");
      else if (result.reason === "full") toast("歌单已经满了（最多 300 首）", "error");
    },
  });
}

async function openAddAlbum(data) {
  if (!data.songs.length) return;
  if (!store.state.playlists.length) {
    const name = await promptDialog({
      title: "把整张唱片收进新歌单",
      label: "歌单名字",
      value: data.album.name,
    });
    if (!name) return;
    const playlist = store.createPlaylist(name, data.songs);
    updateLibraryCount();
    toast(`已新建「${playlist.name}」，收进 ${playlist.tracks.length} 首歌`);
    return;
  }
  openModal(modalShell({
    title: "收进歌单",
    subtitle: `把「${esc(data.album.name)}」里的 ${data.songs.length} 首歌放进哪里？`,
    body: `<div class="pick-list">${store.state.playlists.map((playlist) => `
      <button class="pick-item" data-add-album-to="${esc(playlist.id)}">
        <img src="${esc(playlist.tracks[0]?.cover || "/assets/img/cover-fallback.svg")}" alt="">
        <div><b>${esc(playlist.name)}</b><span>${playlist.tracks.length} 首</span></div>
        ${icon("plus")}
      </button>
    `).join("")}</div>`,
  }), {
    onMount(modal) {
      modal.querySelectorAll("[data-add-album-to]").forEach((button) => {
        button.addEventListener("click", () => {
          const playlist = store.getPlaylist(button.dataset.addAlbumTo);
          if (!playlist) return;
          let added = 0;
          data.songs.forEach((song) => {
            if (store.addTrack(playlist.id, song).ok) added += 1;
          });
          closeModal();
          updateLibraryCount();
          toast(added ? `已把 ${added} 首歌收进「${playlist.name}」` : "这些歌都已经在歌单里了");
        });
      });
    },
  });
}

async function createPlaylistFlow() {
  const name = await promptDialog({
    title: "新建歌单",
    description: "歌单会先保存在这台设备，随时可以导出或同步到云端。",
    label: "歌单名字",
    value: "新的歌单",
    placeholder: "比如：深夜循环",
  });
  if (!name) return;
  const playlist = store.createPlaylist(name);
  updateLibraryCount();
  toast(`已新建「${playlist.name}」`);
  navigate(`/playlist/${playlist.id}`);
}

async function renamePlaylistFlow(id) {
  const playlist = store.getPlaylist(id);
  if (!playlist) return;
  const name = await promptDialog({ title: "给歌单改个名字", label: "歌单名字", value: playlist.name });
  if (!name) return;
  store.renamePlaylist(id, name);
  toast("歌单已改名");
  renderRoute({ preserveScroll: true });
}

async function deletePlaylistFlow(id) {
  const playlist = store.getPlaylist(id);
  if (!playlist) return;
  const ok = await confirmDialog({
    title: `删除「${playlist.name}」？`,
    message: `只会删除这台设备上的这一份${playlist.remote ? "，云端分享不会被删除" : ""}。删掉之后就找不回来了。`,
    confirmText: "删除歌单",
    destructive: true,
  });
  if (!ok) return;
  store.deletePlaylist(id);
  updateLibraryCount();
  toast("歌单已删除");
  if (app.route.name === "playlist" && app.route.id === id) navigate("/library");
  else renderRoute({ preserveScroll: true });
}

/* ------------------------------------------------------------------ */
/* Sharing / backup                                                   */
/* ------------------------------------------------------------------ */

async function openSharePicker() {
  if (!store.state.playlists.length) {
    const name = await promptDialog({
      title: "先建一个歌单",
      description: "有歌之后才能生成同步码。先给歌单起个名字，再去挑歌。",
      label: "歌单名字",
      value: "我的发友歌单",
    });
    if (!name) return;
    const playlist = store.createPlaylist(name);
    updateLibraryCount();
    navigate(`/playlist/${playlist.id}`);
    return;
  }

  openModal(modalShell({
    title: "分享哪一份歌单？",
    subtitle: "生成 6 位同步码，发友不用登录就能打开。",
    body: `<div class="pick-list">${store.state.playlists.map((playlist) => `
      <button class="pick-item" data-share-pick="${esc(playlist.id)}">
        <img src="${esc(playlist.tracks[0]?.cover || "/assets/img/cover-fallback.svg")}" alt="">
        <div><b>${esc(playlist.name)}</b><span>${playlist.tracks.length} 首 · ${playlist.remote ? `已同步 ${esc(playlist.remote.code)}` : "未同步"}</span></div>
        ${icon("cloud")}
      </button>
    `).join("")}</div>`,
  }), {
    onMount(modal) {
      modal.querySelectorAll("[data-share-pick]").forEach((button) => {
        button.addEventListener("click", () => {
          closeModal();
          sharePlaylistById(button.dataset.sharePick);
        });
      });
    },
  });
}

async function sharePlaylistById(id) {
  const playlist = store.getPlaylist(id);
  if (!playlist) return;
  if (!playlist.tracks.length) {
    toast("空歌单还不能分享，先收几首歌进去");
    return;
  }

  const payload = {
    name: playlist.name,
    author: store.state.fanName,
    note: playlist.note,
    tracks: playlist.tracks,
  };

  try {
    let result;
    if (playlist.remote?.code && playlist.remote?.token) {
      result = await api.updateSync(playlist.remote.code, playlist.remote.token, payload, playlist.remote.version);
    } else {
      result = await api.createSync(payload);
    }
    const remote = {
      code: result.code,
      token: playlist.remote?.token || result.token,
      version: result.version,
      updatedAt: result.updatedAt || new Date().toISOString(),
      expiresAt: result.expiresAt || "",
    };
    store.setRemote(id, remote);
    showShareResult({ ...result, url: result.url || shareUrl(result.code) }, playlist.name);
    refreshCommunityQuietly();
    if (app.route.name === "playlist" && app.route.id === id) renderRoute({ preserveScroll: true });
  } catch (error) {
    if (error?.payload?.code === "VERSION_CONFLICT") {
      const force = await confirmDialog({
        title: "云端已经更新过了",
        message: "另一台设备改过这份歌单。现在覆盖的话，对方的新改动会丢失。要继续用本机版本覆盖吗？",
        confirmText: "覆盖云端",
        destructive: true,
      });
      if (!force) return;
      try {
        const result = await api.updateSync(playlist.remote.code, playlist.remote.token, payload, undefined);
        store.setRemote(id, {
          ...playlist.remote,
          version: result.version,
          updatedAt: result.updatedAt,
          expiresAt: result.expiresAt,
        });
        toast("已用本机版本覆盖云端歌单");
        refreshCommunityQuietly();
      } catch (nextError) {
        toast(nextError.message, "error");
      }
      return;
    }
    if (error?.payload?.code === "KV_NOT_CONFIGURED" || error?.status === 503) {
      openModal(modalShell({
        title: "云端同步还没有开启",
        subtitle: "代码已经写好了，只差在 Cloudflare 上绑定一个 KV 命名空间。",
        body: `<p class="form-hint" style="font-size:11px;line-height:1.9">本地备份和导入不受影响。你也可以先导出 JSON，等云端开启后再导入分享。<br><br>部署步骤见仓库 README 的「Cloudflare 部署」一节。</p>`,
        actions: `<button class="btn btn-ghost" data-action="close-modal">知道了</button><button class="btn btn-cream" data-action="export-backup">${icon("download")} 先导出备份</button>`,
      }));
      return;
    }
    toast(error.message || "同步失败，请稍后再试", "error");
  }
}

async function refreshCommunityQuietly() {
  try {
    app.community = await api.community();
    if (app.home) app.home.community = app.community;
  } catch { /* best effort */ }
}

function exportBackup() {
  const data = store.exportData();
  const filename = `cyf-radio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadBlob(filename, JSON.stringify(data, null, 2));
  toast("备份文件已导出，收好它");
}

function exportPlaylist(id) {
  const playlist = getPlaylistForPlayback(id);
  if (!playlist) return;
  const data = {
    app: "陈一发儿 · 发友留声机",
    format: "cyf-radio-playlist",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: playlist.name,
    tracks: playlist.tracks,
  };
  downloadBlob(`${safeFilename(playlist.name)}.json`, JSON.stringify(data, null, 2));
  toast("歌单文件已导出");
}

function importBackupFlow() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("备份文件太大了", "error");
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      if (data.format === "cyf-radio-playlist") {
        const playlist = store.createPlaylist(data.name || "导入的歌单", data.tracks || []);
        updateLibraryCount();
        toast(`已导入「${playlist.name}」，共 ${playlist.tracks.length} 首`);
        navigate(`/playlist/${playlist.id}`);
        return;
      }
      if (data.format !== "cyf-radio-backup") throw new Error("不是发友留声机的备份文件");
      openModal(modalShell({
        title: "导入本地备份",
        subtitle: `文件里有 ${data.playlists?.length || 0} 个歌单、${data.favorites?.length || 0} 首收藏。`,
        body: `<p class="form-hint" style="font-size:11px;line-height:1.85">「合并」会保留现在的歌单，把备份里不重复的加进来；「替换」会清空当前歌单后再导入。</p>`,
        actions: `
          <button class="btn btn-ghost" data-action="close-modal">取消</button>
          <button class="btn btn-ghost" data-import-mode="merge">合并导入</button>
          <button class="btn btn-cream" data-import-mode="replace">替换当前</button>
        `,
      }), {
        onMount(modal) {
          modal.querySelectorAll("[data-import-mode]").forEach((button) => {
            button.addEventListener("click", () => {
              try {
                const result = store.importData(data, button.dataset.importMode);
                closeModal();
                updateLibraryCount();
                toast(`已导入 ${result.playlists} 个歌单、${result.favorites} 首收藏`);
                renderRoute({ preserveScroll: true });
              } catch (error) {
                toast(error.message, "error");
              }
            });
          });
        },
      });
    } catch (error) {
      toast(error.message || "无法读取这个文件", "error");
    }
  });
  input.click();
}

function handleCodeSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const code = String(new FormData(form).get("code") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    toast("同步码是 6 位字母或数字", "error");
    return;
  }
  navigate(`/s/${code}`);
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

function openSearchDialog() {
  showSearchDialog({
    initial: "",
    onSearch: (query) => api.search(query),
    onSong: (song, list) => {
      registerQueue("search", list);
      player.play(song, list, { autoplay: true });
      player.onPageRendered();
    },
    onAlbum: (id) => navigate(`/album/${id}`),
    onEnter: (query) => navigate(`/search?q=${encodeURIComponent(query)}`),
  });
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                         */
/* ------------------------------------------------------------------ */

function applyAlbumFilter(category) {
  document.querySelectorAll("[data-filter-album]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.filterAlbum === category);
  });
  document.querySelectorAll("#album-shelf .album-card").forEach((card) => {
    card.hidden = category !== "全部" && card.dataset.category !== category;
  });
  const shelf = document.getElementById("album-shelf");
  shelf?.scrollTo({ left: 0, behavior: "smooth" });
}

function updateLibraryCount() {
  const node = document.getElementById("library-count");
  if (node) node.textContent = String(store.state.playlists.length);
}

function setPageTitle(title) {
  document.title = title;
  setMeta("og:title", title);
  setMeta("og:url", location.href);
  setMeta("og:image", `${location.origin}/assets/img/og-cover.jpg`);
}

function toggleMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  if (!menu) return;
  menu.hidden = !menu.hidden;
}

function closeMobileMenu() {
  const menu = document.getElementById("mobile-menu");
  if (menu) menu.hidden = true;
}

function setGitHubLink() {
  const link = document.getElementById("github-link");
  if (!link) return;
  const url = document.documentElement.dataset.github || "";
  if (url) link.href = url;
  else link.hidden = true;
}

function safeFilename(value) {
  return String(value || "歌单").replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 60) || "歌单";
}

async function withToast(promise, message = "加载失败") {
  try {
    return await promise;
  } catch (error) {
    toast(error.message || message, "error");
    return null;
  }
}

function skeletonHome() {
  return `
    <div class="skeleton-home" aria-label="正在加载">
      <div class="sk-line sk-kicker"></div>
      <div class="sk-title"></div>
      <div class="sk-title short"></div>
      <div class="sk-text"></div>
      <div class="sk-art"></div>
    </div>
  `;
}

function simpleLoader(text) {
  return `<div class="boot-screen"><div class="boot-vinyl"><span>发</span></div><p>${esc(text)}</p></div>`;
}

/* ------------------------------------------------------------------ */
/* Extras                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener("play", () => player.onPageRendered(), true);
document.addEventListener("pause", () => player.onPageRendered(), true);
audio.addEventListener("loadedmetadata", () => player.onPageRendered());

function maybeRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Expose a tiny debug surface for the console, not global state mutation.
window.cyfRadio = {
  get state() { return store.state; },
  get player() { return player; },
  get app() { return app; },
};
