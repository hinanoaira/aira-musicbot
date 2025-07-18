/**
 * 通知サービス
 * WebSocketを通じたキューアップデート通知を管理します。
 */

import { WebSocketService } from "../websocket/webSocketService.js";

export class NotificationService {
  private webSocketService: WebSocketService | null = null;

  public setWebSocketService(webSocketService: WebSocketService): void {
    this.webSocketService = webSocketService;
  }

  public notifyQueueUpdate(guildId: string): void {
    this.webSocketService?.notifyQueueUpdate(guildId);
  }
}

export const notificationService = new NotificationService();
