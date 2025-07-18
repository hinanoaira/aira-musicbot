# Discord Music Bot

MusicBee ライブラリと連携した Discord 音楽再生ボットです。Discord 上での音楽再生、Web API によるリモート制御、WebSocket によるリアルタイム通知機能を提供します。

## 主な機能

- **Discord 音楽再生**: FFMPEG を使用したオーディオストリーミング
- **MusicBee ライブラリ連携**: iTunes Music Library.xml からの楽曲情報読み込み
- **Web API**: REST API による楽曲検索・再生制御
- **WebSocket 通知**: リアルタイムでのキュー状態更新
- **YouTube 対応**: YouTube 動画の音声再生
- **音量調整**: -10dB の音量調整機能

## 技術スタック

- **Node.js** + **TypeScript** (ESM)
- **Discord.js** - Discord Bot framework
- **Express** - Web API server
- **WebSocket** - リアルタイム通信
- **FFmpeg** - オーディオ処理
- **Worker Threads** - バックグラウンド処理

## プロジェクト構成

```
src/
├── index.ts                     # メインエントリーポイント
├── bot/
│   └── discordBot.ts           # Discord Bot メインクラス
├── api/
│   └── apiServer.ts            # REST API サーバー
├── websocket/
│   └── webSocketService.ts     # WebSocket サービス
├── services/
│   ├── libraryService.ts       # ライブラリ管理
│   ├── musicService.ts         # 音楽データ処理
│   ├── notificationService.ts  # 通知サービス
│   └── youtubeService.ts       # YouTube連携
├── worker/
│   ├── discord/                # Discord再生ワーカー
│   │   ├── index.ts            # ワーカーメインファイル
│   │   ├── DiscordPlayWorker.ts # Discord再生ワーカー本体
│   │   ├── MessageHandler.ts   # メッセージハンドラー
│   │   ├── types.ts            # Discord関連型定義
│   │   ├── audio/
│   │   │   └── AudioManager.ts # オーディオ再生管理
│   │   ├── connection/
│   │   │   └── ConnectionManager.ts # 接続管理
│   │   ├── events/
│   │   │   └── EventHandler.ts # イベント処理
│   │   └── utils/
│   │       └── channelUtils.ts # チャンネル操作ユーティリティ
│   └── library/                # ライブラリ解析ワーカー
│       ├── index.ts            # ワーカーメインファイル
│       ├── LibraryParser.ts    # ライブラリ解析器
│       ├── LibraryParserWorker.ts # ライブラリ解析ワーカー本体
│       ├── types.ts            # ライブラリ関連型定義
│       ├── parsers/
│       │   └── XmlParser.ts    # XML解析器
│       ├── processors/
│       │   └── TrackProcessor.ts # トラック情報処理
│       └── utils/
│           └── PathConverter.ts # パス変換ユーティリティ
├── config/
│   └── index.ts                # 設定ファイル
└── types/
    └── index.ts                # 型定義
```

## セットアップ

### 前提条件

- Node.js 18+
- FFmpeg
- MusicBee または iTunes

### インストール

1. リポジトリをクローン

```bash
git clone https://github.com/hinanoaira/aira-musicbot.git
cd aira-musicbot
```

2. 依存関係をインストール

```bash
npm install
```

3. 環境設定ファイルを作成

```bash
cp .env.example .env
```

4. `.env`ファイルを編集

```env
DISCORD_TOKEN=your_discord_bot_token_here
```

5. MusicBee ライブラリファイルのパスを設定
   - `src/config/index.ts`の`LIBRARY_XML_PATH`を適切なパスに変更

### 実行

#### 開発モード

```bash
npm run dev
```

#### 本番モード

```bash
npm run build
npm start
```

## API エンドポイント

### 楽曲関連

- `GET /artist` - アーティスト一覧取得
- `GET /artist/:artist` - アーティストのアルバム一覧取得
- `GET /artist/:artist/:album` - アルバムの楽曲一覧取得
- `GET /cover/:artist/:album` - アルバムカバーアート取得

### 再生制御

- `GET /queue` - 現在の再生キュー取得
- `GET /requestplay/:artist/:album/:title` - 楽曲再生リクエスト
- `GET /youtubeplay/:url` - YouTube 動画再生リクエスト
- `GET /skip` - 現在の楽曲をスキップ

### ヘッダー

すべての API リクエストには`guildid`ヘッダーが必要です。

## 設定

### 音量調整

音声は自動的に-10dB 下げられます。`AudioManager.ts`で調整可能です。

### CORS 設定

`allowedOriginsRegex`で許可するオリジンを設定できます。

### ポート設定

デフォルトは 8180 番ポートです。`config/index.ts`で変更可能です。

## 開発

### TypeScript 設定

- ESM モジュールを使用
- 厳密な型チェック有効
- `dist/`ディレクトリにコンパイル

### ESLint 設定

- TypeScript ESLint 使用
- 厳密なルール適用

### デバッグ

ワーカースレッドからのログは`parentPort.postMessage`で出力されます。

## ライセンス

This project is private.

## 貢献

1. フォークしてブランチを作成
2. 変更を加えてコミット
3. プルリクエストを作成

## サポート

問題や質問がある場合は、GitHub の Issue を作成してください。
