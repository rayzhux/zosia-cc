/**
 * zosia.cc — Cloudflare Worker
 *
 * - Static assets served via the ASSETS binding (Workers Static Assets).
 * - Bot blocker on /pages/* — returns 403 for AI training crawlers.
 * - Adds security + indexing headers to every response.
 */

interface Env {
  ASSETS: Fetcher;
}

const BOT_RE =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|claude-web|CCBot|Bytespider|Google-Extended|FacebookBot|Meta-ExternalAgent|Meta-ExternalFetcher|Amazonbot|Applebot-Extended|PerplexityBot|Cohere-ai|YouBot|Diffbot|Timpibot|AI2Bot|img2dataset|omgili|omgilibot|Scrapy|HTTrack|DataForSeoBot|webzio-extended|PetalBot|Sogou|SemrushBot|AhrefsBot|DotBot|SeekportBot|BLEXBot|MJ12bot|Bytedance)/i;

const BLOCKED_BODY =
  "403 — Access Denied\n\n" +
  "This site does not permit automated crawling or AI training data collection.\n" +
  "See /robots.txt, /ai.txt, and /.well-known/tdmrep.json for our data mining policy.\n";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const isPages = url.pathname === "/pages" || url.pathname.startsWith("/pages/");

    if (isPages && BOT_RE.test(req.headers.get("user-agent") ?? "")) {
      return new Response(BLOCKED_BODY, {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
        },
      });
    }

    const upstream = await env.ASSETS.fetch(req);
    const headers = new Headers(upstream.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    if (isPages) {
      headers.set(
        "X-Robots-Tag",
        "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate"
      );
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
