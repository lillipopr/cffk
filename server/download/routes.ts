import type { Hono } from "hono";

// 客户端安全下载映射表（绑定官方 GitHub Releases 最新稳定包直链）
const CLIENT_DOWNLOAD_MAP: Record<string, { url: string; filename: string }> = {
  "v2rayn-windows": {
    url: "https://github.com/2dust/v2rayN/releases/download/7.16.5/v2rayN-windows-64-desktop.zip",
    filename: "v2rayN-windows-64-desktop.zip",
  },
  "v2rayng-universal": {
    url: "https://github.com/2dust/v2rayNG/releases/download/2.3.10/v2rayNG_2.3.10_universal.apk",
    filename: "v2rayNG_2.3.10_universal.apk",
  },
  "v2rayng-arm64": {
    url: "https://github.com/2dust/v2rayNG/releases/download/2.3.10/v2rayNG_2.3.10_arm64-v8a.apk",
    filename: "v2rayNG_2.3.10_arm64-v8a.apk",
  },
};

export function registerDownloadRoutes(app: Hono<{ Bindings: Record<string, unknown> & { DB: D1Database } }>) {
  app.get("/api/download/:target", async (c) => {
    const targetKey = c.req.param("target");
    const item = CLIENT_DOWNLOAD_MAP[targetKey];

    if (!item) {
      return c.text("Client download target not found", 404);
    }

    // Cloudflare Worker 在海外高速抓取 GitHub 数据流（自动跟随 AWS S3 重定向）
    const upstreamRes = await fetch(item.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      redirect: "follow",
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return c.text(`Upstream fetch failed: ${upstreamRes.status} ${upstreamRes.statusText}`, 502);
    }

    // 透传原生下载响应头，直接将 Stream 导给用户浏览器，避免内存积压
    const headers = new Headers();
    headers.set("Content-Type", upstreamRes.headers.get("content-type") || "application/octet-stream");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    // 强制触发浏览器原生下载对话框
    headers.set("Content-Disposition", `attachment; filename="${item.filename}"`);
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(upstreamRes.body, {
      status: 200,
      headers,
    });
  });
}
