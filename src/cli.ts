import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { createApp } from "./server.js";
import {
  initAppState,
  startBackgroundRefresh,
  stopBackgroundRefresh,
} from "./state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  // In production (dist/), package.json is one level up
  for (const dir of [__dirname, join(__dirname, "..")]) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      return pkg.version;
    } catch {
      // try next
    }
  }
  return "unknown";
}

function parseArgs(): { port?: number; open: boolean } {
  const args = process.argv.slice(2);
  let port: number | undefined;
  let open = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      console.log(`gha-dash v${getVersion()} — GitHub Actions dashboard

Usage: gha-dash [options]

Options:
  -p, --port N   Server port (default: 3131, configurable in settings)
      --no-open  Don't auto-open browser
  -h, --help     Show this help
  -v, --version  Show version`);
      process.exit(0);
    } else if (args[i] === "--version" || args[i] === "-v") {
      console.log(getVersion());
      process.exit(0);
    } else if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--no-open") {
      open = false;
    }
  }

  return { port, open };
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${cmd} ${url}`, () => {
    // Ignore errors — browser open is best-effort
  });
}

async function main() {
  const flags = parseArgs();
  const state = await initAppState();
  const app = createApp();
  const port = flags.port ?? state.config.port;

  const server = app.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.log(`\ngha-dash running at ${url}\n`);
    if (flags.open) openBrowser(url);
  });

  startBackgroundRefresh();

  const shutdown = () => {
    console.log("\nShutting down...");
    stopBackgroundRefresh();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
