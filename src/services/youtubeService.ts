/**
 * YouTube動画のダウンロードと変換を行うサービスです。
 * yt-dlpを使用してYouTube動画をwav形式でダウンロードし、
 * TrackInfo形式に変換します。
 */

import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TrackInfo } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ffmpegを使用して音声ファイルの最大ピーク値を取得します。
 * @param filePath 音声ファイルのパス
 * @returns 最大ピーク値（dB）
 */
async function getPeakDb(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    console.log(`[ffmpeg] Detecting peak: ${filePath}`);

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-i",
        filePath,
        "-af",
        "volumedetect",
        "-f",
        "null",
        process.platform === "win32" ? "NUL" : "/dev/null",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      }
    );

    let maxVolume: number | null = null;

    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString();
      const match = line.match(/max_volume: (-?\d+(?:\.\d+)?) dB/);
      if (match) {
        maxVolume = parseFloat(match[1]);
      }
    });

    ffmpeg.on("close", (code: number) => {
      if (code === 0 && maxVolume !== null) {
        resolve(maxVolume);
      } else {
        reject(new Error(`ffmpeg peak detection failed with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * ffmpegを使用して音声ファイルを指定したゲイン値で増幅します。
 * @param filePath 音声ファイルのパス
 * @param gainDb 適用するゲイン値（dB）
 */
async function normalizeAudio(filePath: string, gainDb: number): Promise<void> {
  const tempFile = filePath + ".temp.flac";

  return new Promise<void>((resolve, reject) => {
    console.log(`[ffmpeg] Applying gain ${gainDb.toFixed(2)} dB to: ${filePath}`);

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-i",
        filePath,
        "-af",
        `volume=${gainDb}dB`,
        "-ar",
        "96000",
        "-c:a",
        "flac",
        "-sample_fmt",
        "s32",
        "-y",
        tempFile,
      ],
      {
        stdio: "ignore",
      }
    );

    ffmpeg.on("close", (code: number) => {
      if (code === 0) {
        // 正規化が成功したら元ファイルを置き換え
        try {
          fs.unlinkSync(filePath);
          fs.renameSync(tempFile, filePath);
          resolve();
        } catch (err) {
          reject(new Error(`Failed to replace normalized file: ${err}`));
        }
      } else {
        // 失敗した場合は一時ファイルを削除
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      // エラーが発生した場合は一時ファイルを削除
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      reject(err);
    });
  });
}

/**
 * YouTubeのURLをTrackInfoに変換し、yt-dlpでwav形式にダウンロードします。
 * @param url YouTube動画のURL
 * @returns TrackInfo または null
 */
export async function youtubeUrlToTrackInfo(url: string): Promise<TrackInfo | null> {
  // 保存先ディレクトリ
  const outputDir = path.join(__dirname, "../../youtube_downloads");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // URLからハッシュを生成してファイル名にする
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  const fileName = `${hash}.flac`;
  const outputFile = path.join(outputDir, fileName);

  // 既にファイルが存在していたらダウンロードをスキップ
  if (!fs.existsSync(outputFile)) {
    // yt-dlpコマンドでwav形式でダウンロード
    try {
      await new Promise<void>((resolve, reject) => {
        console.log(`[yt-dlp] Downloading: ${url} to ${outputFile}`);
        const ytDlp = spawn(
          "yt-dlp",
          ["-x", "--force-ipv4", "--audio-format", "flac", "--output", outputFile, url],
          {
            stdio: "ignore",
          }
        );

        ytDlp.on("close", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp exited with code ${code}`));
        });
        ytDlp.on("error", reject);
      });
    } catch (err) {
      console.error("[yt-dlp] Download failed:", err);
      return null;
    }

    // ダウンロード完了後、最大ピーク値を検出して0dBまで正規化
    try {
      const maxPeak = await getPeakDb(outputFile);
      const gainToApply = -maxPeak;

      console.log(`[Audio Analysis] File: ${outputFile}`);
      console.log(`[Audio Analysis]: ${maxPeak.toFixed(2)} dB`);

      // 0.1dB以下の場合は処理をスキップ
      if (Math.abs(gainToApply) <= 0.1) {
        console.log(`[Audio Normalization]: Gain is too small (${gainToApply.toFixed(2)} dB)`);
      } else {
        await normalizeAudio(outputFile, gainToApply);
        console.log(`[Audio Normalization]: Audio normalized successfully`);
      }
    } catch (err) {
      console.error("[Audio Normalization] Failed:", err);
      // 正規化に失敗してもファイルは使用可能なので処理を続行
    }
  }

  // 相対パスとして扱うため、__dirnameからの相対パス(dist/services -> src)を生成
  const latestFile = path.relative(
    path.join(__dirname, "../../src"),
    `youtube_downloads/${fileName}`
  );

  // 動画タイトル・チャンネル名を一発で取得
  let videoTitle = "YouTube Video";
  let channelName = "YouTube";
  try {
    const info = await new Promise<string>((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", ["--print", "%(title)s|%(channel)s", url], {
        stdio: ["ignore", "pipe", "ignore"],
      });

      let output = "";
      ytDlp.stdout.on("data", (data) => {
        output += data.toString();
      });

      ytDlp.on("close", (code: number) => {
        if (code === 0) resolve(output.trim());
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
      ytDlp.on("error", reject);
    });

    const [title, channel] = info.split("|");
    if (title) videoTitle = title;
    if (channel) channelName = channel;
  } catch (err) {
    console.error("[yt-dlp] Failed to get video info:", err);
  }

  return {
    _relativePath: latestFile,
    Name: videoTitle,
    アルバム: "Youtube",
    アルバムアーティスト: "Youtube",
    アーティスト: channelName,
  };
}
