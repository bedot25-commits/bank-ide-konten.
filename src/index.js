const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=UTF-8",
};

const FREE_LIMIT = 5;
const GEMINI_MODEL = "gemini-2.5-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS,
  });
}

async function getProStatus(env, proToken) {
  if (!proToken) {
    return {
      isPro: false,
      token: "",
    };
  }

  const row = await env.DB.prepare(
    `SELECT token, is_active
     FROM pro_tokens
     WHERE token = ?
     LIMIT 1`
  ).bind(proToken).first();

  if (row && Number(row.is_active) === 1) {
    return {
      isPro: true,
      token: row.token,
    };
  }

  return {
    isPro: false,
    token: "",
  };
}

async function getUsage(env, clientId) {
  const today = new Date().toISOString().slice(0, 10);

  let row = await env.DB.prepare(
    `SELECT client_id, usage_count, last_date
     FROM user_usage
     WHERE client_id = ?
     LIMIT 1`
  ).bind(clientId).first();

  if (!row) {
    await env.DB.prepare(
      `INSERT INTO user_usage (client_id, usage_count, last_date)
       VALUES (?, 0, ?)`
    ).bind(clientId, today).run();

    return {
      count: 0,
      remaining: FREE_LIMIT,
      today,
    };
  }

  if (row.last_date !== today) {
    await env.DB.prepare(
      `UPDATE user_usage
       SET usage_count = 0, last_date = ?
       WHERE client_id = ?`
    ).bind(today, clientId).run();

    return {
      count: 0,
      remaining: FREE_LIMIT,
      today,
    };
  }

  const count = Number(row.usage_count || 0);

  return {
    count,
    remaining: Math.max(0, FREE_LIMIT - count),
    today,
  };
}

async function consumeUsage(env, clientId) {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await env.DB.prepare(
    `SELECT usage_count, last_date
     FROM user_usage
     WHERE client_id = ?
     LIMIT 1`
  ).bind(clientId).first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO user_usage (client_id, usage_count, last_date)
       VALUES (?, 1, ?)`
    ).bind(clientId, today).run();

    return 1;
  }

  if (existing.last_date !== today) {
    await env.DB.prepare(
      `UPDATE user_usage
       SET usage_count = 1, last_date = ?
       WHERE client_id = ?`
    ).bind(today, clientId).run();

    return 1;
  }

  const nextCount = Number(existing.usage_count || 0) + 1;

  await env.DB.prepare(
    `UPDATE user_usage
     SET usage_count = ?, last_date = ?
     WHERE client_id = ?`
  ).bind(nextCount, today, clientId).run();

  return nextCount;
}

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || ""
  );
}

function parseAIResult(text) {
  if (!text) {
    return {
      script: "",
      visual: "",
    };
  }

  // Bersihkan markdown code fence bila Gemini mengirim ```json ... ```
  let cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    return {
      script: parsed.script || "",
      visual: parsed.visual || "",
    };
  } catch (_) {
    // Fallback kalau Gemini tidak mengikuti JSON
    return {
      script: cleaned,
      visual: "",
    };
  }
}

async function generateWithGemini(env, input) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum terpasang di Cloudflare Worker.");
  }

  const prompt = `
Kamu adalah AI Content Factory untuk bank.ide.konten.

Buat konten video pendek berdasarkan data berikut:

Judul/Ide: ${input.title}
Niche: ${input.niche || "Umum"}
Target Audiens: ${input.audience || "Umum"}
Tujuan: ${input.goal || "Edukasi"}

Tugas:

1. Buat SCRIPT video pendek yang padat, natural, mudah dibawakan creator Indonesia.
2. Buat VISUAL PROMPT untuk video vertikal 9:16.
3. Fokus pada hook kuat di awal, value cepat, dan CTA yang relevan.
4. Jangan membuat penjelasan tambahan di luar hasil.
5. Jawaban WAJIB JSON valid dengan format:

{
  "script": "isi script lengkap",
  "visual": "isi visual prompt lengkap"
}

Jangan gunakan markdown code block.
`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API error (${response.status})`;

    throw new Error(message);
  }

  const text = extractGeminiText(data);

  if (!text) {
    throw new Error("Gemini tidak mengembalikan hasil.");
  }

  return parseAIResult(text);
}

