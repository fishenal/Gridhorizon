# Gridhorizon

Asynchronous open-world exploration prototype: procedural 8000×8000 map, fog of war, offline travel settlement, building, and trading.

## Local development

1. Copy environment variables:

```bash
cp .env.example .env.local
```

Set Neon `DATABASE_URL` and `AUTH_SECRET` (`openssl rand -base64 32`).

2. Push the database schema:

```bash
pnpm db:push
```

3. Start:

```bash
pnpm dev
```

Open http://localhost:3000, register, then go to `/play`.

## Preview (Vercel)

1. Import the repo; Root Directory is the repo root.
2. Add Neon from the Marketplace, or set `DATABASE_URL` for Preview manually.
3. Preview env vars: `AUTH_SECRET`, `TRAVEL_SECONDS_PER_TILE=3`, `WORLD_SEED`, `CRON_SECRET`.
4. Run `pnpm db:push` once against the same database locally.
5. Push a branch to get a Preview URL.

Note: this project primarily settles on read; Preview/local work without Cron. In production, Vercel Cron hits `/api/cron/tick` once daily at UTC 00:00 (Hobby plan daily limit) as a server-wide fallback settlement.

## Gameplay summary

- Travel defaults to 3 seconds per tile (test); use 60 for live.
- Vision radius 20; +1 gold per tile traveled.
- Flag costs 100 gold; toll radius and intel sharing apply.
- Mine costs 500 gold; farm/fishery/town have adjacency bonuses.
- Meeting in vision auto-adds friends; resource trades and land offers available.
