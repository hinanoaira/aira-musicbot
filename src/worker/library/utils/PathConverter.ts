import { TrackInfo } from "../../../types/index.js";

export class PathConverter {
  private pathPrefix: string;

  constructor(pathPrefix: string) {
    this.pathPrefix = pathPrefix;
  }

  /**
   * Location -> 相対パスへ変換する関数
   */
  convertLocationToRelative(track: TrackInfo): string | null {
    if (!("Location" in track) || typeof track.Location !== "string") {
      return null;
    }

    // prefixの長さだけ取り除き、相対パス "../..." として扱う
    return decodeURIComponent(`../..${track.Location.slice(this.pathPrefix.length)}`);
  }

  /**
   * デフォルトのパスプレフィックスを取得
   */
  static getDefaultPathPrefix(): string {
    return "file://localhost/C:/Users/kiori/Nextcloud/Musics/MusicBee/Library";
  }
}
