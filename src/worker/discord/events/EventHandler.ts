/**
 * Discord関連のイベントハンドリングを行うクラスです。
 * 音声接続、オーディオ再生、ボイス状態の変更などの
 * イベントを監視し、適切な処理を実行します。
 */

import { AudioPlayerStatus, VoiceConnectionStatus } from "@discordjs/voice";
import { Events, VoiceState, Collection, GuildMember } from "discord.js";
import { Client } from "discord.js";
import { parentPort } from "worker_threads";
import { AudioManager } from "../audio/AudioManager.js";
import { ConnectionManager } from "../connection/ConnectionManager.js";

/**
 * Discord関連のイベントハンドリングを行うクラス
 */
export class EventHandler {
  private audioManager: AudioManager;
  private connectionManager: ConnectionManager;
  private client: Client;
  private leave: boolean = false;

  /**
   * EventHandler のインスタンスを作成します。
   * @param audioManager オーディオマネージャー
   * @param connectionManager 接続マネージャー
   * @param client Discord クライアント
   */
  constructor(audioManager: AudioManager, connectionManager: ConnectionManager, client: Client) {
    this.audioManager = audioManager;
    this.connectionManager = connectionManager;
    this.client = client;
  }

  /**
   * 退出フラグを設定します。
   * @param leave 退出フラグ
   */
  setLeave(leave: boolean): void {
    this.leave = leave;
  }

  /**
   * 各種イベントリスナーを設定します。
   */
  setupEventListeners(): void {
    this.setupConnectionEvents();
    this.setupAudioEvents();
    this.setupVoiceStateEvents();
  }

  /**
   * 音声接続関連のイベントを設定します。
   */
  private setupConnectionEvents(): void {
    const connection = this.connectionManager.getConnection();
    if (!connection) return;

    connection.on(VoiceConnectionStatus.Ready, () => {
      parentPort?.postMessage({
        event: "log",
        message: "Voice connection is ready",
      });
      parentPort?.postMessage({ event: "requestNext" });
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      parentPort?.postMessage({
        event: "log",
        message: "Disconnected => cleanup",
      });
      connection.destroy();
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      parentPort?.postMessage({
        event: "log",
        message: "Connection Destroyed",
      });
      parentPort?.postMessage({ event: "disconnect" });
    });
  }

  /**
   * オーディオ再生関連のイベントを設定します。
   */
  private setupAudioEvents(): void {
    const audioPlayer = this.audioManager.getAudioPlayer();

    audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      if (this.leave) return;
      await this.audioManager.killFfmpegProcess();
      parentPort?.postMessage({ event: "requestNext" });
    });
  }

  /**
   * ボイス状態変更のイベントを設定します。
   */
  private setupVoiceStateEvents(): void {
    const guild = this.connectionManager.getGuild();
    const channel = this.connectionManager.getChannel();

    this.client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
      if (oldState.guild.id !== guild.id) return;
      if (oldState.channelId !== channel.id && newState.channelId !== channel.id) return;
      if (this.leave) return;

      const oldChannel = oldState.guild.channels.cache.get(channel.id);
      if (!oldChannel || !("members" in oldChannel)) {
        this.leaveVoiceChannel();
        return;
      }

      // 退出したのがBot自身の場合は何もしない
      if (oldState.member?.id === this.client.user?.id && !newState.channelId) {
        return;
      }

      const nonBot = (channel.members as Collection<string, GuildMember>).filter(
        (m) => !m.user.bot
      );
      if (nonBot.size === 0) {
        parentPort?.postMessage({
          event: "log",
          message: "No non-bot => leaving",
        });
        this.leaveVoiceChannel();
      }
    });
  }

  /**
   * ボイスチャンネルから退出します。
   */
  private async leaveVoiceChannel(): Promise<void> {
    this.leave = true;
    await this.connectionManager.disconnect();
  }
}
