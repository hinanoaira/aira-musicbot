import { DiscordPlayWorker } from "./DiscordPlayWorker.js";

// ワーカーの実行
const worker = new DiscordPlayWorker();

worker.initialize().catch((error) => {
  console.error("Failed to initialize Discord play worker:", error);
  process.exit(1);
});
