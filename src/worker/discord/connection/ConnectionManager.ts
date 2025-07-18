import { getVoiceConnection, joinVoiceChannel, VoiceConnection } from "@discordjs/voice";
import { Guild, StageChannel, VoiceChannel } from "discord.js";
import { AudioManager } from "../audio/AudioManager.js";

/**
 * Discord音声接続を管理するクラスです。
 * 音声チャンネルへの接続、切断、および接続状態の管理を行います。
 */
export class ConnectionManager {
  private connection: VoiceConnection | null = null;
  private audioManager: AudioManager;
  private guild: Guild;
  private channel: VoiceChannel | StageChannel;

  /**
   * ConnectionManagerのインスタンスを作成します。
   * @param audioManager オーディオマネージャーのインスタンス
   * @param guild Discord ギルド
   * @param channel 音声チャンネル（VoiceChannel または StageChannel）
   */
  constructor(audioManager: AudioManager, guild: Guild, channel: VoiceChannel | StageChannel) {
    this.audioManager = audioManager;
    this.guild = guild;
    this.channel = channel;
  }

  /**
   * 音声接続を開始します。
   * @returns VoiceConnection インスタンス
   */
  async connect(): Promise<VoiceConnection> {
    this.connection = joinVoiceChannel({
      channelId: this.channel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.subscribe(this.audioManager.getAudioPlayer());
    return this.connection;
  }

  /**
   * 音声接続を切断します。
   */
  disconnect(): void {
    this.audioManager.stop();

    const connection = getVoiceConnection(this.guild.id);
    if (connection) {
      connection.destroy();
    }
  }

  /**
   * 現在の音声接続を取得します。
   * @returns VoiceConnection インスタンスまたは null
   */
  getConnection(): VoiceConnection | null {
    return this.connection;
  }

  /**
   * 音声マネージャーを取得します。
   * @returns AudioManager インスタンス
   */
  getAudioManager(): AudioManager {
    return this.audioManager;
  }

  /**
   * ギルドを取得します。
   * @returns Guild インスタンス
   */
  getGuild(): Guild {
    return this.guild;
  }

  /**
   * 音声チャンネルを取得します。
   * @returns VoiceChannel または StageChannel インスタンス
   */
  getChannel(): VoiceChannel | StageChannel {
    return this.channel;
  }
}
