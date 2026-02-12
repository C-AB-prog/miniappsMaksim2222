# Business Assistant v2

Clean rewrite: **Telegram Mini App** (React/Vite) + **API** (Fastify/TS) + **Bot** (Telegraf) + **Worker** (BullMQ) + **Postgres (Prisma)** + **Redis**.

## 1) Setup

### Start Postgres + Redis
```bash
docker compose up -d
```

### Configure env
```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```
Fill in:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (any random string)
- `ADMIN_TG_IDS` (your Telegram numeric id)

### Install deps
From repo root:
```bash
npm install
```

### Prisma migrate
```bash
npm run prisma:migrate
```

### Run (dev)
```bash
npm run dev:all
```
- Web: http://localhost:5173
- API: http://localhost:8080/health

## 2) Telegram

### WebApp auth
Frontend sends `x-telegram-init-data` header (Telegram WebApp `initData`).
For local dev outside Telegram, set `VITE_DEV_TG_ID` in `apps/web/.env`.

### Bot webhook
Expose your API to the internet (ngrok or your server) and set Telegram webhook:
- URL: `https://YOUR_DOMAIN/bot/webhook`
- Secret header: Telegram supports `x-telegram-bot-api-secret-token`.
Use same value as `TELEGRAM_WEBHOOK_SECRET`.

### Admin console
In Telegram chat with your bot:
- `/admin` → interactive console with buttons (Overview/Users/Focuses + filters).

## 3) What's implemented
- Users auth (Telegram initData verification) + dev override
- Trial: starts at first focus creation, expires in 7 days, write endpoints blocked (402)
- Focuses: list/create/get (membership per focus)
- Tasks: list/create/patch with owner/member ACL
- Assistant: thread/messages (stub reply) + plan_to_tasks bulk endpoint
- Invites: create invite code, join, list members
- Admin bot panel (basic "wow" foundation)
- Worker: notification queue processor (foundation)

## 4) Next TODO (you can extend)
- Real OpenAI assistant + tool JSON output
- Notifications scheduling (due reminders, quiet hours)
- KPI endpoints + UI
- Better UI/UX (design system, tabs, empty states)
- Analytics: funnels/retention fully
