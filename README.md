# 陈一发儿 · 发友留声机

一个为陈一发儿发友定制的匿名音乐馆。中文优先、无需登录、打开就能听；接入已有的 Navidrome 曲库，支持在线播放、一键下载、歌单本地备份与 6 位同步码分享。

仓库：[wangdaniel2022/cyf-fan-radio](https://github.com/wangdaniel2022/cyf-fan-radio)

![首页预览](docs/preview.jpg)

![移动端预览](docs/preview-mobile.jpg)

> 非官方粉丝作品。音乐版权归陈一发儿及原权利人所有，本站不收费、不投放广告，仅供发友试听交流，请支持正版。

## 它是什么

- **发友审美**：旧唱片店 × 深夜电台的视觉，暖墨、朱砂、纸张与黑胶；不是通用播放器换一层皮。
- **匿名访问**：没有注册、登录、手机号、第三方统计。歌单和收藏默认只存在浏览器。
- **中文体验**：中文排版、中文歌曲信息、中文错误提示、中文日期与文件名。
- **完整播放器**：播放 / 暂停、上一首 / 下一首、进度、音量、随机、循环、播放队列、Media Session、断点续听。
- **一键下载**：歌曲行、播放器、沉浸播放页都能直接下载原文件，下载名保留中文。
- **歌单备份**：导出 / 导入 JSON，换浏览器或换设备时把收藏带走。
- **歌单同步**：生成 6 位同步码，发友不用登录就能打开、试听并保存一份；支持版本冲突提示。
- **发友广场**：最近分享的歌单会出现在广场，形成轻量的同好互动。
- **Cloudflare 免费部署**：静态页面 + Pages Functions，凭据只放服务端；KV 只存分享歌单。

## 技术结构

```text
浏览器
  ├─ 静态页面（HTML / CSS / 原生 ES Modules，无构建步骤）
  └─ /api/*  ── Cloudflare Pages Functions ── Navidrome Subsonic API
                         │
                         └─ Cloudflare KV（歌单同步，可选）
```

关键点：**Navidrome 用户名和密码永远不会进入浏览器**。前端只请求同源的 `/api/*`，由 Pages Functions 在服务端拼接 Subsonic 凭据、代理音频、封面和下载，并处理 KV 同步。

```text
.
├── index.html
├── assets/
│   ├── css/app.css          # 全部视觉与响应式
│   ├── js/
│   │   ├── app.js           # 路由、事件、同步流程、启动
│   │   ├── api.js            # 同源 API 客户端
│   │   ├── data.js           # 当前视图的歌曲/队列注册表
│   │   ├── player.js         # 单例播放器、队列、Media Session
│   │   ├── store.js          # localStorage 歌单/收藏/备份
│   │   ├── ui.js             # 弹窗、Toast、分享码
│   │   ├── utils.js
│   │   └── views.js          # 纯字符串视图
│   └── img/                  # 头像、照片、OG、图标
├── functions/api/[[catchall]].js   # Pages Functions：代理 + 同步
├── scripts/dev-server.mjs    # 免 Wrangler 的本地开发服务器
├── scripts/smoke.mjs         # 端到端冒烟测试
├── _headers                  # CSP / 安全头 / 静态缓存
├── _redirects                # SPA fallback
├── wrangler.toml.example
└── site.webmanifest
```

## 本地运行

要求：Node.js 20+。

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入 Navidrome 地址与账号
npm run dev
```

打开 <http://127.0.0.1:4173>。

本地开发服务器会：

- 直接托管静态文件，模拟 `_redirects` 的 SPA fallback；
- 加载 `.dev.vars`，并把 `functions/api/[[catchall]].js` 当作 Pages Function 调用；
- 用 `.dev-kv.json` 模拟 Cloudflare KV（已在 `.gitignore` 中排除）。

可选检查：

```bash
npm run check      # 所有 JS 语法检查
npm run smoke      # 需要 dev server 正在运行；会创建并清理一份测试歌单
```

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ND_BASE` | 是 | Navidrome 地址，例如 `https://music.example.com`（不要带 `/app/`） |
| `ND_USER` | 是 | 只读音乐库账号 |
| `ND_PASS` | 是 | 该账号密码 |
| `PLAYLIST_KV` | 同步功能需要 | Cloudflare KV 绑定名，代码里按这个名字读取 |

`.dev.vars` 只用于本地，已在 `.gitignore` 中排除。线上请在 Cloudflare 的环境变量里设置，**不要提交到 GitHub**。

## 部署到 Cloudflare Pages（免费）

### 方式一：GitHub 连接（推荐）

1. 把仓库推到 GitHub。
2. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择仓库，构建设置：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：`/`
4. 在 **Settings → Variables and Secrets** 添加：
   - `ND_BASE`
   - `ND_USER`（建议设为 Secret）
   - `ND_PASS`（建议设为 Secret）
5. 创建 KV：
   - **Workers & Pages → KV → Create namespace**，名字例如 `cyf-playlists`；
   - 回到 Pages 项目 → **Settings → Bindings → Add → KV namespace**；
   - Variable name 填 `PLAYLIST_KV`，选择刚创建的空间。
6. 重新部署。首次打开 `/api/health`，应看到：

```json
{ "ok": true, "library": true, "sync": true }
```

### 方式二：Wrangler CLI

```bash
npm i -D wrangler
cp wrangler.toml.example wrangler.toml
# 编辑 wrangler.toml，填入 KV namespace id
npx wrangler pages deploy . --project-name cyf-fan-radio
```

环境变量和 KV 绑定同样在 Pages 项目设置里配置；`wrangler.toml` 只保存非敏感绑定信息。

### 免费额度注意事项

- 静态请求和 Functions 请求都走 Cloudflare 的免费额度；音频通过 Worker 代理会消耗请求数和带宽，个人/小圈子使用通常足够。
- KV 免费额度对“分享歌单”这种低频写入足够；代码把每个 IP 每天创建分享限制为 12 次。
- 音频 Range 请求会按需代理，不整段缓存，避免占满 KV。
- 分享歌单默认保留 **90 天**；KV 的 TTL 到期自动清理。

## API 一览

| 路径 | 作用 |
| --- | --- |
| `GET /api/health` | 音乐库 / KV 状态 |
| `GET /api/home` | 首页聚合：歌手统计、热歌、推荐专辑、年份 |
| `GET /api/albums` | 全部专辑 |
| `GET /api/album/:id` | 专辑详情与曲目 |
| `GET /api/search?q=` | 搜索歌曲 / 专辑 / 歌手 |
| `GET /api/cover/:coverArtId?size=600` | 封面代理（带缓存） |
| `GET /api/stream/:songId` | 音频代理，支持 Range |
| `GET /api/download/:songId?name=&ext=` | 原文件下载，中文文件名 |
| `POST /api/sync` | 创建共享歌单，返回 6 位码 + 编辑 token |
| `GET /api/sync/:code` | 匿名读取共享歌单 |
| `PUT /api/sync/:code` | 编辑（Bearer token + 版本号） |
| `DELETE /api/sync/:code` | 删除（Bearer token） |
| `GET /api/community` | 最近公开分享的歌单 |

## 安全与隐私

- 凭据仅在 Pages Functions 的 `env` 中读取；前端源码、网络请求、下载链接里都没有账号密码。
- 只代理白名单接口；歌曲/封面 ID 做正则校验，避免把代理变成任意 URL 请求器。
- `/api/sync` 限制请求体大小、歌单歌曲数（300）、名称长度，并校验同源 Origin。
- 编辑 token 只返回一次，KV 中保存 SHA-256 哈希；没有 token 不能改别人的歌单。
- 歌单读取是公开的（6 位码本身就是访问凭证），请不要在共享歌单里放私人信息。
- 站点没有登录系统，不收集邮箱、手机号、位置；本地存储只在本机。
- 建议给 Navidrome 使用单独的只读账号，并定期更换密码。
- 如果账号凭据曾经出现在聊天、截图或提交历史里，请立即更换；本仓库不包含 `.dev.vars`。

## 设计说明

- **字体**：系统中文宋体/黑体栈，不依赖外部字体 CDN；在 Windows、macOS、iOS、Android 上都有可用回退。
- **动效**：黑胶旋转、渐入、悬停、唱针式进度；尊重 `prefers-reduced-motion`。
- **响应式**：桌面三栏播放器、移动端底部 Tab + 迷你播放器；390px 宽度下无横向滚动。
- **无障碍**：键盘 `/` 搜索、空格播放、方向键切歌、`M` 静音、`L` 收藏；图片 alt、按钮 aria-label、弹窗焦点陷阱。
- **PWA**：`site.webmanifest` + `sw.js` 只缓存页面外壳，不缓存音频和 API，断网时仍能打开界面。

## 参考与致谢

- [Navidrome](https://github.com/navidrome/navidrome) — 音乐库与 Subsonic API，本项目的后端。
- [Feishin](https://github.com/jeffvli/feishin) / [Sonixd](https://github.com/jeffvli/sonixd) — 桌面端 Subsonic 客户端的交互参考。
- [Aonsoku](https://github.com/victoralvesf/aonsoku) — 现代 Subsonic Web 客户端的结构参考。
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) 与 [KV](https://developers.cloudflare.com/kv/) 文档。
- 所有照片、封面与歌曲来自陈一发儿及原权利人；本站仅作粉丝交流展示。

## License

代码以 MIT License 发布（见 `LICENSE`）。音乐、照片、封面、艺人名称与相关素材不在此授权范围内，版权归原权利人所有。

---

如果这张唱片陪你度过了一个晚上，欢迎把歌单留给下一位发友。
