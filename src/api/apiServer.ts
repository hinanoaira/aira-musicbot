/**
 * API Server のメインクラスです。
 * REST API エンドポイントを提供し、音楽ライブラリの検索、
 * 再生キューの管理、楽曲の再生制御を行います。
 */

import express from "express";
import cors from "cors";
import { parseFile } from "music-metadata";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import { allowedOriginsRegex } from "../config/index.js";
import { getLibraryData } from "../services/libraryService.js";
import { youtubeUrlToTrackInfo } from "../services/youtubeService.js";
import { sequenceTracks } from "../services/musicService.js";
import { GuildState, QueueItem } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * API Server のメインクラス
 */
export class ApiServer {
  private app: express.Application;
  private getGuildState: (guildId: string) => GuildState | undefined;
  private notifyQueueUpdate: (guildId: string) => void;

  constructor(
    getGuildState: (guildId: string) => GuildState | undefined,
    notifyQueueUpdate: (guildId: string) => void
  ) {
    this.app = express();
    this.getGuildState = getGuildState;
    this.notifyQueueUpdate = notifyQueueUpdate;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOriginsRegex.test(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept", "guildid"],
      })
    );
  }

  private extractGuildId(req: Request, res: Response): string | null {
    const guildId = req.header("guildid");
    if (!guildId) {
      res.status(400).send("Bad Request: missing guildid header");
      return null;
    }
    return guildId;
  }

  private makeQueueArray(st: GuildState | undefined | null): QueueItem[] {
    const arr: QueueItem[] = [];
    if (!st) return arr;

    let idx = 0;
    if (st.currentTrack) {
      for (const t of st.currentTrack) {
        arr.push({
          index: idx++,
          title: (t["Name"] as string) || "",
          album: (t["アルバム"] as string) || "",
          albumArtist: (t["アルバムアーティスト"] as string) || (t["アーティスト"] as string) || "",
          artist: (t["アーティスト"] as string) || "",
          isCurrent: true,
        });
      }
    }

    for (const t of st.requestQueue) {
      arr.push({
        index: idx++,
        title: (t["Name"] as string) || "",
        album: (t["アルバム"] as string) || "",
        albumArtist: (t["アルバムアーティスト"] as string) || (t["アーティスト"] as string) || "",
        artist: (t["アーティスト"] as string) || "",
        isCurrent: false,
      });
    }

    return arr;
  }

  private setupRoutes() {
    this.app.get("/queue", (req, res) => {
      const guildId = this.extractGuildId(req, res);
      if (!guildId) return;
      const st = this.getGuildState(guildId);
      res.json(this.makeQueueArray(st));
    });

    this.app.get("/artist", (req, res) => {
      const libraryData = getLibraryData();
      if (!libraryData.artistMap) {
        res.json([]);
        return;
      }
      const keys = Object.keys(libraryData.artistMap);
      keys.sort((a, b) => a.localeCompare(b, "ja"));
      res.json(keys);
    });

    this.app.get("/artist/:artist", (req, res) => {
      const { artist } = req.params;
      const libraryData = getLibraryData();
      if (!libraryData.artistMap || !libraryData.artistMap[artist]) {
        res.json([]);
        return;
      }
      const albumMap = libraryData.artistMap[artist];
      const albums = Object.keys(albumMap);
      albums.sort((a, b) => a.localeCompare(b, "ja"));
      res.json(albums);
    });

    this.app.get("/artist/:artist/:album", (req, res) => {
      const { artist, album } = req.params;
      const libraryData = getLibraryData();
      if (!libraryData.artistMap || !libraryData.artistMap[artist]) {
        res.json([]);
        return;
      }
      const albumMap = libraryData.artistMap[artist];
      if (!albumMap[album]) {
        res.json([]);
        return;
      }
      const trackArr = albumMap[album];
      const titles = trackArr.map((t) => t.Name);
      res.json(titles);
    });

    // /cover/:artist/:album -> 代表トラックからカバーアートを取得
    this.app.get("/cover/:artist/:album", async (req, res) => {
      const { artist, album } = req.params;
      const libraryData = getLibraryData();
      if (!libraryData.artistMap || !libraryData.artistMap[artist]) {
        res.status(404).send("Not found artist");
        return;
      }
      const albumMap = libraryData.artistMap[artist];
      if (!albumMap[album] || albumMap[album].length === 0) {
        res.status(404).send("Not found album or no tracks");
        return;
      }

      const firstTrack = albumMap[album][0];
      const filePath = path.resolve(__dirname, "../", firstTrack._relativePath);

      try {
        const stat = fs.statSync(filePath);
        const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
        if (req.headers["if-none-match"] === etag) {
          res.status(304).end();
          return;
        }

        const meta = await parseFile(filePath);
        const picArr = meta.common?.picture || [];
        if (picArr.length === 0) {
          res.status(404).send("No embedded cover");
          return;
        }
        const pic = picArr[0];
        if (!pic.data) {
          res.status(500).send("Invalid cover data");
          return;
        }
        const imageBuffer = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data);
        res.setHeader("Content-Type", pic.format || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("ETag", etag);
        res.send(imageBuffer);
      } catch (err) {
        console.error("[cover]", err);
        res.status(500).send("Failed to parse cover");
      }
    });

    this.app.get("/requestplay/:artist/:album/:title", (req, res) => {
      const guildId = this.extractGuildId(req, res);
      if (!guildId) return;

      const st = this.getGuildState(guildId);
      if (!st) {
        res.status(400).send("Bot is not joined in this guild");
        return;
      }

      const { artist, album, title } = req.params;
      const libraryData = getLibraryData();

      if (!libraryData.artistMap[artist] || !libraryData.artistMap[artist][album]) {
        res.status(404).send("Album not found");
        return;
      }
      const trackArr = libraryData.artistMap[artist][album];
      const found = trackArr.find((t) => t["Name"] === title);
      if (!found) {
        res.status(404).send("Track not found");
        return;
      }

      const tracks = sequenceTracks(found);
      st.requestQueue.push(...tracks);
      this.notifyQueueUpdate(guildId);
      res.json({
        result: "ok",
        message: `Requested single track: ${title}`,
      });
    });

    this.app.get("/youtubeplay/:url", async (req, res) => {
      const guildId = this.extractGuildId(req, res);
      if (!guildId) return;

      const st = this.getGuildState(guildId);
      if (!st) {
        res.status(400).send("Bot is not joined in this guild");
        return;
      }

      const url = req.params.url;
      const trackInfo = await youtubeUrlToTrackInfo(url);
      if (!trackInfo) {
        res.status(400).send("Failed to convert YouTube URL to track info");
        return;
      }

      st.requestQueue.push(trackInfo);
      this.notifyQueueUpdate(guildId);
      res.json({
        result: "ok",
        message: `Requested YouTube video: ${trackInfo.Name}`,
      });
    });

    this.app.get("/skip", (req, res) => {
      const guildId = this.extractGuildId(req, res);
      if (!guildId) return;

      const st = this.getGuildState(guildId);
      if (!st) {
        res.status(400).send("Bot is not joined in this guild");
        return;
      }

      st.worker.postMessage({ event: "skip" });
      res.json({ result: "ok", message: "Skipped current track" });
    });
  }

  public listen(port: number): import("http").Server {
    return this.app.listen(port, () => {
      console.log(`[HTTP Server] HTTP server listening on port ${port}`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}