async function handleGenerate(request, env) {
  let body;

  try {
    body = await request.json();
  } catch (_) {
    return json(
      {
        error: "INVALID_JSON",
        message: "Data request tidak valid.",
      },
      400
    );
  }

  const title = String(body.title || "").trim();
  const niche = String(body.niche || "").trim();
  const audience = String(body.audience || "").trim();
  const goal = String(body.goal || "").trim();
  const clientId = String(body.clientId || "").trim();
  const proToken = String(body.proToken || "").trim();

  if (!title) {
    return json(
      {
        error: "TITLE_REQUIRED",
        message: "Judul / ide wajib diisi.",
      },
      400
    );
  }

  if (!clientId) {
    return json(
      {
        error: "CLIENT_ID_REQUIRED",
        message: "Client ID tidak ditemukan.",
      },
      400
    );
  }

  try {
    const pro = await getProStatus(env, proToken);

    let usage = {
      count: 0,
      remaining: "unlimited",
    };

    if (!pro.isPro) {
      usage = await getUsage(env, clientId);

      if (usage.count >= FREE_LIMIT) {
        return json(
          {
            error: "QUOTA_EXCEEDED",
            message:
              "Jatah 5 ide gratis hari ini sudah habis! Masukkan Token Pro atau tunggu sampai besok.",
            isPro: false,
            usageCount: usage.count,
            remaining: 0,
          },
          429
        );
      }
    }

    const result = await generateWithGemini(env, {
      title,
      niche,
      audience,
      goal,
    });

    // Kuota hanya dipotong setelah Gemini berhasil.
    if (!pro.isPro) {
      const newCount = await consumeUsage(env, clientId);

      usage = {
        count: newCount,
        remaining: Math.max(0, FREE_LIMIT - newCount),
      };
    }

    return json({
      success: true,
      script: result.script,
      visual: result.visual,
      isPro: pro.isPro,
      usageCount: pro.isPro ? null : usage.count,
      remaining: pro.isPro ? "unlimited" : usage.remaining,
    });
  } catch (error) {
    return json(
      {
        error: "GEMINI_ERROR",
        message: error?.message || "Gagal mendapatkan respons AI.",
      },
      500
    );
  }
}

async function handleContents(request, env) {
  if (request.method === "GET") {
    const result = await env.DB.prepare(
      `SELECT
        id,
        title,
        niche,
        audience,
        goal,
        script,
        visual,
        stage,
        created_at,
        updated_at
       FROM contents
       ORDER BY id DESC`
    ).all();

    // app.js membutuhkan ARRAY langsung.
    return json(result.results || []);
  }

  if (request.method === "POST") {
    let body;

    try {
      body = await request.json();
    } catch (_) {
      return json(
        {
          error: "INVALID_JSON",
          message: "Data tidak valid.",
        },
        400
      );
    }

    const title = String(body.title || "").trim();
    const niche = String(body.niche || "").trim();
    const audience = String(body.audience || "").trim();
    const goal = String(body.goal || "").trim();
    const script = String(body.script || "");
    const visual = String(body.visual || "");

    if (!title) {
      return json(
        {
          error: "TITLE_REQUIRED",
          message: "Judul wajib diisi.",
        },
        400
      );
    }

    const now = Date.now();

    const result = await env.DB.prepare(
      `INSERT INTO contents
       (title, niche, audience, goal, script, visual, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'IDE', ?, ?)`
    )
      .bind(
        title,
        niche,
        audience,
        goal,
        script,
        visual,
        now,
        now
      )
      .run();

    return json({
      success: true,
      id: result.meta?.last_row_id || null,
      message: "Berhasil disimpan ke database online.",
    });
  }

  return json(
    {
      error: "METHOD_NOT_ALLOWED",
    },
    405
  );
}

async function handleHealth(env) {
  let db = false;

  try {
    await env.DB.prepare("SELECT 1").first();
    db = true;
  } catch (_) {}

  return json({
    status: "ok",
    worker: "bank-ide-konten-v91",
    databaseConfigured: !!env.DB,
    databaseOnline: db,
    geminiConfigured: !!env.GEMINI_API_KEY,
    model: GEMINI_MODEL,
  });
}

async function handleTestGemini(env) {
  if (!env.GEMINI_API_KEY) {
    return json(
      {
        success: false,
        error: "GEMINI_API_KEY belum terpasang.",
      },
      500
    );
  }

  try {
    const result = await generateWithGemini(env, {
      title: "Tes koneksi Gemini",
      niche: "Content Creator",
      audience: "Creator Indonesia",
      goal: "Edukasi",
    });

    return json({
      success: true,
      model: GEMINI_MODEL,
      script: result.script,
      visual: result.visual,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || "Gemini test gagal.",
      },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS,
      });
    }

    try {
      // =========================
      // API ROUTES
      // =========================

      if (url.pathname === "/api/health") {
        return await handleHealth(env);
      }

      if (url.pathname === "/api/test-gemini") {
        return await handleTestGemini(env);
      }

      if (
        url.pathname === "/api/generate" &&
        request.method === "POST"
      ) {
        return await handleGenerate(request, env);
      }

      if (url.pathname === "/api/contents") {
        return await handleContents(request, env);
      }

      // =========================
      // STATIC ASSETS
      // =========================

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("WORKER V9.1 AKTIF", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
      });
    } catch (error) {
      return json(
        {
          error: "WORKER_ERROR",
          message: error?.message || "Internal Worker Error",
        },
        500
      );
    }
  },
};
