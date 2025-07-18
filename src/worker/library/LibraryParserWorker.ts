import { parentPort, workerData } from "worker_threads";
import { LibraryParser } from "./LibraryParser.js";
import { LibraryParserConfig } from "./types.js";

export class LibraryParserWorker {
  private parser: LibraryParser;

  constructor() {
    // workerDataから設定を取得
    const config: Partial<LibraryParserConfig> = {};

    if (workerData?.xmlPath) {
      config.xmlPath = workerData.xmlPath;
    }
    if (workerData?.pathPrefix) {
      config.pathPrefix = workerData.pathPrefix;
    }

    this.parser = new LibraryParser(config);
  }

  /**
   * ライブラリ解析を実行
   */
  async run(): Promise<void> {
    try {
      const result = await this.parser.parseLibrary();

      if (parentPort) {
        parentPort.postMessage(result);
      } else {
        console.log("Library parsing completed:", result);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const result = {
        success: false,
        error: errorMsg,
      };

      if (parentPort) {
        parentPort.postMessage(result);
      } else {
        console.error("Library parsing failed:", result);
      }
    }
  }
}
