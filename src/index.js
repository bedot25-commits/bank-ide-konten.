export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. ENDPOINT: GET /api/contents (Mengambil antrean konten)
    if (url.pathname === "/api/contents" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM contents ORDER BY updated_at DESC"
        ).all();
        return Response.json(results, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. ENDPOINT: POST /api/generate (Generate AI + Sistem Kuota 5x / Hari + Token Pro)
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const body = await request.json();
        const { title, niche, audience, goal, clientId, proToken } = body;

        // Cek apakah menggunakan Token Pro yang valid
        let isPro = false;
        if (proToken) {
          const tokenCheck = await env.DB.prepare(
            "SELECT * FROM pro_tokens WHERE token = ? AND is_active = 1"
          ).bind(proToken).first();
          if (tokenCheck) {
            isPro = true;
          }
        }

        // Jika bukan Pro, jalankan sistem kuota harian (5x / hari)
        const todayStr = new Date().toISOString().split('T')[0];
        if (!isPro) {
          if (!clientId) {
            return Response.json({ error: "Client ID tidak ditemukan." }, { status: 400, headers: corsHeaders });
          }

          // Cek data usage client ini
          let usage = await env.DB.prepare(
            "SELECT * FROM user_usage WHERE client_id = ?"
          ).bind(clientId).first();

          if (!usage) {
            // Belum ada, buat baru
            await env.DB.prepare(
              "INSERT INTO user_usage (client_id, usage_count, last_date) VALUES (?, 0, ?)"
            ).bind(clientId, todayStr).run();
            usage = { usage_count: 0, last_date: todayStr };
          }

          // Jika sudah ganti hari, reset hitungan jadi 0
          if (usage.last_date !== todayStr) {
            await env.DB.prepare(
              "UPDATE user_usage SET usage_count = 0, last_date = ? WHERE client_id = ?"
            ).bind(todayStr, clientId).run();
            usage.usage_count = 0;
          }

          // Batasi maksimal 5 kali sehari
          if (usage.usage_count >= 5) {
            return Response.json({ 
              error: "QUOTA_EXCEEDED", 
              message: "Jatah 5 ide gratis hari ini sudah habis! Masukkan Token Pro atau tunggu besok." 
            }, { status: 429, headers: corsHeaders });
          }
        }

        // Panggil Gemini API untuk generate script & visual prompt
        const geminiApiKey = env.GEMINI_API_KEY;
        if (!geminiApiKey) {
          return Response.json({ error: "Gemini API key belum diset di Cloudflare Worker." }, { status: 500, headers: corsHeaders });
        }

        const promptText = `Buatkan draf script video pendek (TikTok/Reels) dan visual prompt berdasarkan data berikut:
Judul/Topik: ${title}
Niche: ${niche}
Target Audiens: ${audience}
Tujuan Konten: ${goal}

Format output JSON murni tanpa markdown lain:
{
  "script": "isi naskah video...",
  "visual": "deskripsi visual prompt..."
}`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // Bersihkan format markdown json jika ada
        const cleanJsonStr = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        let parsedResult;
        try {
          parsedResult = JSON.parse(cleanJsonStr);
        } catch (e) {
          parsedResult = { script: rawText, visual: "Gagal parsing format visual." };
        }

        // Jika bukan Pro, tambahkan kuota pemakaian harian setelah sukses generate
        if (!isPro && clientId) {
          await env.DB.prepare(
            "UPDATE user_usage SET usage_count = usage_count + 1 WHERE client_id = ?"
          ).bind(clientId).run();
        }

        return Response.json({
          script: parsedResult.script,
          visual: parsedResult.visual,
          isPro: isPro
        }, { headers: corsHeaders });

      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
