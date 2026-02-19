# OpenClaw Multi-Tenant Research Report
**For: Dashboard team (Ada, Pepper, Leo)**
**By: Op | 2026-02-19**

---

## Executive Summary

OpenClaw has strong native primitives for multi-tenant bot-as-a-service on Slack. The key insight: **you don't need custom multi-tenant code**. OpenClaw's config already supports per-channel system prompts, per-channel tool/skill scoping, per-channel user allowlists, session isolation, and shared-vs-isolated memory — all declaratively in `openclaw.json`. The dashboard just needs to be a config editor with a nice UI.

---

## 1. Channel Scoping (Slack)

### Per-Channel Configuration
Every Slack channel gets its own config block under `channels.slack.channels`:

```json5
{
  channels: {
    slack: {
      channels: {
        "C_ACME_123": {
          allow: true,
          requireMention: true,
          allowBots: false,
          users: ["U_ACME_ADMIN"],        // user allowlist
          skills: ["docs", "search"],      // skill scoping
          systemPrompt: "You are AcmeCo's assistant. Only answer questions about AcmeCo products.",
          tools: { /* per-channel tool config */ },
          toolsBySender: { /* tool config per sender ID */ },
        },
        "C_BETA_456": {
          allow: true,
          requireMention: false,
          users: ["U_BETA_USER1", "U_BETA_USER2"],
          systemPrompt: "You are BetaCorp's support bot. Use the BetaCorp knowledge base.",
          skills: ["support-kb"],
        },
      },
    },
  },
}
```

### What Each Field Controls

| Field | Purpose | Multi-Tenant Use |
|-------|---------|-----------------|
| `allow` | Whether the bot listens in this channel | Enable/disable per tenant |
| `requireMention` | Bot only responds when @mentioned | Prevent noise in busy channels |
| `users` | User ID allowlist for the channel | Restrict which people can interact |
| `skills` | Skill allowlist for this channel | Scope capabilities per tenant |
| `systemPrompt` | Per-channel system prompt override | **Core tenant isolation** — different persona/instructions per customer |
| `tools` | Tool policy per channel | Restrict dangerous tools per tenant |
| `toolsBySender` | Tool policy per sender within channel | Fine-grained RBAC |
| `allowBots` | Whether other bots can trigger | Usually false for tenants |

### Key Finding: `systemPrompt` is the tenant boundary
Each channel gets its own system prompt. This is how the bot operator controls what the bot knows, how it behaves, and what it can access per customer. The operator updates the system prompt → the bot's behavior changes for that channel only.

---

## 2. Session Isolation

### How Sessions Work
OpenClaw creates **isolated session keys per channel**:

```
agent:main:slack:channel:C_ACME_123        ← Acme's session
agent:main:slack:channel:C_BETA_456        ← Beta's session
agent:main:slack:channel:C_ACME_123:thread:T123  ← Thread within Acme
```

**Sessions are fully isolated by default.** Acme's conversation context never leaks to Beta's channel. Each channel has its own:
- Conversation history
- Context window
- Compaction cycle

### Thread Isolation
Slack threads get their own sub-sessions:
- `thread.historyScope: "thread"` (default) — thread has its own context
- `thread.inheritParent: false` (default) — thread doesn't inherit parent channel context

This means a customer's thread conversations are isolated even from their own channel's main context.

### DM Isolation
If the operator wants customers to DM the bot:
- `session.dmScope: "per-channel-peer"` — each user gets their own DM session
- Critical for multi-user setups to prevent context leaking between users

---

## 3. Shared vs. Isolated Memory

### The Memory Model
OpenClaw memory is plain Markdown files in the agent workspace:
- `MEMORY.md` — curated long-term memory (loaded in main session only)
- `memory/YYYY-MM-DD.md` — daily logs

### Shared Memory (Operator → All Tenants)
The **workspace files** (`AGENTS.md`, `SOUL.md`, `TOOLS.md`) are shared across all sessions/channels. This is the "shared memory" the client wants:
- Operator updates `SOUL.md` → all tenants see the new persona
- Operator updates `AGENTS.md` → all tenants get new behavior rules
- Operator adds a skill → all tenants (or scoped tenants) can use it

### Per-Tenant Isolation
Per-channel `systemPrompt` overrides workspace-level instructions. The operator can:
1. Set shared behavior in workspace files (applies to everyone)
2. Override per tenant via `systemPrompt` (applies to one channel only)

