/* Toast, modal, confirm and share surfaces. */

import { copyText, esc, icon, thumb } from "./utils.js";

let openModalResolve = null;
let lastFocused = null;
let modalKeyBound = false;

export function toast(message, type = "info", timeout = 3400) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "is-error" : ""}`;
  node.innerHTML = `${icon(type === "error" ? "close" : "check")}<span>${esc(message)}</span>`;
  stack.appendChild(node);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), 320);
  }, timeout);
}

export function openModal(html, { wide = false, onMount = null } = {}) {
  const layer = document.getElementById("modal-layer");
  const modal = document.getElementById("modal");
  if (!layer || !modal) return () => {};
  lastFocused = document.activeElement;
  modal.className = `modal${wide ? " modal-wide" : ""}`;
  modal.innerHTML = html;
  layer.classList.add("is-open");
  layer.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  bindModalKeys();
  if (typeof onMount === "function") onMount(modal);

  setTimeout(() => {
    const target = modal.querySelector("[autofocus], input, textarea, button");
    target?.focus({ preventScroll: true });
  }, 80);

  openModalResolve?.();
  return closeModal;
}

export function closeModal() {
  const layer = document.getElementById("modal-layer");
  if (!layer) return;
  layer.classList.remove("is-open");
  layer.setAttribute("aria-hidden", "true");
  if (!document.getElementById("now-panel")?.classList.contains("is-open")) {
    document.body.classList.remove("no-scroll");
  }
  setTimeout(() => {
    const modal = document.getElementById("modal");
    if (modal && !layer.classList.contains("is-open")) modal.innerHTML = "";
  }, 260);
  if (lastFocused instanceof HTMLElement) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
}

function bindModalKeys() {
  if (modalKeyBound) return;
  modalKeyBound = true;
  document.addEventListener("keydown", (event) => {
    const layer = document.getElementById("modal-layer");
    if (!layer?.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
    if (event.key === "Tab") {
      const modal = document.getElementById("modal");
      const focusables = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

export function modalShell({ title, subtitle = "", body = "", actions = "", wide = false, close = true }) {
  return `
    <div class="modal-head">
      <div>
        <h2 id="modal-title">${esc(title)}</h2>
        ${subtitle ? `<p>${subtitle}</p>` : ""}
      </div>
      ${close ? `<button class="icon-btn modal-close" data-action="close-modal" aria-label="关闭">${icon("close")}</button>` : ""}
    </div>
    <div class="modal-body">${body}</div>
    ${actions ? `<div class="modal-actions">${actions}</div>` : ""}
  `;
}

export function confirmDialog({
  title = "确认一下",
  message = "",
  confirmText = "确定",
  cancelText = "再想想",
  destructive = false,
} = {}) {
  return new Promise((resolve) => {
    openModal(modalShell({
      title,
      body: `<p style="color:var(--muted);font-size:12px;line-height:1.9">${message}</p>`,
      actions: `
        <button class="btn btn-ghost" data-confirm="no">${esc(cancelText)}</button>
        <button class="btn ${destructive ? "btn-primary" : "btn-cream"}" data-confirm="yes">${esc(confirmText)}</button>
      `,
    }), {
      onMount(modal) {
        modal.querySelector('[data-confirm="no"]').addEventListener("click", () => {
          closeModal();
          resolve(false);
        });
        modal.querySelector('[data-confirm="yes"]').addEventListener("click", () => {
          closeModal();
          resolve(true);
        });
      },
    });
  });
}

export function promptDialog({
  title = "起个名字",
  description = "",
  label = "名称",
  value = "",
  placeholder = "",
  maxlength = 40,
  confirmText = "保存",
} = {}) {
  return new Promise((resolve) => {
    openModal(modalShell({
      title,
      subtitle: description,
      body: `
        <div class="field">
          <label for="prompt-input">${esc(label)}</label>
          <input id="prompt-input" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>
        </div>
        <p class="form-hint">${maxlength} 个字符以内，随时可以修改。</p>
      `,
      actions: `
        <button class="btn btn-ghost" data-prompt="cancel">取消</button>
        <button class="btn btn-cream" data-prompt="ok">${esc(confirmText)}</button>
      `,
    }), {
      onMount(modal) {
        const input = modal.querySelector("#prompt-input");
        const submit = () => {
          const text = input.value.trim();
          if (!text) {
            input.focus();
            return;
          }
          closeModal();
          resolve(text);
        };
        modal.querySelector('[data-prompt="ok"]').addEventListener("click", submit);
        modal.querySelector('[data-prompt="cancel"]').addEventListener("click", () => {
          closeModal();
          resolve(null);
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        });
      },
    });
  });
}

export function showShareResult(result, playlistName = "发友歌单") {
  const url = result.url || `${location.origin}/s/${result.code}`;
  openModal(modalShell({
    title: "歌单已经放上云端",
    subtitle: "把这个同步码发给同好，对方不用登录就能打开、试听并收藏一份。",
    body: `
      <div class="code-display">${esc(result.code)}</div>
      <div class="copy-row">
        <input id="share-url" value="${esc(url)}" readonly aria-label="分享链接">
        <button class="btn btn-sm btn-cream" data-copy-target="share-url">${icon("copy")} 复制链接</button>
      </div>
      <p class="form-hint" style="margin-top:12px">歌单会保留 90 天。${result.expiresAt ? `到期时间：${new Date(result.expiresAt).toLocaleDateString("zh-CN")}` : ""} 任何拿到同步码的人都可以查看，请不要放入私人信息。</p>
    `,
    actions: `
      <button class="btn btn-ghost" data-action="close-modal">知道了</button>
      <button class="btn btn-cream" data-copy-code="${esc(result.code)}">${icon("link")} 复制同步码</button>
    `,
    wide: false,
  }), {
    onMount(modal) {
      modal.querySelector("[data-copy-code]")?.addEventListener("click", async () => {
        await copyText(result.code);
        toast(`同步码 ${result.code} 已复制`);
      });
      modal.querySelector("[data-copy-target]")?.addEventListener("click", async () => {
        await copyText(url);
        toast("分享链接已复制");
      });
    },
  });
}

export function showSongMenu({ song, playlists, onCreate }) {
  const rows = playlists.map((playlist) => `
    <button class="pick-item" data-pick-playlist="${esc(playlist.id)}">
      <img src="${esc(playlist.tracks[0]?.cover || "/assets/img/cover-fallback.svg")}" alt="">
      <div>
        <b>${esc(playlist.name)}</b>
        <span>${playlist.tracks.length} 首 · ${playlist.remote ? `已同步 ${esc(playlist.remote.code)}` : "仅本地"}</span>
      </div>
      ${icon("plus")}
    </button>
  `).join("");

  openModal(modalShell({
    title: "收进歌单",
    subtitle: `「${esc(song.title)}」想放在哪里？`,
    body: `
      <div class="pick-list">
        ${rows || `<p class="form-hint" style="padding:20px 0">还没有歌单，先创建一个吧。</p>`}
      </div>
      <button class="pick-item" data-pick-new style="margin-top:7px;border:1px dashed var(--line-strong)">
        <span class="playlist-card-icon">${icon("plus")}</span>
        <div><b>新建歌单</b><span>给这首歌一个新位置</span></div>
        ${icon("arrow-right")}
      </button>
    `,
  }), {
    onMount(modal) {
      modal.querySelectorAll("[data-pick-playlist]").forEach((button) => {
        button.addEventListener("click", () => {
          const playlist = playlists.find((item) => item.id === button.dataset.pickPlaylist);
          if (!playlist) return;
          onCreate?.({ type: "existing", playlist });
        });
      });
      modal.querySelector("[data-pick-new]")?.addEventListener("click", () => {
        onCreate?.({ type: "new" });
      });
    },
  });
}

export function showSearchDialog({ initial = "", onSearch, onSong, onAlbum, onEnter }) {
  openModal(modalShell({
    title: "搜一首歌",
    subtitle: "歌名、专辑、直播场次都可以。",
    body: `
      <div class="search-modal-input">
        ${icon("search")}
        <input id="search-dialog-input" value="${esc(initial)}" placeholder="比如：童话镇 / 阿婆说 / 2017-8月" autocomplete="off" autofocus>
        <kbd style="color:var(--muted);font-family:var(--font-mono);font-size:9px">ESC</kbd>
      </div>
      <div class="search-results" id="search-dialog-results">
        <p class="form-hint" style="padding:26px 8px;text-align:center">输入关键词，开始翻唱片。</p>
      </div>
    `,
  }), {
    onMount(modal) {
      const input = modal.querySelector("#search-dialog-input");
      const results = modal.querySelector("#search-dialog-results");
      let timer = 0;
      let requestId = 0;

      const render = (data) => {
        if (!data || (!data.songs?.length && !data.albums?.length)) {
          results.innerHTML = `<p class="form-hint" style="padding:26px 8px;text-align:center">没有找到，换个关键词试试。</p>`;
          return;
        }
        const songs = data.songs.slice(0, 6).map((song) => `
          <button class="search-result-row" data-song="${encodeURIComponent(JSON.stringify(song)).replace(/'/g, "%27")}">
            <img src="${esc(thumb(song.cover, 300))}" alt="">
            <div><b>${esc(song.title)}</b><span>${esc(song.album || song.artist)}</span></div>
            ${icon("play")}
          </button>
        `).join("");
        const albums = data.albums.slice(0, 3).map((album) => `
          <button class="search-result-row" data-album-id="${esc(album.id)}">
            <img src="${esc(album.cover)}" alt="">
            <div><b>${esc(album.name)}</b><span>${album.songCount} 首 · ${album.year || "未知年份"}</span></div>
            ${icon("arrow-up-right")}
          </button>
        `).join("");
        results.innerHTML = `${songs}${albums ? `<p class="kicker" style="margin:14px 8px 5px">ALBUMS</p>${albums}` : ""}`;
          results.querySelectorAll("[data-song]").forEach((button) => {
          button.addEventListener("click", () => {
            const song = JSON.parse(decodeURIComponent(button.dataset.song));
            closeModal();
            onSong?.(song, data.songs);
          });
        });
        results.querySelectorAll("[data-album-id]").forEach((button) => {
          button.addEventListener("click", () => {
            closeModal();
            onAlbum?.(button.dataset.albumId);
          });
        });
      };

      const run = async () => {
        const query = input.value.trim();
        if (!query) {
          results.innerHTML = `<p class="form-hint" style="padding:26px 8px;text-align:center">输入关键词，开始翻唱片。</p>`;
          return;
        }
        results.innerHTML = `<p class="form-hint" style="padding:26px 8px;text-align:center">正在翻找…</p>`;
        const current = ++requestId;
        try {
          const data = await onSearch(query);
          if (current === requestId) render(data);
        } catch (error) {
          if (current === requestId) results.innerHTML = `<p class="form-error" style="padding:20px 8px">${esc(error.message)}</p>`;
        }
      };

      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(run, 300);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const query = input.value.trim();
          if (!query) return;
          closeModal();
          onEnter?.(query);
        }
      });
      if (initial) run();
    },
  });
}

export function openNowPanel() {
  const panel = document.getElementById("now-panel");
  if (!panel) return;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}

export function closeNowPanel() {
  const panel = document.getElementById("now-panel");
  if (!panel) return;
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  if (!document.getElementById("modal-layer")?.classList.contains("is-open")) {
    document.body.classList.remove("no-scroll");
  }
}

export function openQueue() {
  const drawer = document.getElementById("queue-drawer");
  drawer?.classList.add("is-open");
  drawer?.setAttribute("aria-hidden", "false");
}

export function closeQueue() {
  const drawer = document.getElementById("queue-drawer");
  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden", "true");
}
