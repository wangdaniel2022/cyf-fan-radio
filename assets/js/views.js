/* Server-data -> HTML. All views are pure string builders. */

import { esc, formatCount, formatDuration, icon, thumb, timeAgo } from "./utils.js?v=20261110-1";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                      */
/* ------------------------------------------------------------------ */

export function songRow(song, {
  queue = "home",
  rank = null,
  showAlbum = true,
  favorite = false,
} = {}) {
  return `
    <div class="chart-row ${favorite ? "" : ""}" data-action="play-song" data-song-id="${esc(song.id)}" data-queue="${esc(queue)}" role="button" tabindex="0" aria-label="播放 ${esc(song.title)}">
      <span class="chart-rank">${rank ? String(rank).padStart(2, "0") : icon("music")}</span>
      <div class="chart-cover">
        <img src="${esc(thumb(song.cover, 300))}" alt="" loading="lazy">
        ${icon("play")}
      </div>
      <div class="chart-info">
        <span class="chart-title ellipsis">${esc(song.title)}</span>
        ${showAlbum ? `<span class="chart-album ellipsis">${esc(song.album || song.artist || "陈一发儿")}</span>` : ""}
      </div>
      <span class="chart-duration">${formatDuration(song.duration)}</span>
      <div class="chart-actions">
        <button class="icon-btn ${favorite ? "is-fav" : ""}" data-action="toggle-favorite" data-song-id="${esc(song.id)}" aria-label="收藏 ${esc(song.title)}">${icon("heart")}</button>
        <button class="icon-btn" data-action="download-song" data-song-id="${esc(song.id)}" aria-label="下载 ${esc(song.title)}">${icon("download")}</button>
        <button class="icon-btn" data-action="add-song" data-song-id="${esc(song.id)}" aria-label="收进歌单">${icon("plus")}</button>
      </div>
    </div>
  `;
}

export function trackRow(song, {
  queue = "album",
  index = 0,
  favorite = false,
} = {}) {
  return `
    <div class="track-row" data-action="play-song" data-song-id="${esc(song.id)}" data-queue="${esc(queue)}" role="button" tabindex="0" aria-label="播放 ${esc(song.title)}">
      <span class="track-no">${String(index + 1).padStart(2, "0")}</span>
      <div class="track-main">
        <img src="${esc(thumb(song.cover, 300))}" alt="" loading="lazy">
        <div>
          <span class="track-title">${esc(song.title)}</span>
          <span class="track-album">${esc(song.album || song.artist || "陈一发儿")}</span>
        </div>
      </div>
      <span class="track-album">${esc(song.album || "—")}</span>
      <span class="track-duration">${formatDuration(song.duration)}</span>
      <div class="track-actions">
        <button class="icon-btn ${favorite ? "is-fav" : ""}" data-action="toggle-favorite" data-song-id="${esc(song.id)}" aria-label="收藏 ${esc(song.title)}">${icon("heart")}</button>
        <button class="icon-btn" data-action="download-song" data-song-id="${esc(song.id)}" aria-label="下载 ${esc(song.title)}">${icon("download")}</button>
        <button class="icon-btn" data-action="add-song" data-song-id="${esc(song.id)}" aria-label="收进歌单">${icon("plus")}</button>
      </div>
    </div>
  `;
}

export function albumCard(album, { eager = false } = {}) {
  return `
    <article class="album-card" data-category="${esc(album.category)}" data-year="${album.year || ""}">
      <div class="album-art">
        <a href="/album/${encodeURIComponent(album.id)}" data-link aria-label="打开专辑 ${esc(album.name)}">
          <img src="${esc(thumb(album.cover, 300))}" alt="${esc(album.name)} 封面" loading="${eager ? "eager" : "lazy"}">
        </a>
        <span class="album-cat">${esc(album.category || "唱片")}</span>
        <button class="album-play" data-action="play-album" data-album-id="${esc(album.id)}" aria-label="播放专辑 ${esc(album.name)}">${icon("play")}</button>
      </div>
      <div class="album-meta">
        <a class="album-name ellipsis" href="/album/${encodeURIComponent(album.id)}" data-link>${esc(album.name)}</a>
        <div class="album-sub">
          <span>${album.year || "年份不详"}</span><i></i><span>${album.songCount} 首</span><i></i><span>${formatDuration(album.duration)}</span>
        </div>
      </div>
    </article>
  `;
}

export function playlistCard(playlist, { favorites = false, index = 0 } = {}) {
  const covers = playlist.tracks.slice(0, 3).map((track) => `<img src="${esc(thumb(track.cover, 300))}" alt="" loading="lazy">`).join("");
  return `
    <article class="playlist-card" style="animation-delay:${index * 30}ms">
      <div class="playlist-card-top">
        <span class="playlist-card-icon">${icon(favorites ? "heart" : playlist.remote ? "cloud" : "list")}</span>
        ${playlist.remote ? `<span class="tag">${esc(playlist.remote.code)}</span>` : `<span class="tag">本地</span>`}
      </div>
      <h3><a href="/playlist/${encodeURIComponent(playlist.id)}" data-link>${esc(playlist.name)}</a></h3>
      <p>${playlist.tracks.length} 首${playlist.note ? ` · ${esc(playlist.note)}` : ""}</p>
      <div class="playlist-card-cover">
        ${covers || `<span>空</span><span>白</span><span>歌</span>`}
      </div>
      <div class="playlist-card-actions">
        <button class="icon-btn" data-action="play-playlist" data-playlist-id="${esc(playlist.id)}" aria-label="播放歌单">${icon("play")}</button>
        ${favorites ? "" : `<button class="icon-btn" data-action="delete-playlist" data-playlist-id="${esc(playlist.id)}" aria-label="删除歌单">${icon("trash")}</button>`}
      </div>
    </article>
  `;
}

/* ------------------------------------------------------------------ */
/* Home                                                               */
/* ------------------------------------------------------------------ */

