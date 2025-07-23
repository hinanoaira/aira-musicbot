/**
 * 音楽再生に関するサービスです。
 * ランダムトラックの取得、トラックシーケンスの生成などを行います。
 */

import { TrackInfo } from "../types/index.js";
import { getLibraryData } from "./libraryService.js";

export function getRandomItem(): TrackInfo | null {
  const libraryData = getLibraryData();
  if (libraryData.allTracksCount == 0) return null;

  let totalValidTracks = 0;
  let selectedTrack: TrackInfo | null = null;

  for (const artistName of Object.keys(libraryData.artistMap)) {
    for (const albumName of Object.keys(libraryData.artistMap[artistName])) {
      const tracks = libraryData.artistMap[artistName][albumName];
      for (const track of tracks) {
        if (track.SkipWhenShuffling !== "1" && track.Love !== "B") {
          totalValidTracks++;
          if (Math.random() < 1 / totalValidTracks) {
            selectedTrack = track;
          }
        }
      }
    }
  }

  return selectedTrack;
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
