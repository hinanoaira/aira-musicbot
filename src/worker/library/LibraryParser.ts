/**
 * 音楽ライブラリのパースを行うメインクラスです。
 * iTunes Music Library.xml ファイルを読み込み、
 * トラック情報を処理してライブラリデータを生成します。
 */

import path from "path";
import { fileURLToPath } from "url";
import { LibraryData } from "../../types/index.js";
import { XmlParser } from "./parsers/XmlParser.js";
import { TrackProcessor } from "./processors/TrackProcessor.js";
import { LibraryParseResult, LibraryParserConfig } from "./types.js";
import { PathConverter } from "./utils/PathConverter.js";

export class LibraryParser {
  private config: LibraryParserConfig;
  private xmlParser: XmlParser;
  private trackProcessor: TrackProcessor;

  constructor(config?: Partial<LibraryParserConfig>) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const defaultXmlPath = path.join(__dirname, "../../../iTunes Music Library.xml");
    const defaultPathPrefix = PathConverter.getDefaultPathPrefix();

    this.config = {
      xmlPath: config?.xmlPath || defaultXmlPath,
      pathPrefix: config?.pathPrefix || defaultPathPrefix,
    };

    this.xmlParser = new XmlParser(this.config.xmlPath);
    const pathConverter = new PathConverter(this.config.pathPrefix);
    this.trackProcessor = new TrackProcessor(pathConverter);
  }

  async parseLibrary(): Promise<LibraryParseResult> {
    try {
      this.xmlParser.validateXmlFile();
      const allTracks = this.xmlParser.parseXml();
      const validTracks = this.trackProcessor.processValidTracks(allTracks);
      const artistMap = this.trackProcessor.createArtistMap(validTracks);
      this.trackProcessor.sortArtistMap(artistMap);

      const result: LibraryData = {
        allTracksCount: validTracks.length,
        artistMap,
      };

      return { success: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): LibraryParserConfig {
    return { ...this.config };
  }

  /**
   * 設定を更新
   */
  updateConfig(newConfig: Partial<LibraryParserConfig>): void {
    this.config = { ...this.config, ...newConfig };

    this.xmlParser = new XmlParser(this.config.xmlPath);
    const pathConverter = new PathConverter(this.config.pathPrefix);
    this.trackProcessor = new TrackProcessor(pathConverter);
  }
}