### What's NOT Isolated (Important)
- **Workspace files are shared** — all tenants on the same agent see the same `MEMORY.md`, `AGENTS.md`, etc.
- **Session transcripts are isolated** — each channel has its own `.jsonl` transcript
- **Memory search** (`memory_search`) searches workspace-wide memory, not per-channel. If the bot writes tenant-specific notes to `memory/`, all sessions can find them via semantic search.

### Multi-Agent Alternative (Stronger Isolation)
For customers who need **hard isolation** (separate memory, separate workspace, separate everything), use OpenClaw's multi-agent routing:

```json5
{
  agents: {
    list: [
      { id: "acme", workspace: "~/.openclaw/workspace-acme" },
      { id: "beta", workspace: "~/.openclaw/workspace-beta" },
    ],
  },
  bindings: [
    { agentId: "acme", match: { channel: "slack", peer: { kind: "channel", id: "C_ACME_123" } } },
    { agentId: "beta", match: { channel: "slack", peer: { kind: "channel", id: "C_BETA_456" } } },
  ],
}
```

This gives each tenant:
- Own workspace (own `MEMORY.md`, `SOUL.md`, etc.)
- Own session store
- Own auth profiles
- Complete data isolation

**Trade-off:** More resource usage (separate context per agent), more config complexity. Per-channel scoping is simpler for most use cases.

---

## 4. Access Control (RBAC)

### Current RBAC Primitives

| Level | Mechanism | What It Controls |
|-------|-----------|-----------------|
| **Channel** | `channels.slack.channels.<id>.allow` | Can the bot see this channel? |
| **User** | `channels.slack.channels.<id>.users` | Who can talk to the bot in this channel? |
| **Tools** | `channels.slack.channels.<id>.tools` | What tools can the bot use? |
| **Tools by Sender** | `channels.slack.channels.<id>.toolsBySender` | Per-user tool permissions |
| **Skills** | `channels.slack.channels.<id>.skills` | Which skills are available? |
| **DM** | `channels.slack.dmPolicy` | Who can DM the bot? |
| **Commands** | `commands.allowFrom` | Who can run slash commands? |

### The Operator Role
The operator (the client selling bot access) controls everything via `openclaw.json`. They're the only one who can:
- Add/remove channels (tenants)
- Set system prompts
- Manage user allowlists
- Enable/disable tools per channel
- Update shared workspace files

### What's Missing for True RBAC
OpenClaw doesn't have a built-in "role" concept beyond the owner. The dashboard would need to provide:
- **Operator view** — full config control
- **Tenant view** (future) — limited to their own channel's systemPrompt, maybe user management
- These roles live in the dashboard, not in OpenClaw

---

## 5. Slack-Specific Details

### Socket Mode vs HTTP
- **Socket Mode** (default): No public URL needed. Uses `appToken` (xapp-) + `botToken` (xoxb-). Simpler.
- **HTTP Mode**: Requires `botToken` + `signingSecret`. Needs a public endpoint.

For the dashboard use case, Socket Mode is simpler — no webhook URL management.

### Multi-Account Support
Slack supports multiple accounts (multiple bot tokens) on one gateway:
```json5
{
  channels: {
    slack: {
      accounts: {
        default: { botToken: "xoxb-...", appToken: "xapp-..." },
        premium: { botToken: "xoxb-...", appToken: "xapp-..." },
      },
    },
  },
}
```
Each account can be bound to a different agent. This enables running multiple bots for different customer tiers.

### Threading
- `replyToMode: "first"` — replies in threads (cleaner for shared channels)
- `thread.historyScope: "thread"` — thread context stays isolated
- `thread.initialHistoryLimit: 20` — how many existing thread messages to load

### Reactions & Actions
Per-channel actions are configurable:
```json5
actions: {
  reactions: true,
  messages: true,
  pins: true,
  memberInfo: true,
  emojiList: true,
}
```

---

## 6. Recommended Architecture for the Dashboard

### Tier 1: Per-Channel Scoping (Simple, Ship First)
One agent, multiple channels. Each channel = one tenant.

```
┌──────────────────────────────────────────────────┐
│                  OpenClaw Gateway                 │
│                  (Single Agent)                   │
│                                                   │
│  Shared: SOUL.md, AGENTS.md, workspace files     │
│                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ #acme       │ │ #beta       │ │ #gamma     │ │
│  │ systemPrompt│ │ systemPrompt│ │ systemPrompt│ │
│  │ users: [...] │ │ users: [...] │ │ users: [...]│ │
│  │ skills: [...] │ │ skills: [...] │ │ skills: [...]│ │
│  │ Session: iso│ │ Session: iso│ │ Session: iso│ │
│  └─────────────┘ └─────────────┘ └────────────┘ │
└──────────────────────────────────────────────────┘
```

