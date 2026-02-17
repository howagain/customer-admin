# Customer Admin Dashboard

Customer management dashboard for OpenClaw — shipped as a skill that any agent can host.

## What It Does

- **CRUD customers** — add, edit, pause, remove customer channels
- **Paywall controls** — active customers get bot responses, unpaid get a polite paywall message
- **Config validation** — validates changes before patching, prevents bad config
- **Gateway integration** — reads/writes via `config.get` / `config.patch`, auto-restarts

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │────▶│  Admin API   │────▶│   OpenClaw   │
│  (HTML/JS)   │     │  (Express)   │     │   Gateway    │
└──────────────┘     └──────────────┘     └──────────────┘
```

- **Dashboard**: Static HTML/JS, responsive (mobile-first — you're selling from your phone)
- **Admin API**: Thin Express server with validation, calls gateway config API
- **No database** — OpenClaw config file is the source of truth

## Shipping as a Skill

This ships as an OpenClaw skill. The customer's agent can:
- Host the dashboard itself
- Respond to natural language: "add a customer called Acme with blog tools"
- The agent calls the admin API under the hood

## Quick Start

```bash
npm install
npm start        # starts API server on :3002
npm run dev      # dev mode with auto-reload
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Add a customer |
| PATCH | `/api/customers/:id` | Edit a customer |
| DELETE | `/api/customers/:id` | Remove a customer |
| POST | `/api/customers/:id/pause` | Pause a customer |
| POST | `/api/customers/:id/activate` | Activate a customer |
| GET | `/api/health` | Health check |

## License

Private — Automate Friday