export function homeView(data, state) {
  const artist = data.artist;
  const hero = data.heroSong || data.songs[0];
  const heroCover = hero?.cover || data.featured[0]?.cover || "/assets/img/cover-fallback.svg";
  const topSongs = data.songs.slice(0, 9);
  const featured = data.featured.slice(0, 12);
  const years = data.eras || [];
  const marqueeItems = ["童话镇", "阿婆说", "弦上有春秋", "易燃易爆炸", "走马", "理想三旬", "斑马斑马", "我要你", "后来", "小半"];
  const community = data.community;

  return `
    <section class="hero shell">
      <div class="hero-copy reveal">
        <div class="hero-eyebrow">
          <span class="dot"></span>
          <span>非官方 · 发友自制</span>
          <span class="slash">/</span>
          <span>无需登录</span>
          <span class="slash">/</span>
          <span>EST. 2026</span>
        </div>
        <h1 class="hero-title">
          <span class="first">陈一发儿</span>
          <span class="second">的留声机</span>
        </h1>
        <p class="hero-intro">
          从 <strong>《童话镇》</strong> 到无数个唱到凌晨的直播间，
          这里收着 <strong>${artist.albumCount} 张唱片</strong>、<strong>${artist.songCount.toLocaleString("zh-CN")} 首歌</strong>，
          和一段还没舍得说完的故事。把喜欢唱成岁月，把故事留在歌里。
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="play-random" data-queue="home">
            ${icon("play")} 随便听一首
          </button>
          ${hero ? `<button class="btn btn-ghost" data-action="play-song" data-song-id="${esc(hero.id)}" data-queue="home">
            ${icon("disc")} 从《${esc(hero.title)}》开始
          </button>` : ""}
        </div>
        <dl class="hero-stats">
          <div class="hero-stat"><dt>${artist.albumCount}</dt><dd>张唱片</dd></div>
          <div class="hero-stat"><dt>${artist.songCount.toLocaleString("zh-CN")}</dt><dd>首声音存档</dd></div>
          <div class="hero-stat"><dt>${Math.round(artist.hours).toLocaleString("zh-CN")}</dt><dd>小时陪伴</dd></div>
          <div class="hero-stat"><dt>2015—2026</dt><dd>十一年一刻</dd></div>
        </dl>
      </div>

      <div class="hero-stage" id="hero-stage">
        <div class="hero-float-card">
          <div class="float-top"><span>NOW SPINNING</span><i></i></div>
          <div class="hero-float-main">
            <img src="${esc(thumb(heroCover, 300))}" alt="">
            <div>
              <b>${esc(hero?.title || "童话镇")}</b>
              <span>${esc(hero?.album || "陈一发儿")}</span>
            </div>
            <span class="hero-float-wave"><i></i><i></i><i></i><i></i></span>
          </div>
        </div>

        <div class="hero-portrait">
          <img src="/assets/img/hero-portrait.jpg" alt="陈一发儿" fetchpriority="high">
          <div class="hero-portrait-caption">
            <span>FAN ARCHIVE · 67373</span>
            <b>把喜欢唱成岁月</b>
          </div>
        </div>

        <div class="vinyl" aria-hidden="true">
          <div class="vinyl-label"><b>发</b><small>CHEN YIFA · 67373</small></div>
          <span class="vinyl-hole"></span>
        </div>

        <div class="hero-stamp" aria-hidden="true">
          <b>发</b>
          <span>FAN CLUB</span>
        </div>
        <p class="hero-hand-note">如果故事终会说完，<br>至少歌还在。</p>
      </div>

      <span class="hero-side-label">CHEN YIFA · PRIVATE LISTENING ROOM · 67373</span>
      <div class="hero-scroll">向下听歌 ${icon("arrow-down")}</div>
    </section>

    <div class="marquee" aria-hidden="true">
      <div class="marquee-track">
        ${[...marqueeItems, ...marqueeItems].map((item) => `<span>${item}<i></i></span>`).join("")}
      </div>
    </div>

    <section class="section" id="listen">
      <div class="shell">
        <div class="section-head reveal">
          <div class="section-head-copy">
            <span class="kicker">TONIGHT'S SELECTION · 今晚听什么</span>
            <h2 class="section-title">先听一首，<em>再慢慢说。</em></h2>
            <p class="section-lead">从播放次数最高的那几首开始。也许你是因为一首歌来的，最后留在这里的，是一整个夜晚。</p>
          </div>
          <div class="section-side">
            <button class="btn btn-sm btn-ghost" data-action="play-random" data-queue="home">${icon("shuffle")} 随机播放</button>
          </div>
        </div>

        <div class="listen-grid">
          <div class="chart" id="chart-list">
            ${topSongs.map((song, index) => songRow(song, {
              queue: "home",
              rank: index + 1,
              favorite: state.favorites.some((item) => item.id === song.id),
            })).join("")}
          </div>

          ${hero ? featureCard(hero) : ""}
        </div>
      </div>
    </section>

    <section class="section" id="albums">
      <div class="shell">
        <div class="section-head reveal">
          <div class="section-head-copy">
            <span class="kicker">THE RECORD SHELF · 唱片架</span>
            <h2 class="section-title">把直播间的夜晚，<br><em>装进一张唱片。</em></h2>
            <p class="section-lead">原创、翻唱、茶话会、深夜电台。按年份慢慢翻，总有一张封面，能把你带回某个具体的晚上。</p>
          </div>
          <div class="section-side shelf-arrows">
            <button class="icon-btn" data-action="shelf-scroll" data-direction="-1" aria-label="向左翻唱片">${icon("chevron-left")}</button>
            <button class="icon-btn" data-action="shelf-scroll" data-direction="1" aria-label="向右翻唱片">${icon("chevron-right")}</button>
          </div>
        </div>

        <div class="filter-row reveal" id="album-filters">
          ${["全部", "原创", "直播", "茶话会", "电台"].map((name, index) => `<button class="filter-chip ${index === 0 ? "is-active" : ""}" data-filter-album="${name}">${name}</button>`).join("")}
        </div>

        <div class="shelf-wrap reveal">
          <div class="album-shelf" id="album-shelf">
            ${featured.map((album) => albumCard(album, { eager: true })).join("")}
          </div>
        </div>

        <div class="section-side" style="justify-content:flex-end;margin-top:18px">
          <a class="section-link" href="/albums" data-link>全部 ${artist.albumCount} 张唱片 ${icon("arrow-up-right")}</a>
        </div>
      </div>
    </section>

    <section class="section" id="years">
      <div class="shell">
        <div class="era-band reveal">
          <div class="era-copy">
            <span class="kicker">2015 — 2026 · 十一年一刻</span>
            <h2>十一年，<br><em>一万首歌。</em></h2>
            <p>从第一场直播，到茶话会、生日歌会、跨年夜晚。时间把声音留了下来，也把听歌的人留在了这里。</p>
          </div>
          <div class="era-years">
            ${years.map((era) => `<a class="era-year ${era.albums < 3 ? "is-muted" : ""}" href="/albums?year=${era.year}" data-link>${era.year}<small>${era.albums} 张</small></a>`).join("")}
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="community">
      <div class="shell">
        <div class="section-head reveal">
          <div class="section-head-copy">
            <span class="kicker">FAN PLAYLISTS · 发友歌单</span>
            <h2 class="section-title">把你的单曲循环，<br><em>留给另一个发友。</em></h2>
            <p class="section-lead">不用注册，不用登录。歌单可以备份到本地，也可以生成一个同步码，发给同好一起听。</p>
          </div>
          <div class="section-side">
            <a class="section-link" href="/community" data-link>去歌单广场 ${icon("arrow-up-right")}</a>
          </div>
        </div>

        <div class="community-grid">
          <div class="sync-card reveal">
            <span class="kicker">TAKE IT WITH YOU · 云端同步</span>
            <h3 class="sync-title">把歌单带上云端，<br><em>再递给下一个人。</em></h3>
            <p class="sync-desc">创建分享后会得到一个 6 位同步码。对方无需登录，输入同步码就能打开你的歌单；你也可以随时更新它。</p>
            <div class="sync-actions">
              <button class="btn btn-primary" data-action="open-share-picker">${icon("cloud")} 生成同步码</button>
              <button class="btn" data-action="export-backup">${icon("download")} 导出备份</button>
            </div>
            <form class="sync-code-form" id="home-code-form">
              <input name="code" maxlength="6" placeholder="输入 6 位同步码" autocomplete="off" spellcheck="false" aria-label="输入同步码">
              <button type="submit">打开歌单</button>
            </form>
            <p class="sync-foot">LOCAL-FIRST · 不上传账号 · 分享内容保留 90 天</p>
          </div>

          <div class="community-board reveal">
            <div class="board-head">
              <h3>最近发友在听</h3>
              <span>${community?.playlists?.length ? `${community.playlists.length} 份共享歌单` : "等待第一份歌单"}</span>
            </div>
            ${communityList(community, 6)}
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="about">
      <div class="shell">
        <div class="about-grid">
          <div class="reveal">
            <span class="kicker">A NOTE FROM THE FANS · 写在最后</span>
            <blockquote class="about-quote">“如果故事终会说完，<br>至少<em>歌还在</em>。”</blockquote>
            <div class="about-text">
              <p>这是一个由发友自己搭起来的小小音乐馆。没有广告，没有登录，也不收集你的信息。我们只是把散落在直播回放、歌单和记忆里的声音，重新放回一台唱机上。</p>
              <p>你可以收藏、下载、把自己的歌单分享出去。希望每一个点进来的人，都能找到那首陪自己走过一段路的歌。</p>
            </div>
            <div class="about-sign"><span class="brand-seal">发</span><span>MADE BY FANS, FOR FANS · 2026</span></div>
          </div>
          <div class="polaroids reveal">
            <figure class="polaroid polaroid-1"><img src="/assets/img/hero-portrait.jpg" alt="陈一发儿"><figcaption>“把喜欢唱成岁月。”</figcaption></figure>
            <figure class="polaroid polaroid-2"><img src="/assets/img/photo-bunny.jpg" alt="陈一发儿"><figcaption>那些可爱的瞬间</figcaption></figure>
            <figure class="polaroid polaroid-3"><img src="/assets/img/photo-christmas.jpg" alt="陈一发儿"><figcaption>茶话会 · 旧时光</figcaption></figure>
            <span class="stamp-note">FAN ARCHIVE / NO.67373</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function featureCard(song) {
  return `
    <article class="feature-card reveal">
      <div class="feature-art">
        <img src="${esc(thumb(song.cover, 900))}" alt="${esc(song.title)} 封面">
        <span class="feature-label">入坑曲 · 2016</span>
        <button class="feature-play" data-action="play-song" data-song-id="${esc(song.id)}" data-queue="home" aria-label="播放 ${esc(song.title)}">${icon("play")}</button>
      </div>
      <div class="feature-body">
        <span class="feature-eyebrow">THE ONE THAT STARTED IT ALL</span>
        <h3 class="feature-title">${esc(song.title)}</h3>
        <p class="feature-note">“总有一条蜿蜒在童话镇里七彩的河。”<br>很多人是从这一首开始认识她的。后来才发现，她唱的不只是童话，也是我们每个人心里那条回不去的河。</p>
        <div class="feature-meta">
          <span>${esc(song.album || "陈一发儿")} · ${formatDuration(song.duration)}</span>
          <button class="feature-download" data-action="download-song" data-song-id="${esc(song.id)}">${icon("download")} 一键下载</button>
        </div>
      </div>
    </article>
  `;
}

function communityList(community, limit = 6) {
  if (!community?.enabled) {
    return `
      <div class="board-empty">
        ${icon("cloud")}
        <b>云端同步正在等第一阵风</b>
        <p>部署时绑定一个 Cloudflare KV 命名空间，发友们的共享歌单就会出现在这里。</p>
      </div>
    `;
  }
  if (!community.playlists?.length) {
    return `
      <div class="board-empty">
        ${icon("headphones")}
        <b>还没有人分享歌单</b>
        <p>成为第一个把歌单递出去的人吧。创建后会得到一个 6 位同步码。</p>
      </div>
    `;
  }
  return community.playlists.slice(0, limit).map((playlist) => `
    <a class="community-item" href="/s/${esc(playlist.code)}" data-link>
      <span class="community-cover"><img src="${esc(thumb(playlist.cover, 300) || "/assets/img/cover-fallback.svg")}" alt="" loading="lazy"></span>
      <span class="community-info">
        <span class="community-name ellipsis">${esc(playlist.name)}</span>
        <span class="community-sub">${esc(playlist.author || "匿名发友")} · ${playlist.trackCount} 首 · ${timeAgo(playlist.createdAt)}</span>
      </span>
      <span class="community-arrow">${icon("arrow-up-right")}</span>
    </a>
  `).join("");
}

/* ------------------------------------------------------------------ */
/* Albums                                                             */
/* ------------------------------------------------------------------ */

export function albumsView(data, { year = "", category = "全部" } = {}) {
  const albums = data.albums.filter((album) => {
    if (year && String(album.year) !== String(year)) return false;
    if (category !== "全部" && album.category !== category) return false;
    return true;
  });
  const years = [...new Set(data.albums.map((album) => album.year).filter(Boolean))].sort((a, b) => b - a);

  return `
    <div class="page">
      <div class="shell">
        <header class="page-hero">
          <div>
            <span class="kicker">THE COMPLETE RECORD SHELF</span>
            <h1>唱片架<em>.</em></h1>
            <p>${data.stats.albums} 张唱片，${data.stats.songs.toLocaleString("zh-CN")} 首歌，约 ${Math.round(data.stats.hours).toLocaleString("zh-CN")} 小时。按年份或类型慢慢翻。</p>
          </div>
          <div class="page-hero-side">
            ${year ? `<a class="btn btn-sm btn-ghost" href="/albums" data-link>${icon("close")} 取消 ${year} 年筛选</a>` : ""}
          </div>
        </header>
        <div class="page-section">
          <div class="filter-row" id="archive-filters">
            ${["全部", "原创", "直播", "茶话会", "电台", "其他"].map((name) => `<button class="filter-chip ${name === category ? "is-active" : ""}" data-archive-filter="${name}">${name}</button>`).join("")}
            <span style="margin-left:auto;color:var(--muted);font-family:var(--font-mono);font-size:9px">${albums.length} 张</span>
          </div>
          <div class="filter-row" id="archive-years" style="margin-top:10px">
            <button class="filter-chip ${!year ? "is-active" : ""}" data-archive-year="">全部年份</button>
            ${years.map((item) => `<button class="filter-chip ${String(year) === String(item) ? "is-active" : ""}" data-archive-year="${item}">${item}</button>`).join("")}
          </div>
          <div class="album-grid" style="margin-top:30px">
            ${albums.map((album, index) => albumCard(album, { eager: index < 6 })).join("")}
          </div>
          ${albums.length ? "" : `<div class="empty-state">${icon("disc")}<b>这一格还没有唱片</b><p>换一个年份或类型试试。</p></div>`}
        </div>
      </div>
    </div>
  `;
}

export function albumView(data, state) {
  const { album, songs } = data;
  const queue = `album:${album.id}`;
  return `
    <div class="page">
      <div class="album-hero-bg" style="background-image:url('${esc(album.cover)}')"></div>
      <div class="shell">
        <div class="album-hero">
          <div class="album-cover"><img src="${esc(thumb(album.cover, 900))}" alt="${esc(album.name)} 封面"></div>
          <div class="album-hero-copy">
            <span class="kicker">ALBUM · ${esc(album.category)} · ${album.year || "年份不详"}</span>
            <h1>${esc(album.name)}</h1>
            <div class="album-hero-meta">
              <span>${esc(album.artist)}</span><i></i>
              <span>${album.songCount} 首</span><i></i>
              <span>${formatDuration(album.duration)}</span>
              <span>·</span>
              <span>播放 ${formatCount(album.playCount)} 次</span>
            </div>
            <div class="album-hero-actions">
              <button class="btn btn-primary" data-action="play-album-now" data-album-id="${esc(album.id)}">${icon("play")} 播放整张</button>
              <button class="btn btn-ghost" data-action="play-random-album" data-album-id="${esc(album.id)}">${icon("shuffle")} 随机一首</button>
              <button class="btn btn-ghost" data-action="add-album-to-playlist" data-album-id="${esc(album.id)}">${icon("plus")} 收进歌单</button>
            </div>
            <p class="album-hero-note">这一张里的每一首，都来自同一个夜晚或同一段时期。按下播放，把时间倒回那个具体的晚上。</p>
          </div>
        </div>
        <div class="page-section">
          <div class="track-table">
            <div class="track-head"><span>#</span><span>曲目</span><span>专辑</span><span>时长</span><span></span></div>
            ${songs.map((song, index) => trackRow(song, {
              queue,
              index,
              favorite: state.favorites.some((item) => item.id === song.id),
            })).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export function searchView(query, data, state) {
  return `
    <div class="page">
      <div class="shell">
        <header class="page-hero">
          <div>
            <span class="kicker">SEARCH THE ARCHIVE</span>
            <h1>找一首歌<em>.</em></h1>
            <p>搜歌名、专辑、直播场次。找不到的时候，也可以去唱片架按年份翻翻。</p>
          </div>
        </header>
        <div class="page-section">
          <form class="search-page-form" id="search-page-form">
            ${icon("search")}
            <input name="q" value="${esc(query)}" placeholder="比如：童话镇、阿婆说、2017-8月" autocomplete="off" aria-label="搜索关键词">
            <button class="btn btn-sm btn-cream" type="submit">搜索</button>
          </form>
          ${data ? renderSearchResults(query, data, state) : `<div class="search-empty"><b>输入一个关键词</b>开始翻找这首歌。</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderSearchResults(query, data, state) {
  if (!data.songs.length && !data.albums.length) {
    return `<div class="search-empty"><b>没有找到「${esc(query)}」</b>换个关键词，或者去<a href="/albums" data-link style="color:var(--orange-2)">唱片架</a>慢慢翻。</div>`;
  }
  return `
    <div style="margin-top:38px">
      ${data.songs.length ? `
        <div class="section-head" style="margin-bottom:16px">
          <div><span class="kicker no-line">SONGS · 单曲</span></div>
          <span style="color:var(--muted);font-size:10px">${data.songs.length} 个结果</span>
        </div>
        <div class="chart">
          ${data.songs.map((song, index) => songRow(song, {
            queue: "search",
            rank: index + 1,
            favorite: state.favorites.some((item) => item.id === song.id),
          })).join("")}
        </div>
      ` : ""}
      ${data.albums.length ? `
        <div class="section-head" style="margin:44px 0 20px">
          <div><span class="kicker no-line">ALBUMS · 唱片</span></div>
          <span style="color:var(--muted);font-size:10px">${data.albums.length} 个结果</span>
        </div>
        <div class="album-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          ${data.albums.map(albumCard).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Library                                                            */
/* ------------------------------------------------------------------ */

export function libraryView(state, community) {
  const playlists = state.playlists;
  const bytes = new Blob([JSON.stringify(state)]).size;
  const percent = Math.min(100, (bytes / (5 * 1024 * 1024)) * 100);
  return `
    <div class="page">
      <div class="shell">
        <header class="page-hero">
          <div>
            <span class="kicker">MY OWN SHELF · 我的歌单</span>
            <h1>你的<em>私人唱片格</em></h1>
            <p>歌单默认只保存在这台设备。想换设备或发给同好时，再把它放上云端。不登录，也不会问你要手机号。</p>
          </div>
          <div class="page-hero-side">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" data-action="new-playlist">${icon("plus")} 新建歌单</button>
              <button class="btn btn-sm btn-ghost" data-action="import-backup">${icon("upload")} 导入备份</button>
            </div>
          </div>
        </header>
        <div class="page-section">
          <div class="library-grid">
            <div>
              <div class="playlist-cards">
                <article class="playlist-card">
                  <div class="playlist-card-top"><span class="playlist-card-icon">${icon("heart")}</span><span class="tag">${state.favorites.length} 首</span></div>
                  <h3><a href="/playlist/favorites" data-link>我的收藏</a></h3>
                  <p>所有点过心的歌</p>
                  <div class="playlist-card-cover">
                    ${state.favorites.slice(0, 3).map((song) => `<img src="${esc(thumb(song.cover, 300))}" alt="" loading="lazy">`).join("") || `<span>空</span><span>白</span><span>心</span>`}
                  </div>
                  <div class="playlist-card-actions">
                    <button class="icon-btn" data-action="play-favorites" aria-label="播放收藏">${icon("play")}</button>
                  </div>
                </article>
                ${playlists.map((playlist, index) => playlistCard(playlist, { index })).join("")}
                <button class="playlist-card is-new" data-action="new-playlist">
                  ${icon("plus")}
                  <span>新建一个歌单</span>
                  <small style="color:var(--muted-2);font-size:9px">从一首歌开始</small>
                </button>
              </div>
            </div>

            <aside class="library-side">
              <div class="side-card">
                <h3>本地备份</h3>
                <p>导出后会得到一个 JSON 文件。换浏览器、换手机时导入它，就能把歌单和收藏带过去。</p>
                <div class="side-row">
                  <button class="btn btn-sm btn-cream" data-action="export-backup" style="width:100%">${icon("download")} 导出</button>
                  <button class="btn btn-sm btn-ghost" data-action="import-backup" style="width:100%">${icon("upload")} 导入</button>
                </div>
                <div class="storage-meter"><i style="width:${percent}%"></i></div>
                <p style="margin-top:7px;font-family:var(--font-mono);font-size:8px;color:var(--muted-2)">${(bytes / 1024).toFixed(1)} KB / 约 5 MB 本地空间</p>
              </div>

              <div class="side-card">
                <h3>云端同步</h3>
                <p>给歌单生成 6 位同步码。拿到码的人不用登录，就能打开、试听、收藏一份。</p>
                <button class="btn btn-sm btn-primary" data-action="open-share-picker" style="width:100%">${icon("cloud")} 创建分享</button>
                <form class="sync-code-form" id="library-code-form" style="margin-top:10px">
                  <input name="code" maxlength="6" placeholder="输入同步码" autocomplete="off" spellcheck="false" aria-label="输入同步码">
                  <button type="submit">打开</button>
                </form>
              </div>

              <div class="side-card">
                <h3>发友歌单广场</h3>
                <p>${community?.playlists?.length ? `现在有 ${community.playlists.length} 份歌单正在被发友们分享。` : "还没有公开分享，成为第一个吧。"}</p>
                <a class="btn btn-sm btn-ghost" href="/community" data-link style="width:100%">${icon("arrow-up-right")} 去逛逛</a>
              </div>

              <div class="side-card">
                <h3>你的发友名</h3>
                <p>分享歌单时会显示这个名字：<b style="color:var(--orange-2)">${esc(state.fanName)}</b>。不用注册，随时可以改。</p>
                <button class="btn btn-sm btn-ghost" data-action="edit-fan-name" style="width:100%">${icon("edit")} 改个名字</button>
                <p style="margin-top:12px;font-size:9px;color:var(--muted-2);line-height:1.8">本站没有账号系统。收藏和歌单默认只写进浏览器本地存储；只有主动分享时，歌单内容才会被上传。</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function playlistView(playlist, {
  favorites = false,
  shared = false,
  state,
} = {}) {
  const tracks = playlist.tracks || [];
  const queue = `playlist:${playlist.id}`;
  return `
    <div class="page">
      <div class="shell">
        <header class="playlist-detail-head">
          <div>
            <span class="kicker">${favorites ? "YOUR FAVORITES" : shared ? "A SHARED PLAYLIST" : "YOUR PLAYLIST"}</span>
            <h1>${esc(playlist.name)}</h1>
            <p>${tracks.length} 首 · ${favorites ? "保存在这台设备" : playlist.remote ? `云端同步 ${esc(playlist.remote.code)}` : "仅保存在这台设备"}${playlist.note ? ` · ${esc(playlist.note)}` : ""}</p>
            <div class="playlist-hero-actions">
              ${tracks.length ? `<button class="btn btn-primary" data-action="play-playlist-now" data-playlist-id="${esc(playlist.id)}" data-favorites="${favorites ? "1" : "0"}">${icon("play")} 播放全部</button>` : ""}
              ${!favorites && !shared ? `<button class="btn btn-ghost" data-action="rename-playlist" data-playlist-id="${esc(playlist.id)}">${icon("edit")} 改名</button>` : ""}
              ${!favorites && !shared ? `<button class="btn btn-ghost" data-action="share-playlist" data-playlist-id="${esc(playlist.id)}">${icon("cloud")} ${playlist.remote ? "更新云端" : "生成同步码"}</button>` : ""}
              ${favorites ? "" : `<button class="btn btn-ghost" data-action="delete-playlist" data-playlist-id="${esc(playlist.id)}">${icon("trash")} 删除</button>`}
            </div>
            ${shared ? `<div class="shared-banner">${icon("cloud")} 这是一份来自 <b>${esc(playlist.author || "发友")}</b> 的共享歌单，同步码 <b>${esc(playlist.code)}</b>。保存后会复制一份到你的本地歌单，不影响原歌单。</div>` : ""}
            ${!favorites && !shared && playlist.remote ? `<div class="shared-banner">${icon("check")} 已同步到云端，同步码 <b>${esc(playlist.remote.code)}</b>。修改后记得再点一次「更新云端」。</div>` : ""}
            ${!favorites && !shared && !playlist.remote && tracks.length ? `<div class="shared-banner" style="border-color:var(--line);background:rgba(242,231,213,.03)">${icon("library")} 这份歌单目前只在这台设备上。想发给同好，点「生成同步码」。</div>` : ""}
          </div>
          <div class="head-actions">
            ${shared ? `<button class="btn btn-primary" data-action="save-shared" data-code="${esc(playlist.code)}">${icon("download")} 保存这份歌单</button>` : ""}
            ${!shared ? `<button class="btn btn-sm btn-ghost" data-action="export-playlist" data-playlist-id="${esc(playlist.id)}">${icon("download")} 导出</button>` : ""}
          </div>
        </header>

        <div class="page-section">
          ${tracks.length ? `
            <div class="track-table">
              <div class="track-head"><span>#</span><span>曲目</span><span>专辑</span><span>时长</span><span></span></div>
              ${tracks.map((song, index) => trackRow(song, {
                queue,
                index,
                favorite: state.favorites.some((item) => item.id === song.id),
              })).join("")}
            </div>
          ` : `
            <div class="empty-state">
              ${icon("headphones")}
              <b>这里还没有歌</b>
              <p>去首页或唱片架，把喜欢的歌一首首收进来。</p>
              <div style="display:flex;gap:9px;margin-top:12px">
                <a class="btn btn-sm btn-cream" href="/" data-link>去听歌</a>
                <a class="btn btn-sm btn-ghost" href="/albums" data-link>翻唱片</a>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Community                                                          */
/* ------------------------------------------------------------------ */

export function communityView(community, state) {
  const playlists = community?.playlists || [];
  return `
    <div class="page">
      <div class="shell">
        <header class="page-hero">
          <div>
            <span class="kicker">FAN PLAYLIST SQUARE</span>
            <h1>发友<em>歌单广场</em></h1>
            <p>这里没有算法推荐，只有另一个发友此刻正在循环的歌。打开一份歌单，或者把你的递出去。</p>
          </div>
          <div class="page-hero-side">
            <button class="btn btn-sm btn-primary" data-action="open-share-picker">${icon("cloud")} 分享我的歌单</button>
          </div>
        </header>
        <div class="page-section">
          <div class="sync-card" style="min-height:0;margin-bottom:38px">
            <span class="kicker">OPEN BY CODE · 同步码</span>
            <h3 class="sync-title" style="font-size:clamp(1.8rem,2.5vw,2.6rem)">手里有一个 6 位码？</h3>
            <p class="sync-desc">输入它，直接打开对应歌单。也可以在首页或「我的歌单」里操作。</p>
            <form class="sync-code-form" id="community-code-form" style="max-width:420px">
              <input name="code" maxlength="6" placeholder="例如：H7K2M9" autocomplete="off" spellcheck="false" aria-label="输入同步码">
              <button type="submit">打开歌单</button>
            </form>
          </div>

          ${playlists.length ? `
            <div class="community-board">
              <div class="board-head"><h3>全部共享歌单</h3><span>${playlists.length} 份</span></div>
              <div class="community-grid-list">
                ${playlists.map((playlist) => `
                  <a class="community-item" href="/s/${esc(playlist.code)}" data-link>
                    <span class="community-cover"><img src="${esc(thumb(playlist.cover, 300) || "/assets/img/cover-fallback.svg")}" alt="" loading="lazy"></span>
                    <span class="community-info">
                      <span class="community-name ellipsis">${esc(playlist.name)}</span>
                      <span class="community-sub">${esc(playlist.author || "匿名发友")} · ${playlist.trackCount} 首 · ${timeAgo(playlist.createdAt)}</span>
                    </span>
                    <span class="community-arrow">${icon("arrow-up-right")}</span>
                  </a>
                `).join("")}
              </div>
            </div>
          ` : `
            <div class="empty-state">
              ${icon("cloud")}
              <b>${community?.enabled ? "还在等第一份歌单" : "云端同步还没有开启"}</b>
              <p>${community?.enabled ? "生成一个同步码，把你的单曲循环留给下一位发友。" : "部署时绑定 Cloudflare KV 后，共享歌单会出现在这里。"}</p>
              <button class="btn btn-sm btn-cream" data-action="open-share-picker" style="margin-top:12px">${icon("cloud")} 分享我的歌单</button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Shared / about / errors                                            */
/* ------------------------------------------------------------------ */

export function sharedView(remote, state) {
  return playlistView(remote, { shared: true, state });
}

export function aboutView(data) {
  return `
    <div class="page">
      <div class="shell">
        <div class="about-page-grid">
          <div>
            <span class="kicker">ABOUT THIS LITTLE ROOM</span>
            <h1>一间由发友<br>搭起来的<em>留声机</em>。</h1>
            <div class="about-manifesto">
              <p>我们想做的不是另一个“音乐平台”，而是一间安静的房间：推门进来，不用注册，不用关注，不用被推荐算法推着走。你只需要挑一首想听的歌。</p>
              <p>这里的声音来自陈一发儿的作品与历年直播、茶话会录音。它们被整理成唱片，放在架子上。你可以播放、下载、收藏，也可以把自己的歌单留给下一个推门进来的人。</p>
              <p>本站由发友自制，非官方，不收费，不投放广告，不收集个人信息。音乐版权归陈一发儿及原权利人所有，请支持正版。</p>
            </div>
            <div class="about-facts">
              <div class="about-fact"><b>${data?.stats?.albums || 95}</b><span>张唱片</span></div>
              <div class="about-fact"><b>${(data?.stats?.songs || 11907).toLocaleString("zh-CN")}</b><span>首声音存档</span></div>
              <div class="about-fact"><b>${Math.round(data?.stats?.hours || 1720).toLocaleString("zh-CN")}</b><span>小时陪伴</span></div>
              <div class="about-fact"><b>0</b><span>个需要填写的登录框</span></div>
            </div>
          </div>
          <aside class="about-aside">
            <h2>这里有什么</h2>
            <ol>
              <li><b>在线播放</b>整张唱片、随机播放、收藏与队列。进度会记住。</li>
              <li><b>一键下载</b>每首歌都可以直接下载原文件，不需要跳转。</li>
              <li><b>本地备份</b>歌单和收藏导出为 JSON，换设备时导入即可。</li>
              <li><b>云端同步</b>生成 6 位同步码，发友不用登录就能打开你的歌单。</li>
            </ol>
            <a class="btn btn-sm btn-cream" href="/" data-link>${icon("play")} 回去听歌</a>
            <a class="about-jump" href="#info">${icon("arrow-down")} 开播通知与回放</a>
            <p style="margin-top:16px;color:var(--muted-2);font-family:var(--font-mono);font-size:8px;line-height:1.8">POWERED BY NAVIDROME · CLOUDFLARE PAGES<br>UNOFFICIAL FAN PROJECT · 2026</p>
          </aside>
        </div>
        ${infoHubView()}
      </div>
    </div>
  `;
}

/* 相关信息：开播通知 / 回放 / 小程序 / 手机客户端 */
function infoHubView() {
  const replayLinks = [
    { tag: "官方", name: "官方回放", host: "67373.net/streams", href: "https://67373.net/streams/", official: true },
    { tag: "非官方", name: "茶话会", host: "chatcyf.com/teaparty", href: "https://www.chatcyf.com/teaparty/" },
    { tag: "非官方", name: "镜像站", host: "陈一发儿.top", href: "http://xn--4gqy2fnwcsx7i.top/", guide: true },
    { tag: "网盘", name: "夸克网盘", host: "pan.quark.cn", href: "https://pan.quark.cn/s/dacb06e974c9" },
    { tag: "PT", name: "67373 PT", host: "67373pt.com", href: "https://www.67373pt.com/" },
  ];

  return `
    <section class="info-hub" id="info" aria-labelledby="info-title">
      <div class="info-hub-head">
        <div class="info-hub-copy">
          <span class="kicker">STAY IN TOUCH · 相关信息</span>
          <h2 class="section-title" id="info-title">开播有通知，<br>散场有<em>回放</em>。</h2>
          <p class="section-lead">直播不常有，所以把能找到她的地方都收在这里：开播通知、直播回放、微信小程序，还有手机端的听歌方式。</p>
        </div>
        <div class="info-stamp" aria-hidden="true">
          <span>FAN CHANNELS</span>
          <b>04</b>
          <small>个入口</small>
        </div>
      </div>

      <div class="info-hub-grid">
        <article class="info-card info-card-live reveal">
          <header class="info-card-head">
            <span class="info-no">— 01</span>
            <span class="info-mark">${icon("radio")}</span>
          </header>
          <h3>开播通知</h3>
          <p class="info-desc">开播前群里会喊一声。Telegram 与 QQ，挑常用的一个加上就好。</p>
          <div class="info-signal" aria-hidden="true">
            <span class="info-signal-bars"><i></i><i></i><i></i><i></i><i></i></span>
            <small>STANDBY · 等一场开播</small>
          </div>
          <div class="info-rows">
            <a class="info-row" href="https://t.me/FaFa67373" target="_blank" rel="noreferrer">
              <span class="info-row-icon">${icon("telegram")}</span>
              <span class="info-row-copy"><b>Telegram 群</b><small>@FaFa67373</small></span>
              <span class="info-row-go">${icon("arrow-up-right")}</span>
            </a>
            <div class="info-row">
              <span class="info-row-icon">${icon("qq")}</span>
              <span class="info-row-copy"><b>QQ 群</b><small>606797995</small></span>
              <button class="info-copy" data-action="copy-text" data-copy="606797995" aria-label="复制 QQ 群号">${icon("copy")}<span>复制</span></button>
            </div>
          </div>
        </article>

        <article class="info-card info-card-replay reveal">
          <header class="info-card-head">
            <span class="info-no">— 02</span>
            <span class="info-mark">${icon("replay")}</span>
          </header>
          <h3>直播回放</h3>
          <p class="info-desc">错过的直播，散场以后还能补。镜像站可点「教程」，用 Emby 客户端看。</p>
          <div class="replay-list">
            ${replayLinks.map((link) => link.guide ? `
              <div class="replay-row replay-row-emby">
                <span class="replay-tag">${link.tag}</span>
                <a class="replay-name" href="${link.href}" target="_blank" rel="noreferrer" aria-label="打开陈一发儿.top（新窗口）">${link.name}<small>${link.host}</small></a>
                <button class="replay-guide-btn" type="button" data-action="open-emby-guide" aria-label="查看陈一发儿.top 的网易爆米花使用教程">教程</button>
                <a class="replay-go" href="${link.href}" target="_blank" rel="noreferrer" aria-label="打开陈一发儿.top（新窗口）">${icon("arrow-up-right")}</a>
              </div>
            ` : `
              <a class="replay-row" href="${link.href}" target="_blank" rel="noreferrer">
                <span class="replay-tag ${link.official ? "is-official" : ""}">${link.tag}</span>
                <span class="replay-name">${link.name}<small>${link.host}</small></span>
                <span class="replay-go">${icon("arrow-up-right")}</span>
              </a>
            `).join("")}
          </div>
        </article>

        <article class="info-card info-card-wechat reveal">
          <header class="info-card-head">
            <span class="info-no">— 03</span>
            <span class="info-mark">${icon("wechat")}</span>
          </header>
          <h3>微信小程序</h3>
          <p class="info-desc">在微信里搜「小德看电影」：开播提醒、电影打分、直播导航，都收在这一个小程序里。</p>
          <a class="wechat-plate" href="https://mp.weixin.qq.com/s/6S0ql4DE29pIDWN4ZmH5KA" target="_blank" rel="noreferrer">
            <span class="wechat-badge">微</span>
            <span class="wechat-copy"><b>小德看电影</b><small>微信小程序 · 查看介绍</small></span>
            ${icon("arrow-up-right")}
          </a>
        </article>

        <article class="guide-card reveal">
          <header class="guide-head">
            <div class="guide-head-copy">
              <span class="kicker no-line">MOBILE · 手机端听歌</span>
              <h3 class="guide-title">飞牛音乐，把唱片架<em>装进口袋</em>。</h3>
              <p class="guide-lead">除了网页，手机也能听。装好飞牛音乐，用下面的示例账号登录，三分钟就能进入私人音乐库。</p>
            </div>
            <div class="guide-platforms" aria-label="支持平台">
              <span>iOS</span><span>ANDROID</span><small>NAS 账号登录</small>
            </div>
          </header>

          <ol class="guide-steps">
            <li class="guide-step">
              <span class="guide-step-no">01</span>
              <h4>下载 App</h4>
              <p>打开 App Store 或各大安卓应用商店，搜索「飞牛音乐」并下载安装。</p>
            </li>
            <li class="guide-step">
              <span class="guide-step-no">02</span>
              <h4>打开 App</h4>
              <p>首次打开会直接进入登录界面，在这里填写连接信息；同一局域网也可以点「发现局域网内服务器」。</p>
            </li>
            <li class="guide-step">
              <span class="guide-step-no">03</span>
              <h4>填写登录信息</h4>
              <p>按下方示例填写 FN ID、用户名与密码，HTTPS 安全访问保持开启。</p>
            </li>
            <li class="guide-step">
              <span class="guide-step-no">04</span>
              <h4>点击「登录」</h4>
              <p>登录成功后进入私人音乐库，收藏、歌单与最近播放都在里面。</p>
            </li>
          </ol>

          <div class="guide-bottom">
            <div class="login-ticket">
              <div class="login-head"><span>LOGIN · 登录信息</span><i>示例账号</i></div>
              <dl class="login-list">
                <div class="login-row"><dt>FN ID</dt><dd class="login-value">daniel67373</dd></div>
                <div class="login-row"><dt>用户名</dt><dd class="login-value">67373</dd></div>
                <div class="login-row">
                  <dt>密码</dt>
                  <dd class="login-value is-pass">
                    <span data-secret data-value="cyf67373" data-masked="false">cyf67373</span>
                    <button class="login-eye" data-action="toggle-secret" aria-label="隐藏密码">${icon("eye-off")}</button>
                  </dd>
                </div>
              </dl>
              <p>HTTPS 安全访问请保持开启。示例账号仅供发友登录音乐库，请勿修改或转借。</p>
              <ul class="login-tips">
                <li>App Store 页面显示名称也是「飞牛音乐」。</li>
                <li>目前仅手机 App 支持 NAS 账号登录，PC 端后续支持。</li>
              </ul>
            </div>
            <figure class="guide-shot">
              <a href="/assets/img/fn-music-login.jpg" target="_blank" rel="noreferrer" aria-label="查看飞牛音乐手机端登录教程大图">
                <img src="/assets/img/fn-music-login.jpg" alt="飞牛音乐手机端登录教程：下载 App、打开 App、填写登录信息、点击登录四步图解" width="1400" height="787" loading="lazy">
                <span class="guide-shot-tag">教程长图 · 点击看大图</span>
              </a>
              <figcaption>飞牛音乐手机端登录教程 · 四步图解</figcaption>
            </figure>
          </div>
        </article>
      </div>

      <p class="info-hub-note">${icon("info")} 以上入口均为外部站点，链接内容由各站维护；请勿在公开群里透露个人信息。</p>
    </section>
  `;
}

export function embyGuideBody() {
  const params = `名称：67373emby
协议：HTTPS
地址：emby.zddyz.org
端口：443
用户名：cyf
密码：留空
HTTPS 证书校验：开启`;

  return `
    <div class="emby-guide">
      <div class="emby-guide-main">
        <p class="emby-lead">陈一发儿.top 的回放放在一台 Emby 媒体服务器上。网页之外，用网易爆米花连上它，手机、电视和电脑都能看。</p>
        <ol class="emby-steps">
          <li class="emby-step">
            <span class="emby-step-no">01</span>
            <div>
              <h4>下载并安装网易爆米花</h4>
              <p>打开下载页，按设备选择 iOS、Android、Android TV、Apple TV、macOS 或 Windows 版本；安卓也可以直接下载 APK。</p>
              <a class="emby-inline-link" href="https://bmh.163.com/download/" target="_blank" rel="noreferrer">bmh.163.com/download ${icon("external")}</a>
            </div>
          </li>
          <li class="emby-step">
            <span class="emby-step-no">02</span>
            <div>
              <h4>添加 Emby 服务器</h4>
              <p>打开客户端，在添加媒体服务器的入口选择「Emby」，不要选 SMB、WebDAV 之类的协议。</p>
            </div>
          </li>
          <li class="emby-step">
            <span class="emby-step-no">03</span>
            <div>
              <h4>填写连接参数</h4>
              <p>按下面的参数填写地址、端口和用户名。密码留空，HTTPS 证书校验保持开启。</p>
            </div>
          </li>
          <li class="emby-step">
            <span class="emby-step-no">04</span>
            <div>
              <h4>点击「确认添加」</h4>
              <p>连接成功后进入媒体库，在电影或视频列表里找直播回放即可。</p>
            </div>
          </li>
        </ol>

        <div class="emby-params">
          <div class="emby-params-head">
            <span>EMBY · 连接参数</span>
            <button class="info-copy" type="button" data-action="copy-text" data-copy="${esc(params)}" data-copy-label="连接参数" aria-label="复制 Emby 连接参数">${icon("copy")}<span>复制全部</span></button>
          </div>
          <dl class="emby-param-list">
            <div><dt>名称</dt><dd>67373emby</dd></div>
            <div><dt>协议</dt><dd>HTTPS</dd></div>
            <div><dt>地址</dt><dd>emby.zddyz.org</dd></div>
            <div><dt>端口</dt><dd>443</dd></div>
            <div><dt>用户名</dt><dd>cyf</dd></div>
            <div><dt>密码</dt><dd>留空</dd></div>
            <div><dt>证书校验</dt><dd>开启</dd></div>
          </dl>
          <p>名称可以随意改；密码选填，留空即可。连接地址是 emby.zddyz.org，不是网页版域名。</p>
        </div>
      </div>

      <figure class="emby-shot">
        <a href="/assets/img/emby-params.jpg" target="_blank" rel="noreferrer" aria-label="查看添加 Emby 参数大图">
          <img src="/assets/img/emby-params.jpg" alt="网易爆米花添加 Emby 的参数示例：名称 67373emby、协议 HTTPS、地址 emby.zddyz.org、端口 443、用户名 cyf、密码留空、HTTPS 证书校验开启" width="621" height="1280" loading="lazy">
        </a>
        <figcaption>添加 Emby · 参数示例</figcaption>
      </figure>
    </div>
  `;
}

export function errorView(error, { configured = true } = {}) {
  const isConfig = error?.payload?.configured === false || error?.status === 503;
  return `
    <div class="page">
      <div class="shell">
        <div class="error-state">
          <span class="brand-seal">发</span>
          <h1>${isConfig ? "唱机还没有接上。" : "这张唱片卡住了。"}</h1>
          <p>${isConfig
            ? "音乐库还没有配置好。站点需要连接 Navidrome，但凭据只应该保存在 Cloudflare 的环境变量里，不会出现在浏览器。"
            : "没能从音乐库取到数据。可能是网络抖了一下，也可能服务器正在休息。稍后再试，或者先看看唱片架。"}</p>
          <div class="error-actions">
            <button class="btn btn-primary" data-action="retry">${icon("refresh")} 再试一次</button>
            <a class="btn btn-ghost" href="/about" data-link>${icon("arrow-right")} 关于本站</a>
          </div>
          ${error?.message ? `<div class="error-detail">${esc(error.message)}${error.status ? ` · HTTP ${error.status}` : ""}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

export function sharedMissingView(code) {
  return `
    <div class="page">
      <div class="shell">
        <div class="error-state">
          <span class="brand-seal">发</span>
          <h1>这份歌单已经下架了。</h1>
          <p>同步码 <b style="color:var(--orange-2);font-family:var(--font-mono);letter-spacing:.12em">${esc(code)}</b> 找不到对应的歌单。它可能已经过期，或者被分享者删除了。去广场看看别人最近在听什么吧。</p>
          <div class="error-actions">
            <a class="btn btn-primary" href="/community" data-link>${icon("headphones")} 去歌单广场</a>
            <a class="btn btn-ghost" href="/" data-link>${icon("home")} 回首页</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function notFoundView() {
  return `
    <div class="page">
      <div class="shell">
        <div class="error-state">
          <span class="brand-seal">发</span>
          <h1>这页被夹进旧唱片里了。</h1>
          <p>地址可能写错了，或者这张唱片已经下架。回到首页，重新放一张吧。</p>
          <div class="error-actions">
            <a class="btn btn-primary" href="/" data-link>${icon("home")} 回首页</a>
            <a class="btn btn-ghost" href="/albums" data-link>${icon("disc")} 翻唱片</a>
          </div>
        </div>
      </div>
    </div>
  `;
}