**Dashboard manages:**
- CRUD channels in `channels.slack.channels`
- Per-channel `systemPrompt`, `users`, `skills`, `tools`
- Active/paused (via `allow: true/false`)
- Shared workspace files (SOUL.md, AGENTS.md)

### Tier 2: Multi-Agent (Stronger Isolation, Future)
Each tenant gets their own agent with separate workspace.

**Dashboard manages:**
- CRUD entries in `agents.list` + `bindings`
- Per-agent workspace files
- Per-agent model/tool configuration

### What the Dashboard API Needs
The existing `customer-admin` scaffold talks to the gateway via `config.get` / `config.patch`. This is the right approach. Specific API capabilities needed:

1. **List tenants** — parse `channels.slack.channels` from config
2. **Add tenant** — patch a new channel entry with systemPrompt, users, skills
3. **Edit tenant** — patch existing channel config
4. **Pause/activate** — toggle `allow: true/false` or `enabled: true/false`
5. **Edit system prompt** — patch `channels.slack.channels.<id>.systemPrompt`
6. **Manage users** — patch `channels.slack.channels.<id>.users`
7. **Edit shared config** — write to workspace files (SOUL.md, AGENTS.md)

### Config Hot-Reload
OpenClaw watches `openclaw.json` and hot-reloads channel config changes **without restart**. This means the dashboard can patch config and changes take effect immediately — no downtime for tenants.

---

## 7. Gaps & Recommendations

### What Works Today
- ✅ Per-channel system prompts
- ✅ Per-channel user allowlists
- ✅ Per-channel skill scoping
- ✅ Per-channel tool restrictions
- ✅ Session isolation per channel (automatic)
- ✅ Thread isolation (automatic)
- ✅ Config hot-reload (no restart needed)
- ✅ Gateway config API (`config.get` / `config.patch`)

### What Needs Dashboard Logic
- ⚠️ **Tenant CRUD** — No built-in tenant concept; dashboard maps channels → tenants
- ⚠️ **Usage monitoring** — No per-channel token/cost tracking in OpenClaw. Dashboard would need to parse session transcripts or add middleware
- ⚠️ **Per-tenant memory isolation** — Workspace memory is shared. Use systemPrompt scoping or upgrade to multi-agent for hard isolation
- ⚠️ **Role-based dashboard access** — OpenClaw has owner-only auth. Dashboard needs its own auth layer

### What Doesn't Exist Yet
- ❌ Per-channel cost limits / rate limiting (would need custom middleware)
- ❌ Per-channel analytics/reporting
- ❌ Tenant self-service portal
- ❌ Automated Slack channel creation (bot can create channels, but that's a Slack API operation, not OpenClaw config)

---

## 8. For Ada: Dashboard Data Model

Based on this research, here's the data model the dashboard should use:

```typescript
interface Tenant {
  id: string;                    // Slack channel ID (C_xxx)
  displayName: string;           // Human-readable name
  channelName: string;           // #channel-name
  status: 'active' | 'paused';  // maps to allow: true/false
  systemPrompt: string;          // per-tenant bot instructions
  users: string[];               // Slack user IDs allowed
  skills: string[];              // skill names allowed
  tools?: Record<string, any>;   // tool policy overrides
  requireMention: boolean;       // @mention required?
  createdAt?: string;            // dashboard metadata (not in OC config)
}

interface SharedConfig {
  soulMd: string;                // SOUL.md content
  agentsMd: string;              // AGENTS.md content  
  toolsMd: string;               // TOOLS.md content
}
```

All mutations go through `config.patch` → OpenClaw hot-reloads → zero downtime.

---

## References
- [OpenClaw Slack docs](https://docs.openclaw.ai/channels/slack)
- [Configuration Reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Multi-Agent Routing](https://docs.openclaw.ai/concepts/multi-agent)
- [Session Management](https://docs.openclaw.ai/concepts/session)
- [Memory](https://docs.openclaw.ai/concepts/memory)
- [Security](https://docs.openclaw.ai/gateway/security)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Existing scaffold: `customer-admin/`](../customer-admin/)
