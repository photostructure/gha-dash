import { exec } from "node:child_process";
import { createApp } from "./server.js";
import {
  initAppState,
  startBackgroundRefresh,
  stopBackgroundRefresh,
} from "./state.js";

function parseArgs(): { port?: number; open: boolean } {
  const args = process.argv.slice(2);
  let port: number | undefined;
  let open = true;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
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
