export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const clientIp =
      request.headers.get("cf-connecting-ip") || "anonymous";
    const userAgent =
      request.headers.get("user-agent") || "unknown";

    const clientId = btoa(clientIp + userAgent).substring(0, 32);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // =====================================================
    // HEALTH CHECK
    // =====================================================
    if (url.pathname === "/api/health") {
      return Response.json(
        {
          status: "ok",
          dbConfigured: !!env.DB,
          geminiConfigured: !!env.GEMINI_API_KEY,
        },
        { headers: corsHeaders }
      );
    }

    // =====================================================
    // CHECK QUOTA
    // =====================================================
    if (
      url.pathname === "/api/check-quota" &&
      request.method === "GET"
    ) {
      try {
        const today = new Date().toISOString().split("T")[0];

        const usage = await env.DB.prepare(
          "SELECT usage_count, last_date FROM user_usage WHERE client_id = ?"
        )
          .bind(clientId)
          .first();

        const count =
          usage && usage.last_date === today
            ? Number(usage.usage_count || 0)
            : 0;

        return Response.json(
          {
            isPro: false,
            remaining: Math.max(0, 5 - count),
          },
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
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
          return Response.json(
            {
              success: false,
              error: "GEMINI_API_KEY belum terpasang di Cloudflare.",
            },
            {
              status: 500,
              headers: corsHeaders,
            }
          );
        }

        const body = await request.json();

        const title = body.title || "Konten";
        const niche = body.niche || "";
        const audience = body.audience || "";
        const goal = body.goal || "";

        // -----------------------------------------------
        // CEK QUOTA
        // -----------------------------------------------

        const today = new Date().toISOString().split("T")[0];

        const usage = await env.DB.prepare(
          "SELECT usage_count, last_date FROM user_usage WHERE client_id = ?"
        )
          .bind(clientId)
          .first();

        let count =
          usage && usage.last_date === today
            ? Number(usage.usage_count || 0)
            : 0;

        if (count >= 5) {
          return Response.json(
            {
              success: false,
              error: "Quota harian sudah habis.",
              remaining: 0,
            },
            {
              status: 429,
              headers: corsHeaders,
            }
          );
        }

        // -----------------------------------------------
        // PROMPT
        // -----------------------------------------------

        const prompt = `
Buatkan konten video pendek berdasarkan data berikut.

Judul: ${title}
Niche: ${niche}
Audiens: ${audience}
Tujuan: ${goal}

Berikan hasil dalam format:

SCRIPT:
Tulis script video pendek yang siap digunakan.

VISUAL:
Tulis visual prompt yang sesuai untuk video vertical 9:16.

Buat singkat, jelas, menarik dan praktis.
`;

        // -----------------------------------------------
        // GEMINI
        // -----------------------------------------------

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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

        if (!geminiRes.ok) {
          return Response.json(
            {
              success: false,
              error:
                geminiData?.error?.message ||
                "Gemini API gagal.",
              status: geminiRes.status,
            },
            {
              status: 502,
              headers: corsHeaders,
            }
          );
        }

        const result =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!result) {
          return Response.json(
            {
              success: false,
              error: "Gemini tidak mengembalikan hasil.",
            },
            {
              status: 502,
              headers: corsHeaders,
            }
          );
        }

        // -----------------------------------------------
        // PISAH SCRIPT DAN VISUAL
        // -----------------------------------------------

        let script = result;
        let visual = "";

        const visualIndex = result
          .toUpperCase()
          .indexOf("VISUAL:");

        if (visualIndex !== -1) {
          script = result.substring(0, visualIndex).trim();
          visual = result.substring(visualIndex + 7).trim();
        }

        // -----------------------------------------------
        // SIMPAN KE TABLE CONTENTS
        // -----------------------------------------------

        const now = Date.now();

        const insertResult = await env.DB.prepare(
          `INSERT INTO contents
          (title, niche, audience, goal, script, visual, stage, created_at, updated_at)
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

        // -----------------------------------------------
        // UPDATE QUOTA
        // -----------------------------------------------

        if (usage && usage.last_date === today) {
          await env.DB.prepare(
            `UPDATE user_usage
             SET usage_count = usage_count + 1
             WHERE client_id = ?`
          )
            .bind(clientId)
            .run();
        } else {
          await env.DB.prepare(
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

        return Response.json(
          {
            success: true,
            saved: true,
            id: insertResult.meta?.last_row_id || null,
            result,
            script,
            visual,
            stage: "IDE",
            remaining: Math.max(0, 5 - count - 1),
          },
          {
            headers: corsHeaders,
          }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }

    // =====================================================
    // QUEUE / ANTREAN
    // =====================================================
    if (
      url.pathname === "/api/queue" &&
      request.method === "GET"
    ) {
      try {
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
           ORDER BY created_at DESC
           LIMIT 100`
        ).all();

        return Response.json(
          result.results || [],
          {
            headers: corsHeaders,
          }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
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
        const body = await request.json();

        const now = Date.now();

        const result = await env.DB.prepare(
          `INSERT INTO contents
          (title, niche, audience, goal, script, visual, stage, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            body.title || "Konten",
            body.niche || "",
            body.audience || "",
            body.goal || "",
            body.script || body.content || "",
            body.visual || "",
            body.stage || "IDE",
            now,
            now
          )
          .run();

        return Response.json(
          {
            success: true,
            id: result.meta?.last_row_id || null,
            message: "Berhasil disimpan",
          },
          {
            headers: corsHeaders,
          }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  },
};
