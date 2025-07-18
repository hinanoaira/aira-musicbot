/**
 * Discord Worker で使用される型定義をまとめたファイルです。
 * リソースメタデータ、ワーカーメッセージ、ワーカーレスポンスなどの
 * インターフェースを定義しています。
 */

import { ChildProcessByStdio } from "child_process";
import internal from "stream";
import { TrackInfo } from "../../types/index.js";

/** オーディオリソースのメタデータ */
export interface ResourceMetadata {
  trackInfo: TrackInfo[];
  ffmpegProcess: ChildProcessByStdio<null, internal.Readable, null>;
}

/** ワーカーに送信するメッセージ */
export interface WorkerMessage {
  event: "leave" | "play" | "skip" | "shutdown";
  data?: TrackInfo[];
}

/** ワーカーからの応答 */
export interface WorkerResponse {
  event: "log" | "error" | "requestNext" | "disconnect";
  message?: string;
  error?: string;
}
