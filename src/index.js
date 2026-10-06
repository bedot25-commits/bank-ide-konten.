export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("cf-connecting-ip") || "anonymous";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const clientId = btoa(clientIp + userAgent).substring(0, 32);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. CHECK QUOTA & PRO STATUS
    if (url.pathname === "/api/check-quota" && request.method === "GET") {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        const tokenCheck = await env.DB.prepare(
          "SELECT token FROM pro_tokens WHERE bound_device_id = ? AND is_active = 1"
        ).bind(clientId).first();

        if (tokenCheck) {
          return Response.json({ isPro: true, remaining: 999 }, { headers: corsHeaders });
        }

        let usage = await env.DB.prepare(
          "SELECT * FROM user_usage WHERE client_id = ?"
        ).bind(clientId).first();

        let count = 0;
        if (usage) {
          if (usage.last_date === today) {
            count = usage.usage_count;
          } else {
            await env.DB.prepare(
              "UPDATE user_usage SET usage_count = 0, last_date = ? WHERE client_id = ?"
            ).bind(today, clientId).run();
            count = 0;
          }
        }

        return Response.json({ isPro: false, remaining: Math.max(0, 5 - count) }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. ACTIVATE PRO TOKEN (ANTI-SHARING / DEVICE BINDING)
    if (url.pathname === "/api/activate-token" && request.method === "POST") {
      try {
        const { token } = await request.json();
        if (!token) {
          return Response.json({ success: false, message: "Token tidak boleh kosong!" }, { headers: corsHeaders });
        }

        const tokenData = await env.DB.prepare(
          "SELECT * FROM pro_tokens WHERE token = ? AND is_active = 1"
        ).bind(token.trim()).first();

        if (!tokenData) {
          return Response.json({ success: false, message: "Token tidak valid atau tidak aktif!" }, { headers: corsHeaders });
        }

        if (tokenData.bound_device_id && tokenData.bound_device_id !== clientId) {
          return Response.json({ success: false, message: "Token sudah digunakan di perangkat lain!" }, { headers: corsHeaders });
        }

        if (!tokenData.bound_device_id) {
          await env.DB.prepare(
            "UPDATE pro_tokens SET bound_device_id = ? WHERE token = ?"
          ).bind(clientId, token.trim()).run();
        }

        return Response.json({ success: true, message: "Token Pro berhasil diaktifkan!" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 3. GENERATE CONTENT (AI GEMINI)
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const today = new Date().toISOString().split('T')[0];

        const tokenCheck = await env.DB.prepare(
          "SELECT token FROM pro_tokens WHERE bound_device_id = ? AND is_active = 1"
        ).bind(clientId).first();

        if (!tokenCheck) {
          let usage = await env.DB.prepare(
            "SELECT * FROM user_usage WHERE client_id = ?"
          ).bind(clientId).first();

          let count = 0;
          if (usage) {
            if (usage.last_date === today) {
              count = usage.usage_count;
              if (count >= 5) {
                return Response.json({ error: "Kuota harian habis! Masukkan Token Pro untuk akses tanpa batas." }, { status: 403, headers: corsHeaders });
              }
            } else {
              await env.DB.prepare(
                "UPDATE user_usage SET usage_count = 0, last_date = ? WHERE client_id = ?"
              ).bind(today, clientId).run();
            }
          }
        }

        const body = await request.json();
        const prompt = `Buatkan script video pendek dan visual prompt untuk judul: "${body.title}", niche: "${body.niche}", audiens: "${body.audience}", tujuan: "${body.goal}". Format dengan jelas bagian Script dan Visual Prompt.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const geminiData = await geminiRes.json();
        const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal menghasilkan konten.";

        if (!tokenCheck) {
          let usage = await env.DB.prepare(
            "SELECT * FROM user_usage WHERE client_id = ?"
          ).bind(clientId).first();

          if (usage) {
            if (usage.last_date === today) {
              await env.DB.prepare(
                "UPDATE user_usage SET usage_count = usage_count + 1 WHERE client_id = ?"
              ).bind(clientId).run();
            } else {
              await env.DB.prepare(
                "UPDATE user_usage SET usage_count = 1, last_date = ? WHERE client_id = ?"
              ).bind(today, clientId).run();
            }
          } else {
            await env.DB.prepare(
              "INSERT INTO user_usage (client_id, usage_count, last_date) VALUES (?, 1, ?)"
            ).bind(clientId, today).run();
          }
        }

        return Response.json({ result: textResult }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 4. SAVE CONTENT TO DATABASE
    if (url.pathname === "/api/save" && request.method === "POST") {
      try {
        const body = await request.json();
        const { title, content } = body;
        const today = new Date().toISOString().split('T')[0];

        await env.DB.prepare(
          "INSERT INTO saved_content (title, content, created_at) VALUES (?, ?, ?)"
        ).bind(title || "Tanpa Judul", content || "", today).run();

        return Response.json({ success: true, message: "Data berhasil disimpan!" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
