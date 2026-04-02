import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { dashboardRoutes } from "./routes/dashboard.js";
import { settingsRoutes } from "./routes/settings.js";
import { dispatchRoutes } from "./routes/dispatch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  // EJS setup
  app.set("view engine", "ejs");
  app.set("views", join(__dirname, "views"));

  // Static files
  app.use(express.static(join(__dirname, "public")));

  // Body parsing for settings form
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use("/", dashboardRoutes());
  app.use("/", settingsRoutes());
  app.use("/", dispatchRoutes());

  return app;
}
