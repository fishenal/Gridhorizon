# Gridhorizon

异步开放世界探索概念版：程序化 8000×8000 地图、迷雾、离线行进结算、建设与交易。

## 本地开发

1. 复制环境变量：

```bash
cp .env.example .env.local
```

填入 Neon `DATABASE_URL` 与 `AUTH_SECRET`（`openssl rand -base64 32`）。

2. 推送数据库 schema：

```bash
pnpm db:push
```

3. 启动：

```bash
pnpm dev
```

打开 http://localhost:3000 注册后进入 `/play`。

## Preview（Vercel）

1. Import 仓库，Root Directory 为仓库根。
2. Marketplace 添加 Neon，或手动配置 `DATABASE_URL` 到 Preview。
3. Preview 环境变量：`AUTH_SECRET`、`TRAVEL_SECONDS_PER_TILE=3`、`WORLD_SEED`、`CRON_SECRET`。
4. 本地对同一库执行一次 `pnpm db:push`。
5. 推送分支获取 Preview URL。

注意：本项目以读时结算为主，Preview / 本地不跑 Cron 也可完整试玩。Production 上 Vercel Cron 为每天 UTC 00:00 触发一次 `/api/cron/tick`（Hobby 允许的每日频率），仅作全服兜底结算。

## 玩法摘要

- 每格行进默认 3 秒（测服），正式可改 60。
- 视野半径 20；每路过一格 +1 金。
- 路标 100 金，过路费 10 金并分享探索情报。
- 矿场 500 金；农场/渔场/城镇有连片加成。
- 视野相遇自动好友；可资源交易与地块求购。
