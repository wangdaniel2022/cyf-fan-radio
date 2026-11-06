/* Single audio element, persistent queue, media session. */

import { streamUrl } from "./api.js?v=20261106-1";
import { clamp, esc, formatDuration, icon, thumb } from "./utils.js?v=20261106-1";

const QUOTES = {
  "童话镇": "总有一条蜿蜒在童话镇里七彩的河。",
  "阿婆说": "阿婆说，路要慢慢走，话要慢慢说。",
  "弦上有春秋": "弦上有春秋，歌里有旧人。",
  "易燃易爆炸": "赐我梦境，还赐我很快就清醒。",
  "走马": "过了很久终于我愿抬头看。",
  "理想三旬": "雨后有车驶来，驶过暮色苍白。",
  "斑马斑马": "斑马斑马，你睡吧睡吧。",
  "成都": "和我在成都的街头走一走。",
  "我要你": "我要你在我身旁。",
  "后来": "后来，我总算学会了如何去爱。",
};

export class Player {
  constructor({ audio, store, onError } = {}) {
    this.audio = audio;
    this.store = store;
    this.onError = onError || (() => {});
    this.queue = Array.isArray(store.state.queue) ? store.state.queue : [];
    this.current = store.state.current || null;
    this.index = this.current ? this.queue.findIndex((song) => song.id === this.current.id) : -1;
    if (this.current && this.index < 0) {
      this.queue = [this.current, ...this.queue];
      this.index = 0;
    }
    this.lastPersist = 0;
    this.pendingPosition = Number(store.state.position) || 0;
    this.shuffleHistory = [];
    this.els = {};
    this.ready = false;
  }

