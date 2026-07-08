# MailOps Console

Self-hosted Outlook/Hotmail mailbox pool and GPT account operations console.

This local build has been upgraded from the basic Mail Admin panel toward the online MailOps capability set:

- Multi-user mailbox isolation with invite registration.
- Encrypted Outlook/Hotmail refresh token storage.
- Mailbox scanning and custom classification rules.
- MailManage-compatible API Key access.
- Atomic mailbox reservation with `POST /api/mailboxes/reserve`.
- Used/reserved/lease mailbox lifecycle fields.
- Verification code polling with inbox + junk support.
- `no_code` quarantine through polling misses or `POST /api/mailboxes/report-code`.
- GPT account warehouse with manual import and registration-machine report API.
- GPT account export packages for Sub2/CPA/Cockpit-style downstream use.
- Admin user management, invite management, API key logs, and stats.
- Online-compatible frontend assets under `public/assets/`.

## Quick Start

```bash
cp .env.example .env
docker-compose up -d --build
```

Open:

```text
http://127.0.0.1:8009
```

For local Node development use Node 22 LTS. Node 24 may require local C++ build tools for `better-sqlite3`.

```bash
npm install
npm start
```

## Important Environment Variables

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
DATA_KEY=change-this-to-a-long-random-secret
PORT=8009
HOST=0.0.0.0
REGISTRATION_ENABLED=false
```

Keep `DATA_KEY` stable after importing mailboxes. Changing it makes saved refresh tokens undecryptable.

## Mailbox Allocation API

External registration workers should allocate mailboxes with:

```bash
curl -X POST "http://127.0.0.1:8009/api/mailboxes/reserve" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"category":"safe","consume":true}'
```

With `consume=true`, the mailbox is marked `used` before the response is returned, so concurrent workers cannot receive the same mailbox.

Then poll the same email:

```bash
curl -H "Authorization: Bearer mak_xxx" \
  "http://127.0.0.1:8009/api/mail/code?email=user@hotmail.com&keyword=code,验证码,verification code,OpenAI,ChatGPT,gpt&limit=10&folders=inbox,junk"
```

When the real registration flow times out without a code:

```bash
curl -X POST "http://127.0.0.1:8009/api/mailboxes/report-code" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@hotmail.com","result":"timeout","detail":"180s no verification code"}'
```

## GPT Account API

Registration machines can report GPT account results:

```bash
curl -X POST "http://127.0.0.1:8009/api/gpt-accounts/report" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"dedupe_key":"batch-001:user@example.com","result":"success","account":{"email":"user@example.com","password":"pass"},"auth_file":{"email":"user@example.com","refresh_token":"rt_xxx"}}'
```

The web console can import, filter, archive, delete, and export GPT accounts as ZIP packages.

## Notes On Local Implementation

This build keeps SQLite for deployment simplicity. It implements the online-facing API and UI shape, but the advanced external executors are local placeholders unless you wire them to real services:

- `/api/gpt-workbench/refresh-start`
- `/api/gpt-workbench/cpa-scan`
- `/api/gpt-workbench/cpa-delete`
- `/api/wenas/*`
- `/api/delivery-test/*`

They return stable structured responses so the frontend remains usable, while persistent local modules such as mailbox reserve, GPT account warehouse, exports, users, invites, rules, and API keys are real.

## Verification

```bash
node --check server.js
node --check public/assets/app.js
```

## Security

- Do not publish `.env`, `data/`, SQLite files, API keys, or refresh tokens.
- Use HTTPS through a reverse proxy/CDN in production.
- Public query links and API keys are bearer credentials. Treat them as secrets.
