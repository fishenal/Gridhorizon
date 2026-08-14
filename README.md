# Gridhorizon

Asynchronous open-world exploration prototype: procedural **8000×8000** map, fog of war, offline travel settlement, building, and trading.

Stack: Next.js (App Router), Neon Postgres + Drizzle, Auth.js, Ably (realtime).

Demo: [Play online](https://gridhorizon.vercel.app/) · Community: [Discord](https://discord.gg/HxS7Z4p4EP)

## Screenshots

![Gridhorizon gameplay](./screenshots/screenshot2.png)

## Local development

Requires Node.js 20+ and [pnpm](https://pnpm.io).

1. Install and copy env:

```bash
pnpm install
cp .env.example .env.local
```

Fill at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon (or other) Postgres URL |
| `AUTH_SECRET` | Auth.js secret (`openssl rand -base64 32`) |
| `ABLY_API_KEY` | Ably app key (realtime presence / map sync) |

Optional: `TRAVEL_SECONDS_PER_TILE` (default `1`), `WORLD_SEED` (default `424242`), `CRON_SECRET` (production cron only).

2. Push schema and run:

```bash
pnpm db:push
pnpm dev
```

Open http://localhost:3000 → register → `/play`.

## Preview (Vercel)

1. Import the repo (root = repo root).
2. Add Neon from the Marketplace, or set `DATABASE_URL` for Preview.
3. Set Preview env: `AUTH_SECRET`, `ABLY_API_KEY`, `TRAVEL_SECONDS_PER_TILE` (e.g. `1` or `3`), `WORLD_SEED`, `CRON_SECRET`.
4. Run `pnpm db:push` once against that database locally.
5. Push a branch for a Preview URL.

Settlement primarily happens on read; Preview/local work without Cron. In production, Vercel Cron hits `/api/cron/tick` daily at UTC 00:00 as a server-wide fallback.

## Gameplay summary

- Travel: `TRAVEL_SECONDS_PER_TILE` seconds per tile (code default **1**; use a higher value for slower live play).
- Vision radius **20**; **+1 gold** and **+1 XP** per tile traveled.
- Flag: **100** gold; influence / toll; structure spacing **one flag or town per 20×20**.
- Mine: **500** gold (needs claim + resource). Farm / fishery / town have terrain rules and economy cycles.
- Meeting in vision auto-adds friends; resource trades and land offers available.

## License

[MIT](./LICENSE) © 2026 fishenal
