# Customer Admin — Architecture Report

## Overview

A multi-tenant dashboard for managing per-customer Slack bot access via OpenClaw's native per-channel config. One agent, multiple customers, each isolated to their own Slack channel.

## System Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Dashboard UI  │────▶│  Effect-TS Services   │────▶│  OpenClaw Config │
│  (demo.html)    │     │  (SlackChannelService)│     │  (openclaw.json) │
│  Mobile-first   │     │                      │     │                  │
│  Static HTML    │     │  ConfigService ───────│────▶│  channels.slack  │
│                 │     │  GatewayService ──────│────▶│  .channels.<id>  │
│                 │     │  StorageService ──────│────▶│  (plugin: JSON/  │
│                 │     │                      │     │   Convex/Memory)  │
└─────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │  OpenClaw Agent  │
                                                    │  (per-channel    │
                                                    │   sessions)      │
                                                    │                  │
                                                    │  Session key:    │
                                                    │  agent:<id>:     │
                                                    │  slack:channel:  │
                                                    │  <channelId>     │
                                                    └─────────────────┘
```

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| [`docs/demo.html`](../docs/demo.html) | Dashboard UI — mobile-first, dark mode, mock data | 1052 |
| [`src/services/SlackChannelService.ts`](../src/services/SlackChannelService.ts) | CRUD operations composing Config + Gateway | 173 |
| [`src/services/ConfigService.ts`](../src/services/ConfigService.ts) | Read/write OpenClaw config, InMemory impl for tests | 92 |
| [`src/services/GatewayService.ts`](../src/services/GatewayService.ts) | Restart + health check, Mock impl tracks calls | 46 |
| [`src/services/StorageService.ts`](../src/services/StorageService.ts) | Plugin interface: InMemory, JsonFile, (future: Convex) | 111 |
| [`src/errors/index.ts`](../src/errors/index.ts) | Tagged errors for Effect's error channel | 39 |
| [`src/test/SlackChannelService.test.ts`](../src/test/SlackChannelService.test.ts) | 27 BDD tests with WHY headers | 469 |
| [`src/index.ts`](../src/index.ts) | Barrel export | 30 |

**Total:** 993 lines (excluding package.json/tsconfig)

## Effect-TS Dependency Graph

```
SlackChannelService
├── ConfigService (Context.Tag)
│   ├── read()  → Effect<OpenClawConfig, ConfigReadError>
│   ├── write() → Effect<void, ConfigWriteError>
│   └── patch() → Effect<void, ConfigWriteError>
├── GatewayService (Context.Tag)
│   ├── restart() → Effect<void, GatewayError>
│   └── health()  → Effect<GatewayStatus, GatewayError>
└── Errors (Data.TaggedError)
    ├── TenantNotFoundError
    ├── TenantAlreadyExistsError
    ├── ValidationError
    ├── ConfigReadError / ConfigWriteError
    ├── GatewayError
    └── StorageReadError / StorageWriteError

StorageService (Context.Tag) — independent, pluggable
├── get<T>(key) → Effect<T | null, StorageReadError>
├── set<T>(key, value) → Effect<void, StorageWriteError>
├── delete(key) → Effect<void, StorageWriteError>
└── list(prefix?) → Effect<string[], StorageReadError>
```

## Plugin System — How It Scales

Adding a new storage backend = implement the `StorageService` interface:

```typescript
// 1. InMemory (tests) — already built
const InMemoryStorageLayer = (initial?) => Layer.succeed(StorageService, ...)

// 2. JSON File (demo) — already built
const JsonFileStorageLayer = (path) => Layer.succeed(StorageService, ...)

// 3. Convex (prod) — future
const ConvexStorageLayer = (deploymentUrl) => Layer.succeed(StorageService, ...)

// 4. Any new backend — same interface
const PostgresStorageLayer = (connString) => Layer.succeed(StorageService, ...)
```

The `SlackChannelService` doesn't know or care which backend is injected. Tests, demo, and prod all run the same business logic — only the Layer changes.

## RBAC Model

| Role | Permissions | Current State |
|------|------------|---------------|
| Platform Admin | CRUD all tenants, manage gateway | ✅ Implemented (single admin) |
| Bot Owner | Manage their own tenant config | ⚠️ No auth scoping yet |
| End Customer | Use bot in their Slack channel | ✅ Enforced by OpenClaw runtime |

**MVP ships with Platform Admin only.** Auth layer (Bearer token on Express API) is the next step for multi-admin support.

## Per-Tenant Isolation

OpenClaw enforces isolation at runtime via `channels.slack.channels.<id>`:

- **Session isolation:** Each channel gets its own session key (`agent:<agentId>:slack:channel:<channelId>`)
- **User scoping:** `users` array = allowlist per channel (`groupPolicy: "allowlist"`)
- **Tool restrictions:** `tools.deny` per channel — default denies 6 privilege escalation tools
- **System prompt:** Per-channel `systemPrompt` differentiates bot behavior per customer
- **Shared memory:** All tenants share the same agent workspace (knowledge base updates once, all see it)

## Safe Defaults for New Tenants

```typescript
DEFAULT_TOOL_DENY = ["exec", "write", "edit", "gateway", "cron", "message"]
groupPolicy = "allowlist"
enabled = true
requireMention = true
```

## Security Findings (Tesla Audit)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture quality | 9/10 | Effect DI is textbook-correct |
| Code-test parity | 9/10 | Same code path via Layer injection |
| Safe defaults | 10/10 | All 6 dangerous tools denied |
| Input validation | 7/10 | Good basics, misses some edge cases |
| Auth/authz | 2/10 | Nonexistent (fine for single-admin MVP) |
| Storage isolation | 3/10 | Flat key-value, no tenant namespace |
| Concurrent safety | 3/10 | No locking mechanism |
| "Just works with Slack" | 7/10 | Config shape matches OpenClaw docs |

**For single-admin demo: ships.** For production multi-tenancy: auth layer + storage namespacing required.

## Test Coverage

**80 tests total across 2 repos:**

### Config Contract Tests (PR #70 — automate-friday-infra)
53 tests in `tests/multi-tenant-dashboard.test.ts`:
- Layer 0: Config shape validation (7)
- Layer 1: CRUD operations (15)
- Layer 2: RBAC isolation (20)
- Input validation, allow/enabled semantics, prompt injection, cross-tenant users (11)

### Effect Service Tests (PR #1 — howagain/customer-admin)
27 tests in `src/test/SlackChannelService.test.ts`:
- L0: Safe defaults (4)
- L1: CRUD via Effect services (12)
- L2: RBAC isolation via services (6)
- L3: Input validation (5)
- L4: Full lifecycle with restart tracking (1)

## Links

- **Live demo:** https://howagain.github.io/customer-admin/demo.html
- **PR #70 (config tests):** https://github.com/automate-friday/automate-friday-infra/pull/70
- **PR #1 (Effect services):** https://github.com/howagain/customer-admin/pull/1
- **OpenClaw Slack docs:** Per-channel config reference at `/app/docs/channels/slack.md`
