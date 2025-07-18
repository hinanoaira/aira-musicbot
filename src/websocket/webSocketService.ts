/**
 * WebSocket通信を管理するサービスです。
 * クライアントとの双方向通信を行い、
 * 再生キューの更新情報をリアルタイムで配信します。
 */

import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { GuildState, QueueItem, PlaybackStatus } from "../types/index.js";
import { parseFile } from "music-metadata";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebSocketService {
  private wss: WebSocketServer;
  private wsGuildClients = new Map<string, Set<WebSocket>>();
  private getGuildState: (guildId: string) => GuildState | undefined;
  private playbackUpdateInterval: NodeJS.Timeout | null = null;

  constructor(server: Server, getGuildState: (guildId: string) => GuildState | undefined) {
    this.wss = new WebSocketServer({ server });
    this.getGuildState = getGuildState;
    this.setupWebSocketServer();
    this.startPlaybackUpdateTimer();
  }

  private async makeQueueArray(st: GuildState | undefined | null): Promise<QueueItem[]> {
    const arr: QueueItem[] = [];
    if (!st) return arr;

    let idx = 0;
    if (st.currentTrack) {
      for (const t of st.currentTrack) {
        let duration: number | undefined;

        try {
          const filePath = path.resolve(__dirname, "../", t._relativePath);
          const metadata = await parseFile(filePath);
          duration = metadata.format.duration;
        } catch (error) {
          console.warn(`[WebSocket] Could not get duration for ${t._relativePath}:`, error);
        }

        arr.push({
          index: idx++,
          title: (t["Name"] as string) || "",
          album: (t["アルバム"] as string) || "",
          albumArtist: (t["アルバムアーティスト"] as string) || (t["アーティスト"] as string) || "",
          artist: (t["アーティスト"] as string) || "",
          isCurrent: true,
          duration,
        });
      }
    }

    for (const t of st.requestQueue) {
      let duration: number | undefined;

      try {
        const filePath = path.resolve(__dirname, "../", t._relativePath);
        const metadata = await parseFile(filePath);
        duration = metadata.format.duration;
      } catch (error) {
        console.warn(`[WebSocket] Could not get duration for ${t._relativePath}:`, error);
      }

      arr.push({
        index: idx++,
        title: (t["Name"] as string) || "",
        album: (t["アルバム"] as string) || "",
        albumArtist: (t["アルバムアーティスト"] as string) || (t["アーティスト"] as string) || "",
        artist: (t["アーティスト"] as string) || "",
        isCurrent: false,
        duration,
      });
    }

    return arr;
  }

  private setupWebSocketServer() {
    this.wss.on("connection", async (ws, req) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      let guildId = url.searchParams.get("guildid") || req.headers["guildid"];
      if (Array.isArray(guildId)) guildId = guildId[0];
      if (typeof guildId !== "string" || !guildId) {
        ws.close(4000, "guildid required");
        return;
      }

      if (!this.wsGuildClients.has(guildId)) {
        this.wsGuildClients.set(guildId, new Set());
      }
      this.wsGuildClients.get(guildId)!.add(ws);

      const st = this.getGuildState(guildId);
      const arr = await this.makeQueueArray(st);

      const playbackStatus = this.getPlaybackStatus(guildId, st);
      ws.send(
        JSON.stringify({
          type: "queue",
          data: arr,
          playbackStatus,
        })
      );

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch (err) {
          console.error("[WebSocket] Error parsing message:", err);
        }
      });

      ws.on("close", () => {
        this.wsGuildClients.get(guildId)?.delete(ws);
        if (this.wsGuildClients.get(guildId)?.size === 0) {
          this.wsGuildClients.delete(guildId);
        }
      });
    });
  }

  private getPlaybackStatus(guildId: string, st: GuildState | undefined): PlaybackStatus {
    if (!st || !st.currentTrack || st.currentTrack.length === 0) {
      return {
        guildId,
        isPlaying: false,
        currentTime: 0,
        totalTime: 0,
      };
    }

    const currentTime = st.playbackStartTime
      ? Math.floor((Date.now() - st.playbackStartTime) / 1000)
      : 0;

    const totalTime = st.currentTrackDuration || 0;

    return {
      guildId,
      isPlaying: true,
      currentTime: Math.min(currentTime, totalTime),
      totalTime,
    };
  }

  private startPlaybackUpdateTimer(): void {
    this.playbackUpdateInterval = setInterval(() => {
      this.broadcastPlaybackUpdates();
    }, 1000);
  }

  private async broadcastPlaybackUpdates(): Promise<void> {
    for (const [guildId, clients] of this.wsGuildClients) {
      if (clients.size === 0) continue;

      const st = this.getGuildState(guildId);
      if (!st || !st.currentTrack || st.currentTrack.length === 0) continue;

      const playbackStatus = this.getPlaybackStatus(guildId, st);

      const msg = JSON.stringify({
        type: "playbackUpdate",
        playbackStatus,
      });

      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(msg);
        }
      }
    }
  }

  public async notifyQueueUpdate(guildId: string): Promise<void> {
    const st = this.getGuildState(guildId);
    const arr = await this.makeQueueArray(st);
    const playbackStatus = this.getPlaybackStatus(guildId, st);
    const clients = this.wsGuildClients.get(guildId);
    if (!clients) return;

    const msg = JSON.stringify({
      type: "queue",
      data: arr,
      playbackStatus,
    });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }

  public destroy(): void {
    if (this.playbackUpdateInterval) {
      clearInterval(this.playbackUpdateInterval);
      this.playbackUpdateInterval = null;
    }
    this.wss.close();
  }
}
