# Movie DB

映画の公開情報と YouTube 予告動画の再生数を管理する個人用 Web アプリです。

## 概要

「どの作品にヒットの兆しがあるか」を可視化することを目的としたプロジェクトです。

配給会社ごとの YouTube チャンネルと紐づけて映画を登録し、公開当日の予告動画再生数を自動で取得・記録します。上映館数や入場者特典情報もあわせて管理することで、興行成績を予測するための指標を一元管理できます。

## 主な機能

- **作品登録** — タイトル・公開日・上映館数・特典情報・配給会社・メモを登録
- **再生数の自動取得** — 毎朝 9:00（JST）に cron が起動し、公開当日の作品の YouTube 予告動画再生数を取得して DB に保存
- **手動取得** — `/api/fetch-views` エンドポイントから任意のタイミングで再生数を取得可能
- **一覧表示** — 全項目でのソート、配給会社によるフィルタリングに対応
- **編集モーダル** — 登録済み作品の各種情報をモーダルから更新

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Node.js / Express 5 |
| フロントエンド | Vanilla JS / HTML / CSS |
| データベース | Supabase (PostgreSQL) |
| 外部 API | YouTube Data API v3 |
| スケジューラ | node-cron |

## システム構成

```
[ブラウザ]
    │  REST API
    ▼
[Express サーバー]
    ├─ Supabase (映画データの CRUD)
    └─ YouTube Data API v3 (予告動画の検索・再生数取得)
         └─ 配給会社名 → チャンネル ID でチャンネルを絞り込み
              └─ 検索結果のタイトルマッチング → 最多再生数の公開動画を選択
```

## セットアップ

### 前提条件

- Node.js 18 以上
- Supabase プロジェクト（`movies` テーブル）
- YouTube Data API v3 の API キー

### インストール

```bash
git clone https://github.com/Yota-0108/movie-db.git
cd movie-db
npm install
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成し、以下を設定します。

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key
YOUTUBE_API_KEY=your_youtube_api_key
PORT=3001
```

> **セキュリティについて**
> フロントエンドは Supabase に直接アクセスせず、すべて Express サーバー経由で DB を操作します。
> Supabase の `service_role` キーはサーバーサイドのみで使用し、`movies` テーブルには RLS を有効化しています。
> これにより、外部から anon キーで DB を直接操作されることを防ぎ、RLS を安全網として機能させています。
> なお `.env` は `.gitignore` で除外しており、リポジトリには含まれません。

### DB テーブル定義

Supabase で以下のテーブルを作成してください。

```sql
create table movies (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  release_date    date not null,
  theater_count   integer,
  has_bonus       boolean default false,
  bonus_count     integer,
  distributor     text,
  memo            text,
  video_type      text,
  youtube_views_release bigint,
  youtube_video_id      text
);
```

### 起動

```bash
node server.js
```

ブラウザで `http://localhost:3001` を開きます。

## API 仕様

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/movies` | 作品一覧取得（公開日降順） |
| `POST` | `/api/movies` | 作品登録 |
| `PATCH` | `/api/movies/:id` | 作品情報更新 |
| `GET` | `/api/distributors` | 配給会社一覧取得 |
| `POST` | `/api/fetch-views` | 今日の公開作品の再生数を手動取得 |

## YouTube 再生数の取得ロジック

1. 映画タイトルと配給会社名から対応する YouTube チャンネル ID を特定
2. そのチャンネル内でタイトルを検索（最大 50 件）
3. 取得したタイトルのうち映画タイトルを含むものに絞り込む（全角・半角を正規化して比較）
4. 公開状態（public）の動画のみを対象に、再生数が最多のものを採用
5. 再生数と動画 ID を DB に保存

## ライセンス

MIT
