/*
 * 匿名收听人数计数器。
 *
 * D1 表：
 *   live_sessions     当前活跃会话（last_seen 在 3 分钟内算“正在听”）
 *   monthly_listeners 本月出现过的匿名会话（每个会话每月一行）
 *
 * 不保存 IP、UA、Cookie；只保存浏览器本地生成的随机 session id。
 * 仅接受本站 Pages Function 带过来的请求，避免被页面直接跨域调用。
 */

const LIVE_WINDOW = 180;
const PROXY_HEADER = "x-cyf-listener-proxy";
const PROXY_VALUE = "radio-zddyz";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function monthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

async function readCounts(env) {
  const now = Math.floor(Date.now() / 1000);
  const month = monthKey();
  const [live, monthly] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM live_sessions WHERE last_seen >= ?").bind(now - LIVE_WINDOW),
    env.DB.prepare("SELECT COUNT(*) AS n FROM monthly_listeners WHERE month = ?").bind(month),
  ]);
  return {
    current: Number(live.results?.[0]?.n) || 0,
    month: Number(monthly.results?.[0]?.n) || 0,
    monthKey: month,
  };
}

export default {
  async fetch(request, env) {
    if (!env.DB) return json({ ok: false, error: "D1 未绑定" }, 503);

    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: Boolean(env.DB) });

    if (request.headers.get(PROXY_HEADER) !== PROXY_VALUE) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    if (url.pathname === "/count" && request.method === "GET") {
      return json({ ok: true, ...(await readCounts(env)) });
    }

    if (url.pathname === "/heartbeat" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const id = String(body?.id || "");
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
        return json({ ok: false, error: "session id 不正确" }, 400);
      }

      const now = Math.floor(Date.now() / 1000);
      const playing = body?.playing !== false;

      if (playing) {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO live_sessions (id, last_seen) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen"
          ).bind(id, now),
          env.DB.prepare(
            "INSERT OR IGNORE INTO monthly_listeners (month, id, first_seen) VALUES (?, ?, ?)"
          ).bind(monthKey(), id, now),
        ]);
      } else {
        await env.DB.prepare("DELETE FROM live_sessions WHERE id = ?").bind(id).run();
      }

      return json({ ok: true, ...(await readCounts(env)) });
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};
