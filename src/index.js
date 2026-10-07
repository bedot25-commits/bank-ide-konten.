export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // =====================================================
    // HELPER
    // =====================================================

    function json(data, status = 200) {
      return Response.json(data, {
        status,
        headers: corsHeaders,
      });
    }

    function getClientId(request) {
      const ip =
        request.headers.get("cf-connecting-ip") || "anonymous";

      const ua =
        request.headers.get("user-agent") || "unknown";

      return btoa(ip + ua).substring(0, 32);
    }

    // =====================================================
    // HEALTH
    // =====================================================

    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        worker: "bank-ide-konten-v91",
        dbConfigured: !!env.DB,
        geminiConfigured: !!env.GEMINI_API_KEY,
      });
    }

    // =====================================================
    // DATABASE TEST
    // =====================================================

    if (
      url.pathname === "/api/test-db" &&
      request.method === "GET"
    ) {
      try {
        if (!env.DB) {
          return json(
            {
              success: false,
              error: "D1 binding DB belum tersedia.",
            },
            500
          );
        }

        const result = await env.DB
          .prepare("SELECT 1 AS test")
          .first();

        return json({
          success: true,
          database: "connected",
          result,
        });
      } catch (err) {
        return json(
          {
            success: false,
            error: err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // TEST GEMINI
    // =====================================================

    if (
      url.pathname === "/api/test-gemini" &&
      request.method === "GET"
    ) {
      try {
        if (!env.GEMINI_API_KEY) {
          return json(
            {
              success: false,
              step: "SECRET",
              error:
                "GEMINI_API_KEY tidak tersedia di Worker.",
            },
            500
          );
        }

        const model = "gemini-2.5-flash";

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: "Jawab hanya dengan: GEMINI AKTIF",
                    },
                  ],
                },
              ],
            }),
          }
        );

        const geminiData = await geminiRes.json();

        if (!geminiRes.ok) {
          return json(
            {
              success: false,
              step: "GEMINI_API",
              status: geminiRes.status,
              error:
                geminiData?.error?.message ||
                "Gemini API gagal.",
            },
            502
          );
        }

        const result =
          geminiData?.candidates?.[0]?.content?.parts?.[0]
            ?.text || "";

        return json({
          success: true,
          step: "GEMINI_API",
          model,
          result,
        });
      } catch (err) {
        return json(
          {
            success: false,
            step: "WORKER",
            error: err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // CHECK QUOTA
    // =====================================================

    if (
      url.pathname === "/api/check-quota" &&
      request.method === "GET"
    ) {
      try {
        if (!env.DB) {
          return json(
            {
              success: false,
              error: "D1 belum terhubung.",
            },
            500
          );
        }

        const clientId = getClientId(request);

        const today = new Date()
          .toISOString()
          .split("T")[0];

        const usage = await env.DB
          .prepare(
            `SELECT usage_count, last_date
             FROM user_usage
             WHERE client_id = ?`
          )
          .bind(clientId)
          .first();

        const count =
          usage && usage.last_date === today
            ? Number(usage.usage_count || 0)
            : 0;

        return json({
          success: true,
          isPro: false,
          remaining: Math.max(0, 5 - count),
        });
      } catch (err) {
        return json(
          {
            success: false,
            error: err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // GENERATE AI
    // =====================================================

    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        if (!env.GEMINI_API_KEY) {
          return json(
            {
              success: false,
              error:
                "GEMINI_API_KEY belum tersedia di Worker.",
            },
            500
          );
        }

        if (!env.DB) {
          return json(
            {
              success: false,
              error: "D1 binding DB belum tersedia.",
            },
            500
          );
        }

        const body = await request.json();

        const title = body.title || "Konten";
        const niche = body.niche || "";
        const audience = body.audience || "";
        const goal = body.goal || "";

        const clientId = getClientId(request);

        const today = new Date()
          .toISOString()
          .split("T")[0];

        // -------------------------------------------------
        // CEK QUOTA
        // -------------------------------------------------

        const usage = await env.DB
          .prepare(
            `SELECT usage_count, last_date
             FROM user_usage
             WHERE client_id = ?`
          )
          .bind(clientId)
          .first();

        const count =
          usage && usage.last_date === today
            ? Number(usage.usage_count || 0)
            : 0;

        if (count >= 5) {
          return json(
            {
              success: false,
              error: "Quota harian sudah habis.",
              remaining: 0,
            },
            429
          );
        }

        // -------------------------------------------------
        // PROMPT
        // -------------------------------------------------

        const prompt = `
Kamu adalah content strategist dan copywriter.

Buatkan konten video pendek berdasarkan:

Judul: ${title}
Niche: ${niche}
Target audiens: ${audience}
Tujuan: ${goal}

Format jawaban:

SCRIPT:
Buat script video pendek yang siap direkam.
Gunakan bahasa Indonesia yang natural.
Buat hook kuat di awal.
Padat dan mudah dipahami.

VISUAL:
Buat visual prompt untuk video vertical 9:16.
Jelaskan subjek, lokasi, aksi, kamera dan suasana.

Jangan memberikan penjelasan tambahan di luar SCRIPT dan VISUAL.
`;

        // -------------------------------------------------
        // GEMINI
        // -------------------------------------------------

        const model = "gemini-2.5-flash";

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
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
            }),
          }
        );

        const geminiData = await geminiRes.json();

        // -------------------------------------------------
        // ERROR GEMINI DITAMPILKAN JELAS
        // -------------------------------------------------

        if (!geminiRes.ok) {
          return json(
            {
              success: false,
              step: "GEMINI_API",
              status: geminiRes.status,
              error:
                geminiData?.error?.message ||
                "Gemini API gagal.",
            },
            502
          );
        }

        const result =
          geminiData?.candidates?.[0]?.content?.parts?.[0]
            ?.text;

        if (!result) {
          return json(
            {
              success: false,
              step: "GEMINI_RESPONSE",
              error:
                "Gemini tidak mengembalikan teks.",
            },
            502
          );
        }

        // -------------------------------------------------
        // PISAH SCRIPT DAN VISUAL
        // -------------------------------------------------

        let script = result.trim();
        let visual = "";

        const visualIndex = result
          .toUpperCase()
          .indexOf("VISUAL:");

        if (visualIndex !== -1) {
          script = result
            .substring(0, visualIndex)
            .trim();

          visual = result
            .substring(visualIndex + 7)
            .trim();
        }

        // -------------------------------------------------
        // SIMPAN KE CONTENTS
        // -------------------------------------------------

        const now = Date.now();

        const insertResult = await env.DB
          .prepare(
            `INSERT INTO contents
            (
              title,
              niche,
              audience,
              goal,
              script,
              visual,
              stage,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            title,
            niche,
            audience,
            goal,
            script,
            visual,
            "IDE",
            now,
            now
          )
          .run();

        // -------------------------------------------------
        // UPDATE QUOTA
        // -------------------------------------------------

        if (
          usage &&
          usage.last_date === today
        ) {
          await env.DB
            .prepare(
              `UPDATE user_usage
               SET usage_count = usage_count + 1
               WHERE client_id = ?`
            )
            .bind(clientId)
            .run();
        } else {
          await env.DB
            .prepare(
              `INSERT INTO user_usage
              (client_id, usage_count, last_date)
              VALUES (?, 1, ?)
              ON CONFLICT(client_id)
              DO UPDATE SET
                usage_count = 1,
                last_date = excluded.last_date`
            )
            .bind(clientId, today)
            .run();
        }

        return json({
          success: true,
          saved: true,
          id:
            insertResult?.meta?.last_row_id ||
            null,
          result,
          script,
          visual,
          stage: "IDE",
          remaining: Math.max(
            0,
            5 - count - 1
          ),
        });
      } catch (err) {
        return json(
          {
            success: false,
            step: "GENERATE",
            error:
              err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // QUEUE
    // =====================================================

    if (
      url.pathname === "/api/queue" &&
      request.method === "GET"
    ) {
      try {
        if (!env.DB) {
          return json(
            {
              success: false,
              error: "D1 belum terhubung.",
            },
            500
          );
        }

        const result = await env.DB
          .prepare(
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
             ORDER BY created_at DESC
             LIMIT 100`
          )
          .all();

        return json({
          success: true,
          data: result.results || [],
        });
      } catch (err) {
        return json(
          {
            success: false,
            error:
              err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // SAVE MANUAL
    // =====================================================

    if (
      url.pathname === "/api/save" &&
      request.method === "POST"
    ) {
      try {
        if (!env.DB) {
          return json(
            {
              success: false,
              error: "D1 belum terhubung.",
            },
            500
          );
        }

        const body = await request.json();

        const now = Date.now();

        const result = await env.DB
          .prepare(
            `INSERT INTO contents
            (
              title,
              niche,
              audience,
              goal,
              script,
              visual,
              stage,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            body.title || "Konten",
            body.niche || "",
            body.audience || "",
            body.goal || "",
            body.script ||
              body.content ||
              "",
            body.visual || "",
            body.stage || "IDE",
            now,
            now
          )
          .run();

        return json({
          success: true,
          id:
            result?.meta?.last_row_id ||
            null,
          message: "Berhasil disimpan",
        });
      } catch (err) {
        return json(
          {
            success: false,
            step: "SAVE",
            error:
              err?.message || String(err),
          },
          500
        );
      }
    }

    // =====================================================
    // 404
    // =====================================================

    return new Response(
      "WORKER V9.1 AKTIF",
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  },
};
