/**
 * オーディオ再生を管理するクラスです。
 * Discord.js の AudioPlayer を使用して音声の再生、停止、
 * FFMPEGプロセスの管理を行います。
 */

import { createAudioPlayer, createAudioResource, AudioPlayer, StreamType } from "@discordjs/voice";
import { spawn } from "child_process";
import { TrackInfo } from "../../../types/index.js";
import { ResourceMetadata } from "../types.js";
import { parentPort } from "worker_threads";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

/**
 * オーディオ再生を管理するクラス
 */
export class AudioManager {
  private audioPlayer: AudioPlayer;
  private metadata: ResourceMetadata | null = null;

  // バッファリング設定
  private readonly BUFFER_SIZE = 100 * 1024 * 1024;
  private readonly PROBE_SIZE = 10 * 1024 * 1024;
  private readonly ANALYZE_DURATION = 5000000;

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
      parentPort?.postMessage({
        event: "log",
        message: "Killing FFMPEG process...",
      });
      const proc = this.metadata.ffmpegProcess;

      try {
        // タイムアウト付きでプロセスを終了
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            proc.once("exit", () => resolve());
            proc.once("error", (error) => reject(error));

            if (!proc.kill("SIGTERM")) {
              reject(new Error("Failed to send SIGTERM"));
            }
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("Process kill timeout")), 10000);
          }),
        ]);

        parentPort?.postMessage({
          event: "log",
          message: "FFMPEG process terminated gracefully",
        });
      } catch (error) {
        parentPort?.postMessage({
          event: "log",
          message: `SIGTERM failed (${error}), trying SIGKILL...`,
        });

        try {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              proc.once("exit", () => resolve());
              proc.once("error", (error) => reject(error));

              if (!proc.kill("SIGKILL")) {
                reject(new Error("Failed to send SIGKILL"));
              }
            }),
            new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error("Force kill timeout")), 10000);
            }),
          ]);

          parentPort?.postMessage({
            event: "log",
            message: "FFMPEG process force killed",
          });
        } catch (forceKillError) {
          parentPort?.postMessage({
            event: "error",
            error: `Failed to kill FFMPEG process: ${forceKillError}`,
          });
        }
      }
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

    const args = await this.buildFfmpegArgs(trackObj, bitrate);

    // HDDアクセス待ちを軽減するためのプロセス設定
    const ffmpegProcess = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsVerbatimArguments: true,
      env: {
        ...process.env,
        FFREPORT: "level=16",
      },
    });

    ffmpegProcess.on("error", (error) => {
      parentPort?.postMessage({
        event: "error",
        error: `FFMPEG process error: ${error.message}`,
      });
    });

    ffmpegProcess.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        parentPort?.postMessage({
          event: "error",
          error: `FFMPEG process exited with code ${code}, signal ${signal}`,
        });
      }
    });

    const resource = createAudioResource(ffmpegProcess.stdout, {
      inputType: StreamType.OggOpus,
      inlineVolume: false,
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
  private async buildFfmpegArgs(trackObj: TrackInfo[], bitrate: number): Promise<string[]> {
    const args: string[] = [];

    // HDDアクセス待ちを軽減するためのバッファリング設定
    args.push(
      "-fflags",
      "+genpts+igndts",
      "-max_delay",
      "5000000",
      "-rtbufsize",
      `${this.BUFFER_SIZE / (1024 * 1024)}M`
    );

    // OS別の最適化設定
    if (process.platform === "linux") {
      args.push(
        "-thread_queue_size",
        "4096",
        "-analyzeduration",
        "10000000",
        "-probesize",
        "20000000"
      );
    } else if (process.platform === "win32") {
      args.push(
        "-thread_queue_size",
        "2048",
        "-analyzeduration",
        this.ANALYZE_DURATION.toString(),
        "-probesize",
        this.PROBE_SIZE.toString()
      );
    } else {
      // macOS等のデフォルト設定
      args.push(
        "-analyzeduration",
        this.ANALYZE_DURATION.toString(),
        "-probesize",
        this.PROBE_SIZE.toString()
      );
    }

    // リプレイゲインのアルバム値を取得（FLACファイルから直接読み取り、あれば使用、なければ0）
    let albumGain = 0;
    if (trackObj.length > 0) {
      albumGain = await this.getAlbumGainFromFlac(trackObj[0]._relativePath.slice(3));
    }

    // 入力ファイルを追加
    trackObj.forEach((track) => {
      args.push("-i", track._relativePath.slice(3));
    });

    // ボリューム調整値を計算（基本の-dB + アルバムゲイン）
    const volumeAdjustment = -18 + albumGain;

    // フィルターとマッピングを設定
    if (trackObj.length === 1) {
      args.push("-af", `volume=${volumeAdjustment}dB`, "-map", "0:a");
    } else {
      const filter =
        trackObj.map((_, index) => `[${index}:a:0]`).join("") +
        `concat=n=${trackObj.length}:v=0:a=1[outa];[outa]volume=${volumeAdjustment}dB[out]`;
      args.push("-filter_complex", filter, "-map", "[out]");
    }

    // エンコーディング設定（バッファリング強化）
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
      "-bufsize",
      `${bitrate * 2}`,
      "-maxrate",
      `${bitrate * 1.5}`,
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "opus",
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

  /**
   * FLACファイルからリプレイゲインのアルバム値を取得します。
   * @param filePath FLACファイルのパス
   * @returns リプレイゲインのアルバム値（dB）、見つからない場合は0
   */
  private async getAlbumGainFromFlac(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_format -print_format json "${filePath}"`
      );
      const metadata = JSON.parse(stdout);

      if (metadata.format && metadata.format.tags) {
        const tags = metadata.format.tags;
        // 各種リプレイゲインタグを確認
        const albumGainValue =
          tags.REPLAYGAIN_ALBUM_GAIN ||
          tags.replaygain_album_gain ||
          tags["ALBUM GAIN"] ||
          tags["Album Gain"];

        if (typeof albumGainValue === "string") {
          // "+X.XX dB" や "X.XX dB" 形式から数値を抽出
          const match = albumGainValue.match(/([+-]?\d+\.?\d*)/);
          if (match) {
            return parseFloat(match[1]) || 0;
          }
        }
      }

      return -10;
    } catch (error) {
      parentPort?.postMessage({
        event: "log",
        message: `Failed to read replay gain from ${filePath}: ${error}`,
      });
      return -10;
    }
  }
}
