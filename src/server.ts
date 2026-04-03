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

  // Vue SPA — serve built client assets and fallback to index.html.
  // Check for assets/ subdir to distinguish built output from src/client/.
  const clientDir = join(__dirname, "client");
  if (existsSync(join(clientDir, "assets"))) {
    app.use(express.static(clientDir));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(join(clientDir, "index.html"));
    });
  } else {
    // Dev mode: no built SPA
    app.get("/", (_req, res) => {
      res.type("text").send("Run 'npm run dev' to start both Express and Vite, then open http://localhost:5173");
    });
  }

  return app;
}
