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
