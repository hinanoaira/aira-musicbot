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
 * ffmpegを使用して音声ファイルを0dBまで正規化します。
 * @param filePath 正規化する音声ファイルのパス
 */
async function normalizeAudio(filePath: string): Promise<void> {
  const tempFile = filePath + ".temp.wav";

  return new Promise<void>((resolve, reject) => {
    console.log(`[ffmpeg] Normalizing audio: ${filePath}`);

    // ffmpegで音量を正規化（-af volumedetect で最大音量を検出し、-af volume で増幅）
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-i",
        filePath,
        "-af",
        "loudnorm=I=-23:TP=-2:LRA=7",
        "-y", // 既存ファイルを上書き
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
  const fileName = `${hash}.wav`;
  const outputFile = path.join(outputDir, fileName);

  // 既にファイルが存在していたらダウンロードをスキップ
  if (!fs.existsSync(outputFile)) {
    // yt-dlpコマンドでwav形式でダウンロード
    try {
      await new Promise<void>((resolve, reject) => {
        console.log(`[yt-dlp] Downloading: ${url} to ${outputFile}`);
        const ytDlp = spawn(
          "yt-dlp",
          ["-x", "--force-ipv4", "--audio-format", "wav", "--output", outputFile, url],
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

    // ダウンロード完了後、音量を0dBまで正規化
    try {
      await normalizeAudio(outputFile);
      console.log(`[Audio Normalization] Completed for: ${outputFile}`);
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
