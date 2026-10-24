# Agent — Telegram Agent & BetShop Manager

Starter project for the `agent` GitHub repository.

## Stack
- Cloudflare Worker (Telegram webhook)
- Supabase Postgres (database)
- Telegram Bot API

## Important
This is a starter scaffold, not a finished production system. Do not deploy with real agent data until the security checklist below is completed and tested.

## Files
- `src/index.ts` — Telegram webhook starter, `/start`, language selection, basic health endpoint.
- `supabase/schema.sql` — initial database tables and constraints.
- `wrangler.toml` — Cloudflare Worker configuration.
- `.dev.vars.example` — local environment variable names (no secrets).

## 1. Supabase
1. Open your Supabase project.
2. Go to **SQL Editor** → **New query**.
3. Copy `supabase/schema.sql` into the editor and run it.
4. Keep the `service_role` key secret. Never put it in client-side code or commit it to GitHub.

## 2. Cloudflare Worker
1. Create a Cloudflare account and a Worker named `agent`.
2. Add these Worker **Secrets** in Settings → Variables and Secrets:
   - `BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_TELEGRAM_ID` (your numeric Telegram user ID)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH` (do not use a plaintext password)
3. Deploy this code as a Worker. Configure Telegram webhook to:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR-WORKER-URL>/telegram`
   Open that URL privately in your browser, replacing placeholders. Never share the URL because it contains the token.

## 3. Configure GitHub
Upload these files to your private GitHub repository `agent`. Do not upload `.dev.vars` or any secret values.

## Current scope
This scaffold responds to `/start`, offers Amharic/English language selection, and records language preference when a Telegram user starts the bot. The agent registration, admin approvals, BetShop lifecycle, reports and live updates are next implementation steps.

## Security checklist before production
- Implement and test username/password registration and login with password hashing and rate limiting.
- Enforce admin-only actions on the server, not just by hiding buttons.
- Enable and test database access controls / RLS; never expose service-role credentials to agents.
- Add audit logs for all Deposit, Withdraw, Balance and status changes.
- Add backup/recovery and test suspension/deletion/reactivation flows.
- Avoid sending passwords in chat; use a safer password setup/reset flow where possible.
