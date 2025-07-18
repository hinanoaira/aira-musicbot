import fs from "fs";
import plist from "plist";
import { TrackInfo } from "../../../types/index.js";

export class XmlParser {
  private xmlPath: string;

  constructor(xmlPath: string) {
    this.xmlPath = xmlPath;
  }

  /**
   * iTunes Music Library.xml を読み込んでパース
   */
  parseXml(): TrackInfo[] {
    try {
      const rawXml = fs.readFileSync(this.xmlPath, "utf-8");
      const parsed = plist.parse(rawXml) as { Tracks?: { [id: string]: TrackInfo } };
      const trackDict: { [id: string]: TrackInfo } = parsed.Tracks || {};

      return Object.values(trackDict);
    } catch (error) {
      throw new Error(
        `Failed to parse XML file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * XMLファイルの存在確認
   */
  validateXmlFile(): void {
    if (!fs.existsSync(this.xmlPath)) {
      throw new Error(`XML file not found: ${this.xmlPath}`);
    }
  }
}
