/**
 * アプリケーション全体で使用される型定義をまとめたファイルです。
 * トラック情報、ライブラリデータ、ギルド状態、キューアイテムなどの
 * インターフェースを定義しています。
 */

import { Worker } from "worker_threads";

export interface TrackInfo {
  [key: string]: string | number | undefined;
  _relativePath: string;
  KeepTracksInSequence?: string;
  SkipWhenShuffling?: string | number;
  Love?: string | number;
  "Disc Number"?: number;
  "Track Number"?: number;
}

export interface LibraryData {
  allTracksCount: number;
  artistMap: {
    [artist: string]: {
      [album: string]: TrackInfo[];
    };
  };
}

export interface GuildState {
  currentTrack: TrackInfo[] | null;
  requestQueue: TrackInfo[];
  worker: Worker;
}

export interface QueueItem {
  index: number;
  title: string;
  album: string;
  albumArtist: string;
  artist: string;
  isCurrent: boolean;
}
