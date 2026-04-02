import { createApp } from "./server.js";
import {
  initAppState,
  startBackgroundRefresh,
  stopBackgroundRefresh,
} from "./state.js";

async function main() {
  const state = await initAppState();
  const app = createApp();
  const port = state.config.port;

  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`\ngha-dash running at http://localhost:${port}\n`);
  });

  startBackgroundRefresh();

  // Graceful shutdown
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
