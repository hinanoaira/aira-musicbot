import { LibraryParserWorker } from "./LibraryParserWorker.js";

// ライブラリパーサーワーカーの実行
const worker = new LibraryParserWorker();

worker.run().catch((error) => {
  console.error("Failed to run library parser worker:", error);
  process.exit(1);
});
