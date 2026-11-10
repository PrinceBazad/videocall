import { defineConfig, loadEnv } from "vite";
import tokenHandler from "./api/token.js";

function localTokenEndpoint() {
  return {
    name: "orbit-local-token-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/token", async (req, res) => {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "The request is too large." }));
            return;
          }
        }

        try {
          req.body = body ? JSON.parse(body) : undefined;
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Send valid JSON to request a room token." }));
          return;
        }

        res.status = (status) => {
          res.statusCode = status;
          return res;
        };
        res.json = (payload) => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(payload));
        };
        await tokenHandler(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return { plugins: [localTokenEndpoint()] };
});
