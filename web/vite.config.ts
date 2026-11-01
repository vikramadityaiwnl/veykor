import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "host-configuration-access",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? "/", "http://localhost")
            .pathname;

          if (
            (pathname === "/api/configuration" ||
              pathname.startsWith("/api/configuration/")) &&
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              request.socket.remoteAddress ?? "",
            )
          ) {
            response.writeHead(403, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            response.end(
              JSON.stringify({
                error: "Configuration is available only on the server host.",
              }),
            );
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
