/**
 * 音楽ライブラリの管理を行うサービスです。
 * iTunes Music Library.xml ファイルの監視、パース、
 * およびライブラリデータの提供を行います。
 */

import { Worker } from "worker_threads";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LibraryData } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let libraryData: LibraryData = {
  allTracksCount: 0,
  artistMap: {},
};

function parseLibraryInWorker(xmlPath: string): Promise<LibraryData> {
  return new Promise((resolve, reject) => {
    const isDevelopment = process.env.NODE_ENV === "development";

    const tsWorkerFile = path.join(__dirname, "../worker/library/index.ts");
    const jsWorkerFile = path.join(__dirname, "../worker/library/index.js");

    let workerFile: string;
    if (isDevelopment && fs.existsSync(tsWorkerFile)) {
      workerFile = tsWorkerFile;
    } else if (fs.existsSync(jsWorkerFile)) {
      workerFile = jsWorkerFile;
    } else {
      reject(new Error(`Worker file not found. Checked: ${tsWorkerFile}, ${jsWorkerFile}`));
      return;
    }

    const worker = new Worker(workerFile, {
      workerData: { xmlPath },
    });
    worker.on("message", (msg) => {
      if (msg.success) {
        worker.terminate();
        resolve(msg.data as LibraryData);
      } else {
        worker.terminate();
        reject(new Error(msg.error));
      }
    });

    worker.on("error", (err) => {
      worker.terminate();
      reject(err);
    });
  });
}

async function loadLibraryDataAsync(xmlPath: string) {
  console.log("[Library] Parsing in worker...");
  try {
    const result = await parseLibraryInWorker(xmlPath);
    libraryData = result;
    console.log("[Library] Updated library data. allTracksCount =", libraryData.allTracksCount);
  } catch (err) {
    console.error("[Library] Parse failed:", err);
  }
}

export function watchLibraryFile(xmlPath: string) {
  void loadLibraryDataAsync(xmlPath);

  fs.watchFile(xmlPath, { interval: 2000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log("[Library] Detected update => Worker parse...");
      void loadLibraryDataAsync(xmlPath);
    }
  });
}

export function getLibraryData(): LibraryData {
  return libraryData;
}
