import { TrackInfo } from "../../../types/index.js";
import { PathConverter } from "../utils/PathConverter.js";

export class TrackProcessor {
  private pathConverter: PathConverter;

  constructor(pathConverter: PathConverter) {
    this.pathConverter = pathConverter;
  }

  /**
   * トラックリストを処理して有効なトラックのみ返す
   */
  processValidTracks(tracks: TrackInfo[]): TrackInfo[] {
    const validTracks: TrackInfo[] = [];

    for (const track of tracks) {
      const relativePath = this.pathConverter.convertLocationToRelative(track);
      if (!relativePath) {
        // Locationがないなど、再生不可能なものは除外
        continue;
      }

      // 相対パスを追加
      (track as TrackInfo & { _relativePath?: string })._relativePath = relativePath;
      validTracks.push(track);
    }

    return validTracks;
  }

  /**
   * トラックをアルバムアーティスト/アルバム別に分類
   */
  createArtistMap(tracks: TrackInfo[]): Record<string, Record<string, TrackInfo[]>> {
    const artistMap: Record<string, Record<string, TrackInfo[]>> = {};

    for (const track of tracks) {
      const albumArtist =
        track["アルバムアーティスト"] || track["アーティスト"] || "Unknown Artist";
      const album = track["アルバム"] || "Unknown Album";

      if (!artistMap[albumArtist]) {
        artistMap[albumArtist] = {};
      }
      if (!artistMap[albumArtist][album]) {
        artistMap[albumArtist][album] = [];
      }
      artistMap[albumArtist][album].push(track);
    }

    return artistMap;
  }

  /**
   * アーティストマップ内の各アルバムをソート
   */
  sortArtistMap(artistMap: Record<string, Record<string, TrackInfo[]>>): void {
    for (const artist of Object.keys(artistMap)) {
      for (const album of Object.keys(artistMap[artist])) {
        artistMap[artist][album].sort(
          (a: TrackInfo, b: TrackInfo) =>
            (a["Disc Number"] ?? 0) - (b["Disc Number"] ?? 0) ||
            (a["Track Number"] ?? 0) - (b["Track Number"] ?? 0)
        );
      }
    }
  }
}
