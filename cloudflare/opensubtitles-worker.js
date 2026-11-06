/**
 * Perde — OpenSubtitles proxy
 * Deploy this file as the Cloudflare Worker entry point.
 *
 * Required Worker secret:
 *   OPENSUBTITLES_API_KEY
 *
 * Allowed browser origin:
 *   https://megamrtklc.github.io
 */
const API_BASE = "https://api.opensubtitles.com/api/v1";
const ALLOWED_ORIGIN = "https://megamrtklc.github.io";
const USER_AGENT = "PerdeSubtitleSearch v1.0";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function errorMessage(status, body) {
  if (status === 401 || status === 403) {
    return "OpenSubtitles erişimi reddetti. API anahtarını ve uygulama User-Agent ayarını kontrol edin.";
  }
  if (status === 429) return "OpenSubtitles istek sınırına ulaşıldı. Bir süre sonra tekrar deneyin.";
  return (body && (body.message || body.error)) || "OpenSubtitles isteği başarısız oldu.";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Bu kaynağa izin verilmiyor." }, 403, origin);
    }

    if (!env.OPENSUBTITLES_API_KEY) {
      return json({ error: "Worker üzerinde OPENSUBTITLES_API_KEY Secret tanımlı değil." }, 500, origin);
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "perde-subtitles" }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/subtitles") {
      const allowed = [
        "query", "imdb_id", "tmdb_id", "type", "languages",
        "parent_imdb_id", "parent_tmdb_id", "season_number",
        "episode_number", "year", "page", "order_by"
      ];
      const params = new URLSearchParams();
      for (const key of allowed) {
        const value = url.searchParams.get(key);
        if (value && value.length <= 160) params.set(key, value);
      }
      if (!params.has("query") && !params.has("imdb_id") && !params.has("tmdb_id") &&
          !params.has("parent_imdb_id") && !params.has("parent_tmdb_id")) {
        return json({ error: "Arama için başlık veya IMDb/TMDB kimliği gerekli." }, 400, origin);
      }
      if (!params.has("languages")) params.set("languages", "tr,en");
      const upstream = await fetch(API_BASE + "/subtitles?" + params.toString(), {
        headers: {
          "Api-Key": env.OPENSUBTITLES_API_KEY,
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return json({ error: errorMessage(upstream.status, body), upstream_status: upstream.status }, upstream.status, origin);

      const data = Array.isArray(body.data) ? body.data : [];
      data.sort((a, b) => {
        const langA = a.attributes?.language === "tr" ? 0 : 1;
        const langB = b.attributes?.language === "tr" ? 0 : 1;
        if (langA !== langB) return langA - langB;
        return (Number(b.attributes?.download_count) || 0) - (Number(a.attributes?.download_count) || 0);
      });
      return json({ ...body, data }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/download") {
      let input;
      try { input = await request.json(); } catch { return json({ error: "Geçersiz JSON." }, 400, origin); }
      const fileId = Number(input && input.file_id);
      if (!Number.isSafeInteger(fileId) || fileId <= 0) {
        return json({ error: "Geçerli bir file_id gerekli." }, 400, origin);
      }

      const upstream = await fetch(API_BASE + "/download", {
        method: "POST",
        headers: {
          "Api-Key": env.OPENSUBTITLES_API_KEY,
          "User-Agent": USER_AGENT,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ file_id: fileId, sub_format: "srt" })
      });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return json({ error: errorMessage(upstream.status, body), upstream_status: upstream.status }, upstream.status, origin);
      if (!body.link || typeof body.link !== "string" || !body.link.startsWith("https://")) {
        return json({ error: "OpenSubtitles geçerli bir altyazı indirme bağlantısı döndürmedi." }, 502, origin);
      }

      const fileResponse = await fetch(body.link, { redirect: "follow" });
      if (!fileResponse.ok) return json({ error: "Altyazı dosyası indirilemedi." }, 502, origin);
      const fileText = await fileResponse.text();
      if (!fileText || fileText.length > 2_000_000) {
        return json({ error: "Altyazı dosyası boş veya izin verilen boyuttan büyük." }, 502, origin);
      }
      return new Response(fileText, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="perde-subtitle.srt"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    return json({ error: "Bulunamadı. Kullanılabilir yollar: /health, /subtitles, /download" }, 404, origin);
  }
};
