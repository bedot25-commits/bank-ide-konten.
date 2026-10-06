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

    // CHECK QUOTA
    if (
      url.pathname === "/api/check-quota" &&
      request.method === "GET"
    ) {
      try {
        const today = new Date().toISOString().split("T")[0];

        const tokenCheck = await env.DB.prepare(
          "SELECT token FROM pro_tokens WHERE bound_device_id = ? AND is_active = 1"
        ).bind(clientId).first();

        if (tokenCheck) {
          return Response.json(
            { isPro: true, remaining: 999 },
            { headers: corsHeaders }
          );
        }

        const usage = await env.DB.prepare(
          "SELECT * FROM user_usage WHERE client_id = ?"
        ).bind(clientId).first();

        const count =
          usage && usage.last_date === today
            ? usage.usage_count
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
          { error: err.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // GENERATE AI
    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const title = body.title || "Konten";
        const niche = body.niche || "";
        const audience = body.audience || "";
        const goal = body.goal || "";

        const prompt = `
Buatkan script video pendek dan visual prompt.

Judul: "${title}"
Niche: "${niche}"
Audiens: "${audience}"
Tujuan: "${goal}"

Buat hasil yang jelas, praktis dan siap digunakan.
`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
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
            }),
          }
        );

        const geminiData = await geminiRes.json();

        const result =
          geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!result) {
          return Response.json(
            {
              success: false,
              error:
                geminiData.error?.message ||
                "Gemini tidak menghasilkan data.",
            },
            { status: 500, headers: corsHeaders }
          );
        }

        // SIMPAN HASIL GENERATE
        const contentData = {
          title,
          niche,
          audience,
          goal,
          result,
          clientId,
        };

        await env.DB.prepare(
          "INSERT INTO saved_content (title, content, created_at) VALUES (?, ?, ?)"
        )
          .bind(
            title,
            JSON.stringify(contentData),
            new Date().toISOString()
          )
          .run();

        return Response.json(
          {
            success: true,
            saved: true,
            result,
          },
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // AMBIL DATA ANTREAN
    if (
      url.pathname === "/api/queue" &&
      request.method === "GET"
    ) {
      try {
        const result = await env.DB.prepare(
          "SELECT * FROM saved_content ORDER BY created_at DESC LIMIT 100"
        ).all();

        return Response.json(
          result.results || [],
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // SIMPAN MANUAL
    if (
      url.pathname === "/api/save" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        await env.DB.prepare(
          "INSERT INTO saved_content (title, content, created_at) VALUES (?, ?, ?)"
        )
          .bind(
            body.title || "Konten",
            JSON.stringify(body),
            new Date().toISOString()
          )
          .run();

        return Response.json(
          {
            success: true,
            message: "Berhasil disimpan",
          },
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  },
};
