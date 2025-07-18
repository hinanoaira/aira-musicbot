/**
 * Discord チャンネル関連のユーティリティ関数を提供します。
 */

import { Channel, StageChannel, VoiceChannel } from "discord.js";

/**
 * チャンネルがボイスベースのチャンネルかどうかを判定します。
 * @param channel 判定対象のチャンネル
 * @returns ボイスベースのチャンネルかどうか
 */
export function isVoiceBasedChannel(
  channel: Channel | null | undefined
): channel is VoiceChannel | StageChannel {
  return !!channel && (channel.type === 2 || channel.type === 13);
}
