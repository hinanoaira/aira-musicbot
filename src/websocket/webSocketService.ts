/**
 * WebSocket通信を管理するサービスです。
 * クライアントとの双方向通信を行い、
 * 再生キューの更新情報をリアルタイムで配信します。
 */

import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { GuildState, QueueItem } from "../types/index.js";

export class WebSocketService {
  private wss: WebSocketServer;
  private wsGuildClients = new Map<string, Set<WebSocket>>();
  private getGuildState: (guildId: string) => GuildState | undefined;

  constructor(server: Server, getGuildState: (guildId: string) => GuildState | undefined) {
    this.wss = new WebSocketServer({ server });
    this.getGuildState = getGuildState;
    this.setupWebSocketServer();
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

  private setupWebSocketServer() {
    this.wss.on("connection", (ws, req) => {
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
      const arr = this.makeQueueArray(st);
      ws.send(JSON.stringify({ type: "queue", data: arr }));

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

  public notifyQueueUpdate(guildId: string): void {
    const st = this.getGuildState(guildId);
    const arr = this.makeQueueArray(st);
    const clients = this.wsGuildClients.get(guildId);
    if (!clients) return;

    const msg = JSON.stringify({ type: "queue", data: arr });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }
}
