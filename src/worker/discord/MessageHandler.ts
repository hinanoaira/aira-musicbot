/**
 * Worker スレッドでのメッセージハンドリングを行うクラスです。
 * メインスレッドからのメッセージを受信し、適切な処理を実行します。
 */

import { Client } from "discord.js";
import { parentPort } from "worker_threads";
import { AudioManager } from "./audio/AudioManager.js";
import { ConnectionManager } from "./connection/ConnectionManager.js";
import { EventHandler } from "./events/EventHandler.js";
import { WorkerMessage } from "./types.js";

/**
 * Worker スレッドでのメッセージハンドリングを行うクラス
 */
export class MessageHandler {
  private audioManager: AudioManager;
  private connectionManager: ConnectionManager;
  private eventHandler: EventHandler;
  private client: Client;

  /**
   * MessageHandler のインスタンスを作成します。
   * @param audioManager AudioManager インスタンス
   * @param connectionManager ConnectionManager インスタンス
   * @param eventHandler EventHandler インスタンス
   * @param client Discord Client インスタンス
   */
  constructor(
    audioManager: AudioManager,
    connectionManager: ConnectionManager,
    eventHandler: EventHandler,
    client: Client
  ) {
    this.audioManager = audioManager;
    this.connectionManager = connectionManager;
    this.eventHandler = eventHandler;
    this.client = client;
  }

  /**
   * メッセージハンドラーをセットアップします。
   */
  setupMessageHandler(): void {
    parentPort?.on("message", async (message: WorkerMessage) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        parentPort?.postMessage({
          event: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * メッセージを処理します。
   * @param message WorkerMessage インスタンス
   */
  private async handleMessage(message: WorkerMessage): Promise<void> {
    switch (message.event) {
      case "leave":
        this.handleLeave();
        break;

      case "play":
        await this.handlePlay(message);
        break;

      case "skip":
        await this.handleSkip();
        break;

      case "shutdown":
        await this.handleShutdown();
        break;

      default:
        parentPort?.postMessage({
          event: "log",
          message: `Unknown message event: ${message.event}`,
        });
    }
  }

  /**
   * ボイスチャンネルから退出します。
   */
  private handleLeave(): void {
    this.eventHandler.setLeave(true);
    this.connectionManager.disconnect();
  }

  /**
   * 再生を開始します。
   * @param message WorkerMessage インスタンス
   */
  private async handlePlay(message: WorkerMessage): Promise<void> {
    if (!message.data) {
      throw new Error("Play message requires track data");
    }
    await this.audioManager.play(message.data);
  }

  /**
   * スキップを処理します。
   */
  private async handleSkip(): Promise<void> {
    this.audioManager.stop();
  }

  /**
   * シャットダウンを処理します。
   */
  private async handleShutdown(): Promise<void> {
    await this.audioManager.killFfmpegProcess();
    this.client.destroy();
    parentPort?.postMessage({
      event: "log",
      message: "Worker is shutting down...",
    });
    process.exit(0);
  }
}
