export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("cf-connecting-ip") || "anonymous";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const clientId = btoa(clientIp + userAgent).substring(0, 32);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. CHECK QUOTA
    if (url.pathname === "/api/check-quota" && request.method === "GET") {
      try {
        const today = new Date().toISOString().split('T')[0];
        const tokenCheck = await env.DB.prepare("SELECT token FROM pro_tokens WHERE bound_device_id = ? AND is_active = 1").bind(clientId).first();
        if (tokenCheck) return Response.json({ isPro: true, remaining: 999 }, { headers: corsHeaders });

        let usage = await env.DB.prepare("SELECT * FROM user_usage WHERE client_id = ?").bind(clientId).first();
        let count = 0;
        if (usage) {
          if (usage.last_date === today) { count = usage.usage_count; } 
          else { await env.DB.prepare("UPDATE user_usage SET usage_count = 0, last_date = ? WHERE client_id = ?").bind(today, clientId).run(); }
        }
        return Response.json({ isPro: false, remaining: Math.max(0, 5 - count) }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. ACTIVATE PRO TOKEN
    if (url.pathname === "/api/activate-token" && request.method === "POST") {
      try {
        const { token } = await request.json();
        const tokenData = await env.DB.prepare("SELECT * FROM pro_tokens WHERE token = ? AND is_active = 1").bind(token.trim()).first();
        if (!tokenData) return Response.json({ success: false, message: "Token tidak valid!" }, { headers: corsHeaders });
        
        if (!tokenData.bound_device_id) {
          await env.DB.prepare("UPDATE pro_tokens SET bound_device_id = ? WHERE token = ?").bind(clientId, token.trim()).run();
        }
        return Response.json({ success: true, message: "Token Pro aktif!" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 3. GENERATE CONTENT (AI GEMINI)
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const today = new Date().toISOString().split('T')[0];
        const body = await request.json();
        const prompt = `Buatkan script video pendek dan visual prompt untuk judul: "${body.title}", niche: "${body.niche}", audiens: "${body.audience}", tujuan: "${body.goal}". Format dengan jelas.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const geminiData = await geminiRes.json();
        return Response.json({ result: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal." }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 4. SAVE DATA (Menangkap semua jalur penyimpanan dari frontend)
    if ((url.pathname === "/api/save" || url.pathname === "/api/queue" || url.pathname === "/api/add") && request.method === "POST") {
      try {
        const body = await request.json();
        const title = body.title || "Konten Baru AI";
        const status = "Tersimpan";
        const today = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO production_queue (title, status, created_at) VALUES (?, ?, ?)"
        ).bind(title, status, today).run();

        return Response.json({ success: true, message: "Data berhasil disimpan!" }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
