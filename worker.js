export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Servir los activos estáticos del directorio ./frontend en Cloudflare Workers
    if (env && env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        return response;
      }
      // Fallback SPA a index.html para rutas de navegación
      if (!url.pathname.startsWith("/api/")) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }
    }

    return new Response(
      JSON.stringify({ status: "edge_fallback", path: url.pathname }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
