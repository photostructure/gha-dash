import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { apiRoutes } from "./routes/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  // Static files (legacy CSS — also served by Vue's public/ in dev)
  app.use(express.static(join(__dirname, "public")));

  // Body parsing
  app.use(express.json());

  // API routes
  app.use("/api", apiRoutes());

  // Vue SPA — serve built client assets and fallback to index.html
  const clientDir = join(__dirname, "client");
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(join(clientDir, "index.html"));
    });
  }

  return app;
}
