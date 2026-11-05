#!/usr/bin/env node
/**
 * 本地端到端冒烟测试。先运行 `npm run dev`，再运行 `npm run smoke`。
 * 会创建一份临时共享歌单，测试结束后删除。
 */
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4173";
let passed = 0;
let failed = 0;
let tempCode = null;
let tempToken = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  \u2713 ${message}`);
}

async function json(path, options = {}) {
  const response = await fetch(BASE + path, options);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { response, text, data };
}

async function main() {
  console.log(`\nSmoke test: ${BASE}\n`);

  const page = await fetch(BASE + "/");
  const html = await page.text();
  assert(page.status === 200, "首页返回 200");
  assert(html.includes("陈一发儿"), "首页包含站点标题");

  const health = await json("/api/health");
  assert(health.response.status === 200, "健康检查返回 200");
  assert(health.data?.library === true, "Navidrome 已连接");
  assert(health.data?.sync === true, "本地 KV 已连接");

  const home = await json("/api/home");
  assert(home.response.status === 200, "首页数据返回 200");
  assert(Array.isArray(home.data?.songs) && home.data.songs.length >= 5, "首页有可播放歌曲");
  assert(home.data?.artist?.songCount > 1000, "歌手曲库统计正常");
  assert(home.data?.featured?.length >= 4, "推荐专辑不少于 4 张");

  const albums = await json("/api/albums");
  assert(albums.response.status === 200, "专辑列表返回 200");
  assert(albums.data?.albums?.length >= 50, "专辑数量正常");
  const album = albums.data.albums.find((item) => item.songCount > 0);
  assert(Boolean(album), "能找到一张有歌曲的专辑");

  const detail = await json(`/api/album/${encodeURIComponent(album.id)}`);
  assert(detail.response.status === 200, "专辑详情返回 200");
  assert(detail.data?.songs?.length > 0, "专辑详情包含曲目");

  const search = await json("/api/search?q=" + encodeURIComponent("童话镇"));
  assert(search.response.status === 200, "搜索返回 200");
  assert(search.data?.songs?.length > 0, "搜索能返回歌曲");

  const song = home.data.songs[0];
  const cover = await fetch(`${BASE}${song.cover}?size=600`);
  assert(cover.status === 200, "封面代理返回 200");
  assert((await cover.arrayBuffer()).byteLength > 100, "封面有实际内容");

  const stream = await fetch(`${BASE}/api/stream/${encodeURIComponent(song.id)}`, { headers: { range: "bytes=0-1023" } });
  assert(stream.status === 206, "音频支持 Range（206）");
  assert(stream.headers.get("content-range")?.startsWith("bytes 0-1023"), "音频 Range 响应头正确");
  assert((await stream.arrayBuffer()).byteLength === 1024, "音频 Range 返回正确字节数");

  const download = await fetch(`${BASE}/api/download/${encodeURIComponent(song.id)}?name=${encodeURIComponent("陈一发儿 - 童话镇")}&ext=mp3`, { method: "HEAD" });
  assert(download.status === 200, "下载代理返回 200");
  assert((download.headers.get("content-disposition") || "").includes("filename*=UTF-8"), "下载响应包含中文文件名");

  const create = await json("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      name: "冒烟测试歌单",
      author: "发友测试",
      tracks: [song],
    }),
  });
  assert(create.response.status === 201, "创建共享歌单返回 201");
  tempCode = create.data?.code;
  tempToken = create.data?.token;
  assert(/^[A-Z0-9]{6}$/.test(tempCode || ""), "同步码格式正确");
  assert(Boolean(tempToken), "返回编辑令牌");

  const shared = await json(`/api/sync/${tempCode}`);
  assert(shared.response.status === 200, "读取共享歌单返回 200");
  assert(shared.data?.tracks?.length === 1, "共享歌单包含一首歌");

  const update = await json(`/api/sync/${tempCode}`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin: BASE, authorization: `Bearer ${tempToken}` },
    body: JSON.stringify({
      name: "冒烟测试歌单 v2",
      author: "发友测试",
      tracks: [song, song],
      baseVersion: 1,
    }),
  });
  assert(update.response.status === 200, "更新共享歌单返回 200");
  assert(update.data?.version === 2, "版本号递增");

  const conflict = await json(`/api/sync/${tempCode}`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin: BASE, authorization: `Bearer ${tempToken}` },
    body: JSON.stringify({ name: "冲突", author: "发友测试", tracks: [song], baseVersion: 1 }),
  });
  assert(conflict.response.status === 409, "旧版本更新返回 409");

  const community = await json("/api/community");
  assert(community.response.status === 200, "社区歌单列表返回 200");
  assert(community.data?.playlists?.some((item) => item.code === tempCode), "共享歌单出现在社区列表");

  const remove = await json(`/api/sync/${tempCode}`, {
    method: "DELETE",
    headers: { origin: BASE, authorization: `Bearer ${tempToken}` },
  });
  assert(remove.response.status === 200, "删除共享歌单返回 200");
  tempCode = null;
  const afterDelete = await json(`/api/sync/${create.data.code}`);
  assert(afterDelete.response.status === 404, "删除后读取返回 404");
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
  })
  .catch(async (error) => {
    failed += 1;
    console.error(`\n  \u2717 ${error.message}\n`);
    if (tempCode && tempToken) {
      await fetch(`${BASE}/api/sync/${tempCode}`, {
        method: "DELETE",
        headers: { origin: BASE, authorization: `Bearer ${tempToken}` },
      }).catch(() => {});
    }
    console.log(`${passed} passed, ${failed} failed\n`);
    process.exitCode = 1;
  });
