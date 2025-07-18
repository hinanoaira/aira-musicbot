/**
 * Discord Bot アプリケーションのメインエントリーポイントです。
 * Discord Bot、API Server、WebSocket サービスを初期化し、
 * ライブラリファイルの監視を開始します。
 */

import path from "path";
import { fileURLToPath } from "url";
import { DISCORD_TOKEN, LIBRARY_XML_PATH, PORT } from "./config/index.js";
import { watchLibraryFile } from "./services/libraryService.js";
import { notificationService } from "./services/notificationService.js";
import { DiscordBot } from "./bot/discordBot.js";
import { ApiServer } from "./api/apiServer.js";
import { WebSocketService } from "./websocket/webSocketService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libraryXmlPath = path.join(__dirname, LIBRARY_XML_PATH);

const discordBot = new DiscordBot(DISCORD_TOKEN, (guildId: string) =>
  notificationService.notifyQueueUpdate(guildId)
);

const apiServer = new ApiServer(
  (guildId: string) => discordBot.getGuildState(guildId),
  (guildId: string) => notificationService.notifyQueueUpdate(guildId)
);

const server = apiServer.listen(PORT);

const webSocketService = new WebSocketService(server, (guildId: string) =>
  discordBot.getGuildState(guildId)
);

notificationService.setWebSocketService(webSocketService);

watchLibraryFile(libraryXmlPath);

console.log("[Main] All services initialized successfully");
