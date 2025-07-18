/**
 * Discord音楽再生ワーカーのメインクラスです。
 * 音声接続、オーディオ再生、イベント処理、メッセージハンドリングを管理します。
 */

import { Client, Events, GatewayIntentBits, Guild } from "discord.js";
import { parentPort, workerData } from "worker_threads";
import { AudioManager } from "./audio/AudioManager.js";
import { ConnectionManager } from "./connection/ConnectionManager.js";
import { EventHandler } from "./events/EventHandler.js";
import { MessageHandler } from "./MessageHandler.js";
import { isVoiceBasedChannel } from "./utils/channelUtils.js";

export class DiscordPlayWorker {
  private audioManager: AudioManager;
  private connectionManager: ConnectionManager | null = null;
  private eventHandler: EventHandler | null = null;
  private messageHandler: MessageHandler | null = null;
  private client: Client;

  constructor() {
    this.audioManager = new AudioManager();
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
  }

  async initialize(): Promise<void> {
    if (!parentPort) {
      throw new Error("This file must be run as a worker thread.");
    }

    await this.initializeClient();

    const guild = (await this.client.guilds.fetch(workerData.guildId)) as Guild;
    const channel = await guild.channels.fetch(workerData.channelId);

    if (!isVoiceBasedChannel(channel)) {
      throw new Error("指定したチャンネルが見つからないか、ボイスチャンネルではありません");
    }

    this.connectionManager = new ConnectionManager(this.audioManager, guild, channel);
    this.eventHandler = new EventHandler(this.audioManager, this.connectionManager, this.client);
    this.messageHandler = new MessageHandler(
      this.audioManager,
      this.connectionManager,
      this.eventHandler,
      this.client
    );

    await this.connectionManager.connect();
    this.eventHandler.setupEventListeners();
    this.messageHandler.setupMessageHandler();

    parentPort.postMessage({
      event: "log",
      message: "Discord play worker initialized successfully",
    });
  }

  private async initializeClient(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.client.login(workerData.token);
      this.client.once(Events.ClientReady, () => resolve());
    });
  }
}
