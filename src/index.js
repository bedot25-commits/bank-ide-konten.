export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        dbConfigured: !!env.DB,
        geminiConfigured: !!env.GEMINI_API_KEY
      });
    }

    return new Response("WORKER V9.1 AKTIF");
  }
};
