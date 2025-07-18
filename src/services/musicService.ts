/**
 * 音楽再生に関するサービスです。
 * ランダムトラックの取得、トラックシーケンスの生成などを行います。
 */

import { TrackInfo } from "../types/index.js";
import { getLibraryData } from "./libraryService.js";

export function getRandomItem(): TrackInfo | null {
  const libraryData = getLibraryData();
  if (libraryData.allTracksCount == 0) return null;

  while (true) {
    const artists = Object.keys(libraryData.artistMap);
    const artistName = artists[Math.floor(Math.random() * artists.length)];
    const albums = Object.keys(libraryData.artistMap[artistName]);
    const albumName = albums[Math.floor(Math.random() * albums.length)];
    const tracks = libraryData.artistMap[artistName][albumName];
    const track = tracks[Math.floor(Math.random() * tracks.length)];

    if (track.SkipWhenShuffling === "1" || track.Love === "B") {
      continue;
    }

    return track;
  }
}

export function sequenceTracks(track: TrackInfo): TrackInfo[] {
  const libraryData = getLibraryData();

  if (track.KeepTracksInSequence) {
    const keepTracksInSequence = track.KeepTracksInSequence;
    const tracksData = libraryData.artistMap[
      track["アルバムアーティスト"] || track["アーティスト"] || "Unknown Artist"
    ][track["アルバム"] || "Unknown Album"].filter(
      (t) => t.KeepTracksInSequence === keepTracksInSequence
    );
    tracksData.sort((a, b) => {
      const trackNumA = a["Track Number"] ?? 0;
      const trackNumB = b["Track Number"] ?? 0;
      return trackNumA - trackNumB;
    });
    return tracksData;
  } else {
    return [track];
  }
}
