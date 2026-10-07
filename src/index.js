export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Endpoint untuk Generate AI
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const body = await request.json();
        const prompt = `Buatkan script video pendek dan visual prompt untuk judul: "${body.title}", niche: "${body.niche}".`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const geminiData = await geminiRes.json();
        const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal mendapatkan respons AI.";
        
        return Response.json({ result: textResult }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Endpoint untuk Save / Queue (Tombol Simpan)
    if (url.pathname === "/api/queue" || url.pathname === "/api/save") {
      if (request.method === "GET") return Response.json([], { headers: corsHeaders });
      if (request.method === "POST") return Response.json({ success: true, message: "Berhasil disimpan" }, { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