  init() {
    this.cacheElements();
    this.bindAudio();
    this.bindUI();
    this.applySettings();
    this.syncUI();
    this.renderQueue();
    this.restore();

    window.addEventListener("beforeunload", () => this.store.saveNow());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.persist(true);
    });
  }

  cacheElements() {
    this.els = {
      body: document.body,
      nowCover: document.getElementById("now-cover"),
      nowTitle: document.getElementById("now-title"),
      nowSub: document.getElementById("now-sub"),
      nowHeart: document.getElementById("now-heart"),
      playMain: document.getElementById("play-main"),
      seek: document.getElementById("seek"),
      timeNow: document.getElementById("time-now"),
      timeTotal: document.getElementById("time-total"),
      timeFill: document.getElementById("time-fill"),
      timeDot: document.getElementById("time-dot"),
      shuffle: document.getElementById("shuffle-btn"),
      repeat: document.getElementById("repeat-btn"),
      volume: document.getElementById("volume"),
      mute: document.getElementById("mute-btn"),
      queueList: document.getElementById("queue-list"),
      queueDot: document.getElementById("queue-dot"),
      queueCount: document.getElementById("queue-count-label"),
      download: document.getElementById("download-current"),
      nowPanelCover: document.getElementById("now-panel-cover"),
      nowPanelBg: document.getElementById("now-panel-bg"),
      nowPanelTitle: document.getElementById("now-panel-title"),
      nowPanelSub: document.getElementById("now-panel-sub"),
      nowPanelQuote: document.getElementById("now-panel-quote"),
    };
  }

  bindAudio() {
    const audio = this.audio;

    audio.addEventListener("loadedmetadata", () => {
      if (!this.ready) {
        this.ready = true;
        if (this.pendingPosition > 0 && this.pendingPosition < (audio.duration || Infinity) - 2) {
          try { audio.currentTime = this.pendingPosition; } catch { /* noop */ }
        }
        this.pendingPosition = 0;
      }
      this.updateTime();
    });

    audio.addEventListener("timeupdate", () => {
      this.updateTime();
      const now = Date.now();
      if (now - this.lastPersist > 5000) {
        this.lastPersist = now;
        this.persist();
      }
    });

    audio.addEventListener("play", () => {
      document.body.classList.add("is-playing");
      this.syncPlayButton();
      this.updateMediaSession();
    });

    audio.addEventListener("pause", () => {
      document.body.classList.remove("is-playing");
      this.syncPlayButton();
      this.persist(true);
    });

    audio.addEventListener("ended", () => {
      if (this.store.state.repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const played = this.next(false);
      if (!played) {
        document.body.classList.remove("is-playing");
        this.syncPlayButton();
      }
    });

    audio.addEventListener("error", () => {
      const message = audio.error?.code === 4
        ? "这首歌暂时无法播放，换一首试试"
        : "音频加载失败，请检查网络后再试";
      this.onError(message);
    });

    audio.addEventListener("waiting", () => {
      this.els.playMain?.classList.add("is-loading");
    });
    audio.addEventListener("playing", () => {
      this.els.playMain?.classList.remove("is-loading");
    });
  }

  bindUI() {
    this.els.seek?.addEventListener("input", (event) => {
      if (!this.audio.duration) return;
      const ratio = Number(event.target.value) / 1000;
      this.els.seek.style.setProperty("--seek", `${ratio * 100}%`);
      this.els.timeFill.style.width = `${ratio * 100}%`;
      this.els.timeDot.style.left = `${ratio * 100}%`;
      this.els.timeNow.textContent = formatDuration(this.audio.duration * ratio);
      if (event.target.matches(":active")) this.audio.currentTime = this.audio.duration * ratio;
    });
    this.els.seek?.addEventListener("change", (event) => {
      if (!this.audio.duration) return;
      const ratio = Number(event.target.value) / 1000;
      this.audio.currentTime = this.audio.duration * ratio;
      this.persist(true);
    });

    this.els.volume?.addEventListener("input", (event) => {
      const volume = Number(event.target.value) / 100;
      this.audio.volume = volume;
      this.audio.muted = false;
      this.els.volume.style.setProperty("--vol", `${volume * 100}%`);
      this.store.savePlayback({ volume, muted: false });
      this.syncVolumeIcon();
    });

    // Transport buttons are delegated from app.js via [data-action] so that
    // one physical click never toggles twice.
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => this.audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler("pause", () => this.audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next(true));
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (Number.isFinite(details.seekTime)) this.audio.currentTime = details.seekTime;
      });
    }
  }

  applySettings() {
    const { volume, muted } = this.store.state;
    this.audio.volume = clamp(Number(volume) || 0.8, 0, 1);
    this.audio.muted = Boolean(muted);
    if (this.els.volume) this.els.volume.value = Math.round((this.audio.volume || 0.8) * 100);
    this.els.volume?.style.setProperty("--vol", `${Math.round((this.audio.volume || 0.8) * 100)}%`);
    this.syncVolumeIcon();
    this.syncModeButtons();
  }

  restore() {
    if (!this.current) {
      this.syncUI();
      return;
    }
    this.audio.src = streamUrl(this.current);
    this.audio.load();
    this.syncUI();
    this.renderQueue();
    this.setDocumentTitle(this.current.title);
  }

  play(song, queue = null, { autoplay = true, position = 0 } = {}) {
    if (!song) return;
    if (queue && Array.isArray(queue) && queue.length) {
      this.queue = queue.map((item) => item);
      this.index = this.queue.findIndex((item) => item.id === song.id);
      if (this.index < 0) {
        this.queue.unshift(song);
        this.index = 0;
      }
    } else if (!this.queue.length) {
      this.queue = [song];
      this.index = 0;
    } else {
      const existing = this.queue.findIndex((item) => item.id === song.id);
      if (existing >= 0) this.index = existing;
      else {
        this.queue.splice(this.index + 1, 0, song);
        this.index += 1;
      }
    }

    const same = this.current?.id === song.id;
    this.current = song;
    this.ready = false;
    this.pendingPosition = position;
    if (!same || !this.audio.src) {
      this.audio.src = streamUrl(song);
      this.audio.load();
    }
    this.syncUI();
    this.renderQueue();
    this.persist(true);
    this.setDocumentTitle(song.title);

    if (autoplay) {
      this.audio.play().catch((error) => {
        if (error?.name !== "AbortError") this.onError("浏览器阻止了自动播放，请再点一次播放");
      });
    }
  }

  playIndex(index, autoplay = true) {
    if (index < 0 || index >= this.queue.length) return false;
    this.play(this.queue[index], this.queue, { autoplay });
    return true;
  }

  toggle() {
    if (!this.current) {
      this.onError("先从下面的歌单里挑一首吧");
      return;
    }
    if (this.audio.paused) {
      this.audio.play().catch(() => this.onError("播放失败，请再试一次"));
    } else {
      this.audio.pause();
    }
  }

  next(manual = false) {
    if (!this.queue.length) return false;
    if (this.store.state.repeat === "one" && !manual) {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return true;
    }

    if (this.store.state.shuffle && this.queue.length > 1) {
      this.shuffleHistory.push(this.index);
      let nextIndex = this.index;
      while (nextIndex === this.index) nextIndex = Math.floor(Math.random() * this.queue.length);
      return this.playIndex(nextIndex, true);
    }

    if (this.index < this.queue.length - 1) return this.playIndex(this.index + 1, true);
    if (this.store.state.repeat === "all") return this.playIndex(0, true);
    this.audio.pause();
    return false;
  }

  prev() {
    if (!this.queue.length) return false;
    if (this.audio.currentTime > 4) {
      this.audio.currentTime = 0;
      return true;
    }
    if (this.store.state.shuffle && this.shuffleHistory.length) {
      const index = this.shuffleHistory.pop();
      return this.playIndex(index, true);
    }
    if (this.index > 0) return this.playIndex(this.index - 1, true);
    if (this.store.state.repeat === "all") return this.playIndex(this.queue.length - 1, true);
    this.audio.currentTime = 0;
    return true;
  }

  seek(seconds) {
    if (!this.audio.duration) return;
    this.audio.currentTime = clamp(seconds, 0, this.audio.duration);
  }

  toggleShuffle() {
    const shuffle = !this.store.state.shuffle;
    this.store.savePlayback({ shuffle });
    this.syncModeButtons();
  }

  cycleRepeat() {
    const order = ["off", "all", "one"];
    const next = order[(order.indexOf(this.store.state.repeat) + 1) % order.length];
    this.store.savePlayback({ repeat: next });
    this.syncModeButtons();
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.store.savePlayback({ muted: this.audio.muted });
    this.syncVolumeIcon();
  }

  setVolume(value) {
    const volume = clamp(Number(value), 0, 1);
    this.audio.volume = volume;
    this.audio.muted = false;
    if (this.els.volume) {
      this.els.volume.value = Math.round(volume * 100);
      this.els.volume.style.setProperty("--vol", `${volume * 100}%`);
    }
    this.store.savePlayback({ volume, muted: false });
    this.syncVolumeIcon();
  }

  addToQueue(song, playNext = false) {
    if (!song) return;
    if (!this.current) {
      this.play(song, [song], { autoplay: false });
      return;
    }
    const insertAt = playNext ? this.index + 1 : this.queue.length;
    this.queue.splice(insertAt, 0, song);
    if (playNext && insertAt <= this.index) this.index += 1;
    this.renderQueue();
    this.persist(true);
  }

  removeFromQueue(songId) {
    const index = this.queue.findIndex((song) => song.id === songId);
    if (index < 0) return;
    const wasCurrent = this.current?.id === songId;
    this.queue.splice(index, 1);
    if (index < this.index) this.index -= 1;
    if (wasCurrent) {
      this.current = this.queue[Math.min(this.index, this.queue.length - 1)] || null;
      this.index = Math.min(this.index, this.queue.length - 1);
      if (this.current) this.play(this.current, this.queue, { autoplay: false });
      else {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.syncUI();
      }
    }
    this.renderQueue();
    this.persist(true);
  }

  clearQueue() {
    this.queue = this.current ? [this.current] : [];
    this.index = 0;
    this.renderQueue();
    this.persist(true);
  }

  toggleFavorite() {
    if (!this.current) return;
    const active = this.store.toggleFavorite(this.current);
    this.syncFavorite();
    this.onError(active ? `已收藏「${this.current.title}」` : "已取消收藏");
  }

  downloadCurrent() {
    if (!this.current) {
      this.onError("还没有选歌哦");
      return;
    }
    const name = `${this.current.artist || "陈一发儿"} - ${this.current.title}`;
    const extension = this.current.suffix || "mp3";
    const url = `/api/download/${encodeURIComponent(this.current.id)}?name=${encodeURIComponent(name)}&ext=${encodeURIComponent(extension)}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    this.onError(`开始下载「${this.current.title}」`);
  }

  updateTime() {
    const audio = this.audio;
    const duration = Number(audio.duration) || Number(this.current?.duration) || 0;
    const current = Number(audio.currentTime) || 0;
    const ratio = duration ? current / duration : 0;

    if (this.els.timeNow) this.els.timeNow.textContent = formatDuration(current);
    if (this.els.timeTotal) this.els.timeTotal.textContent = formatDuration(duration);
    if (this.els.timeFill) this.els.timeFill.style.width = `${ratio * 100}%`;
    if (this.els.timeDot) this.els.timeDot.style.left = `${ratio * 100}%`;
    if (this.els.seek) {
      this.els.seek.value = Math.round(ratio * 1000);
      this.els.seek.style.setProperty("--seek", `${ratio * 100}%`);
    }
    if ("mediaSession" in navigator && duration > 0 && Number.isFinite(duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(current, duration),
        });
      } catch { /* noop */ }
    }
  }

  syncUI() {
    const song = this.current;
    if (song) {
      this.els.nowCover && (this.els.nowCover.src = song.cover || "/assets/img/cover-fallback.svg");
      this.els.nowTitle && (this.els.nowTitle.textContent = song.title);
      this.els.nowSub && (this.els.nowSub.textContent = `${song.album || song.artist || "陈一发儿"}${song.duration ? ` · ${formatDuration(song.duration)}` : ""}`);
      this.els.nowPanelCover && (this.els.nowPanelCover.src = song.cover || "/assets/img/cover-fallback.svg");
      this.els.nowPanelTitle && (this.els.nowPanelTitle.textContent = song.title);
      this.els.nowPanelSub && (this.els.nowPanelSub.textContent = `${song.artist || "陈一发儿"}${song.album ? ` · ${song.album}` : ""}`);
      if (this.els.nowPanelQuote) this.els.nowPanelQuote.textContent = `“${QUOTES[song.title] || "把喜欢唱成岁月，把故事留在歌里。"}”`;
      if (this.els.nowPanelBg) this.els.nowPanelBg.style.backgroundImage = `url("${song.cover || "/assets/img/cover-fallback.svg"}")`;
      this.els.download?.removeAttribute("disabled");
    } else {
      this.els.nowTitle && (this.els.nowTitle.textContent = "还没有放歌");
      this.els.nowSub && (this.els.nowSub.textContent = "从「童话镇」开始吧");
      this.els.download?.setAttribute("disabled", "");
    }
    this.syncFavorite();
    this.syncPlayButton();
    this.syncModeButtons();
    this.updateActiveRows();
    this.setDocumentTitle(song?.title || "");
    if (song) this.updateTime();
  }

  syncPlayButton() {
    const playing = !this.audio.paused && Boolean(this.current);
    document.body.classList.toggle("is-playing", playing);
    this.els.playMain?.setAttribute("aria-label", playing ? "暂停" : "播放");
    this.els.playMain?.classList.toggle("is-loading", this.audio.readyState < 3 && playing);
  }

  syncModeButtons() {
    const { shuffle, repeat } = this.store.state;
    this.els.shuffle?.classList.toggle("is-active", shuffle);
    this.els.repeat?.classList.toggle("is-active", repeat !== "off");
    if (this.els.repeat) {
      const use = this.els.repeat.querySelector("use");
      use?.setAttribute("href", repeat === "one" ? "#i-repeat-1" : "#i-repeat");
      this.els.repeat.setAttribute("title", repeat === "one" ? "单曲循环" : repeat === "all" ? "列表循环" : "顺序播放");
    }
    this.els.shuffle?.setAttribute("title", shuffle ? "随机播放：开" : "随机播放：关");
  }

  syncFavorite() {
    const active = this.current ? this.store.isFavorite(this.current.id) : false;
    this.els.nowHeart?.classList.toggle("is-fav", active);
    this.els.nowHeart?.setAttribute("aria-pressed", active ? "true" : "false");
  }

  syncVolumeIcon() {
    const use = this.els.mute?.querySelector("use");
    const muted = this.audio.muted || this.audio.volume === 0;
    use?.setAttribute("href", muted ? "#i-volume-x" : "#i-volume");
    this.els.mute?.setAttribute("aria-label", muted ? "取消静音" : "静音");
  }

  renderQueue() {
    if (!this.els.queueList) return;
    const queue = this.queue;
    this.els.queueCount && (this.els.queueCount.textContent = `${queue.length} 首`);
    this.els.queueDot && (this.els.queueDot.textContent = String(queue.length));
    this.els.queueDot && (this.els.queueDot.hidden = queue.length === 0);

    if (!queue.length) {
      this.els.queueList.innerHTML = `<p class="queue-empty">队列还是空的，去挑一首吧。</p>`;
      return;
    }

    this.els.queueList.innerHTML = queue.map((song, index) => `
      <div class="queue-item ${song.id === this.current?.id ? "is-current" : ""}" data-action="queue-play" data-index="${index}">
        <img src="${esc(thumb(song.cover, 300) || "/assets/img/cover-fallback.svg")}" alt="" loading="lazy">
        <div class="queue-item-info">
          <b class="ellipsis">${esc(song.title)}</b>
          <span class="ellipsis">${esc(song.album || song.artist || "")}</span>
        </div>
        <button class="icon-btn" data-action="queue-remove" data-id="${esc(song.id)}" aria-label="从队列移除">${icon("close")}</button>
      </div>
    `).join("");
  }

  updateActiveRows() {
    const id = this.current?.id;
    document.querySelectorAll("[data-song-id]").forEach((row) => {
      row.classList.toggle("is-current", row.getAttribute("data-song-id") === id);
    });
  }

  setDocumentTitle(title) {
    document.title = title ? `${title} · 陈一发儿留声机` : "陈一发儿 · 发友留声机";
  }

  updateMediaSession() {
    if (!("mediaSession" in navigator) || !this.current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.current.title,
        artist: this.current.artist || "陈一发儿",
        album: this.current.album || "发友留声机",
        artwork: [
          { src: new URL(this.current.cover || "/assets/img/cover-fallback.svg", location.origin).href, sizes: "600x600", type: "image/jpeg" },
        ],
      });
      navigator.mediaSession.playbackState = this.audio.paused ? "paused" : "playing";
    } catch { /* noop */ }
  }

  persist(now = false) {
    this.store.savePlayback({
      queue: this.queue,
      current: this.current,
      position: Math.floor(this.audio.currentTime || 0),
      volume: this.audio.volume,
      muted: this.audio.muted,
      repeat: this.store.state.repeat,
      shuffle: this.store.state.shuffle,
    });
    if (now) this.store.saveNow();
  }

  onPageRendered() {
    this.updateActiveRows();
    this.syncFavorite();
  }
}
