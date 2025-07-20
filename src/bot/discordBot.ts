/**
 * Discord Bot のメインクラスです。
 * Discord への接続、コマンドの            (() => {
              const tsWorkerFile = path.join(__dirname, "../worker/discord/index.ts");
              const jsWorkerFile = path.join(__dirname, "../worker/discord/index.js");

              const isDevelopment = process.env.NODE_ENV === "development";

              if (isDevelopment && fs.existsSync(tsWorkerFile)) {管理を行います。
 */

import { Client, Events, GatewayIntentBits, GuildMember, MessageFlags } from "discord.js";
import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseFile } from "music-metadata";
import { GuildState, TrackInfo } from "../types/index.js";
import { getRandomItem, sequenceTracks } from "../services/musicService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Discord Bot のメインクラス
 */
export class DiscordBot {
  private client: Client;
  private guildStateMap = new Map<string, GuildState>();
  private notifyQueueUpdate: (guildId: string) => void;

  constructor(token: string, notifyQueueUpdate: (guildId: string) => void) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    this.notifyQueueUpdate = notifyQueueUpdate;
    this.setupEvents(token);
  }

  private setupEvents(token: string) {
    this.client.once(Events.ClientReady, () => {
      console.log(`[Discord Bot] Logged in as ${this.client.user?.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      if (commandName === "join") {
        const memberVC = (interaction.member as GuildMember)?.voice?.channel;
        if (!memberVC) {
          await interaction.reply({
            content: "ボイスチャンネルに参加してから実行してください。",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const state: GuildState = {
          currentTrack: [],
          requestQueue: [],
          worker: new Worker(
            (() => {
              const tsWorkerFile = path.join(__dirname, "../worker/discord/index.ts");
              const jsWorkerFile = path.join(__dirname, "../worker/discord/index.js");

              // NODE_ENVが未定義の場合は本番環境として扱う
              const isDevelopment = process.env.NODE_ENV === "development";

              if (isDevelopment && fs.existsSync(tsWorkerFile)) {
                return tsWorkerFile;
              } else if (fs.existsSync(jsWorkerFile)) {
                return jsWorkerFile;
              } else {
                throw new Error(
                  `Discord worker file not found. Checked: ${tsWorkerFile}, ${jsWorkerFile}`
                );
              }
            })(),
            {
              workerData: { token, guildId: interaction.guildId, channelId: memberVC.id },
            }
          ),
        };

        this.guildStateMap.set(interaction.guildId!, state);
        this.setupWorkerEvents(state, interaction.guildId!, interaction.guild?.name);

        console.log(
          `[${interaction.guild?.name}] Joining VC: ${memberVC.name} (PlayingCount: ${this.guildStateMap.size})`
        );
        await interaction.reply({
          content: "ボイスチャンネルに参加しました。",
        });
        setTimeout(() => {
          interaction.deleteReply().catch(console.log);
        }, 10000);
      } else if (commandName === "leave") {
        this.guildStateMap.get(interaction.guildId!)?.worker?.postMessage({ event: "leave" });
        console.log(
          `[${interaction.guild?.name}] Left VC (PlayingCount: ${this.guildStateMap.size})`
        );
        await interaction.reply({
          content: "ボイスチャンネルから退出しました。",
        });
        setTimeout(() => {
          interaction.deleteReply().catch(console.log);
        }, 10000);
      }
    });

    this.client.login(token);
  }

  private async calculateTrackDuration(tracks: TrackInfo[]): Promise<number> {
    if (tracks.length === 0) return 0;

    let totalDuration = 0;
    for (const track of tracks) {
      try {
        const filePath = path.resolve(__dirname, "../", track._relativePath);
        const metadata = await parseFile(filePath);
        if (metadata.format.duration) {
          totalDuration += metadata.format.duration;
        }
      } catch (error) {
        console.warn(`[Discord Bot] Could not get duration for ${track._relativePath}:`, error);
      }
    }
    return totalDuration;
  }

  private setupWorkerEvents(state: GuildState, guildId: string, guildName?: string) {
    const worker = state.worker;

    worker.on("message", async (message) => {
      if (message.event === "requestNext") {
        if (state.requestQueue.length > 0) {
          const tracks = sequenceTracks(state.requestQueue.shift()!);
          const trackCount = tracks.length;
          for (let i = 0; i < trackCount - 1; i++) {
            state.requestQueue.shift();
          }
          state.currentTrack = tracks;
          state.playbackStartTime = Date.now();
          state.currentTrackDuration = await this.calculateTrackDuration(tracks);
          this.notifyQueueUpdate(guildId);
          worker.postMessage({ event: "play", data: tracks });
          return;
        }

        const randItem = getRandomItem();
        if (randItem) {
          const tracks = sequenceTracks(randItem);
          state.currentTrack = tracks;
          state.playbackStartTime = Date.now();
          state.currentTrackDuration = await this.calculateTrackDuration(tracks);
          this.notifyQueueUpdate(guildId);
          worker.postMessage({ event: "play", data: tracks });
          return;
        }

        state.currentTrack = null;
        state.playbackStartTime = undefined;
        state.currentTrackDuration = undefined;
        worker.postMessage({ event: "leave" });
        return;
      } else if (message.event === "disconnect") {
        worker.postMessage({ event: "shutdown" });
        this.guildStateMap.delete(guildId);
        this.notifyQueueUpdate(guildId);
      } else if (message.event === "error") {
        console.error(`[${guildName}] Worker error:`, message.error);
      } else if (message.event === "log") {
        console.log(`[${guildName}] Worker log:`, message.message);
      }
    });
  }

  public getGuildState(guildId: string): GuildState | undefined {
    return this.guildStateMap.get(guildId);
  }

  public getAllGuildStates(): Map<string, GuildState> {
    return this.guildStateMap;
  }
}
