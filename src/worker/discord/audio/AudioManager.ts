/**
 * オーディオ再生を管理するクラスです。
 * Discord.js の AudioPlayer を使用して音声の再生、停止、
 * FFMPEGプロセスの管理を行います。
 */

import { createAudioPlayer, createAudioResource, AudioPlayer, StreamType } from "@discordjs/voice";
import { spawn } from "child_process";
import { TrackInfo } from "../../../types/index.js";
import { ResourceMetadata } from "../types.js";

/**
 * オーディオ再生を管理するクラス
 */
export class AudioManager {
  private audioPlayer: AudioPlayer;
  private metadata: ResourceMetadata | null = null;

  /**
   * AudioManager のインスタンスを作成します。
   */
  constructor() {
    this.audioPlayer = createAudioPlayer();
  }

  /**
   * オーディオプレイヤーを取得します。
   * @returns AudioPlayer インスタンス
   */
  getAudioPlayer(): AudioPlayer {
    return this.audioPlayer;
  }

  /**
   * FFMPEGプロセスを終了させます。
   * 既に終了している場合は何もしません。
   */
  async killFfmpegProcess(): Promise<void> {
    if (this.metadata?.ffmpegProcess && this.metadata.ffmpegProcess.exitCode === null) {
      const proc = this.metadata.ffmpegProcess;
      const waitForExit = new Promise<void>((resolve) => {
        proc.once("exit", () => resolve());
      });
      proc.kill();
      await waitForExit;
    }
  }

  /**
   * 再生を開始します。
   * @param trackObj 再生するトラック情報の配列
   * @param bitrate ビットレート（デフォルトは256kbps）
   */
  async play(trackObj: TrackInfo[], bitrate: number = 256 * 1024): Promise<void> {
    if (!trackObj.length) {
      throw new Error("No tracks provided.");
    }

    const args = this.buildFfmpegArgs(trackObj, bitrate);
    const ffmpegProcess = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });

    const resource = createAudioResource(ffmpegProcess.stdout, {
      inputType: StreamType.OggOpus,
    });

    this.audioPlayer.play(resource);

    this.metadata = {
      trackInfo: trackObj,
      ffmpegProcess,
    };
  }

  /**
   * FFMPEGの引数を生成します。
   * @param trackObj 再生するトラック情報の配列
   * @param bitrate ビットレート（デフォルトは256kbps）
   * @returns FFMPEGの引数の配列
   */
  private buildFfmpegArgs(trackObj: TrackInfo[], bitrate: number): string[] {
    const args: string[] = [];

    // 入力ファイルを追加
    trackObj.forEach((track) => {
      args.push("-i", track._relativePath.slice(3));
    });

    // フィルターとマッピングを設定
    if (trackObj.length === 1) {
      args.push("-map", "0:a");
    } else {
      const filter =
        trackObj.map((_, index) => `[${index}:a:0]`).join("") +
        `concat=n=${trackObj.length}:v=0:a=1[outa]`;
      args.push("-filter_complex", filter, "-map", "[outa]");
    }

    // エンコーディング設定
    const frameDuration = 20;
    args.push(
      "-c:a",
      "libopus",
      "-application",
      "audio",
      "-b:a",
      `${bitrate}`,
      "-vbr",
      "on",
      "-frame_duration",
      `${frameDuration}`,
      "-f",
      "opus",
      "-af",
      "volume=-10dB",
      "pipe:1"
    );

    return args;
  }

  /**
   * 再生を停止します。
   */
  stop(): void {
    this.audioPlayer.stop();
  }

  /**
   * 現在のメタデータを取得します。
   * @returns 現在のメタデータ
   */
  getCurrentMetadata(): ResourceMetadata | null {
    return this.metadata;
  }
}
