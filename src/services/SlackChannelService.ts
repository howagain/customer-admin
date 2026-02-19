import { Effect } from "effect"
import { ConfigService, type TenantConfig, type TenantChannelConfig, type OpenClawConfig } from "./ConfigService.js"
import { GatewayService } from "./GatewayService.js"
import {
  TenantNotFoundError,
  TenantAlreadyExistsError,
  ValidationError,
  type ConfigReadError,
} from "../errors/index.js"

// --- Default safe tool deny list ---

export const DEFAULT_TOOL_DENY = ["exec", "write", "edit", "gateway", "cron", "message"] as const

// --- Validation ---

const validateTenantId = (id: string) => {
  if (!id || id.trim().length === 0) {
    return Effect.fail(new ValidationError({ field: "id", message: "Tenant ID cannot be empty" }))
  }
  if (/[\/\\\.]{2,}|\.\./.test(id)) {
    return Effect.fail(new ValidationError({ field: "id", message: "Tenant ID contains path traversal characters" }))
  }
  if (id.length > 255) {
    return Effect.fail(new ValidationError({ field: "id", message: "Tenant ID too long (max 255)" }))
  }
  return Effect.succeed(id.trim())
}

// --- Helpers ---

const getSlackChannels = (config: OpenClawConfig): Record<string, TenantChannelConfig> =>
  (config.channels?.slack?.channels as Record<string, TenantChannelConfig>) ?? {}

const setSlackChannels = (
  config: OpenClawConfig,
  channels: Record<string, TenantChannelConfig>
): OpenClawConfig => ({
  ...config,
  channels: {
    ...config.channels,
    slack: {
      ...config.channels?.slack,
      channels: channels,
    },
  },
})

const channelToTenant = (id: string, ch: TenantChannelConfig): TenantConfig => ({
  id,
  name: ch.name ?? id,
  channelName: `#client-${id}`,
  systemPrompt: ch.systemPrompt ?? "",
  tools: ch.tools ?? { deny: [...DEFAULT_TOOL_DENY] },
  users: ch.users ?? [],
  enabled: ch.enabled !== false,
  paid: ch.paid === true,
  groupPolicy: ch.groupPolicy === "open" ? "open" : "allowlist",
})

const tenantToChannel = (tenant: Partial<TenantConfig>): TenantChannelConfig => ({
  name: tenant.name,
  systemPrompt: tenant.systemPrompt,
  tools: tenant.tools ?? { deny: [...DEFAULT_TOOL_DENY] },
  users: tenant.users ? [...tenant.users] : [],
  enabled: tenant.enabled ?? true,
  paid: tenant.paid ?? false,
  groupPolicy: tenant.groupPolicy ?? "allowlist",
})

// --- CRUD operations ---
// Each operation composes ConfigService + GatewayService via Effect.gen

export const listTenants = () =>
  Effect.gen(function* () {
    const config = yield* ConfigService
    const currentConfig = yield* config.read()
    const channels = getSlackChannels(currentConfig)
    return Object.entries(channels).map(([id, ch]) => channelToTenant(id, ch))
  }) satisfies Effect.Effect<ReadonlyArray<TenantConfig>, ConfigReadError, ConfigService>

export const getTenant = (tenantId: string) =>
  Effect.gen(function* () {
    const validId = yield* validateTenantId(tenantId)
    const config = yield* ConfigService
    const currentConfig = yield* config.read()
    const channels = getSlackChannels(currentConfig)
    const ch = channels[validId]
    if (!ch) {
      return yield* Effect.fail(new TenantNotFoundError({ tenantId: validId }))
    }
    return channelToTenant(validId, ch)
  })

export const addTenant = (tenantId: string, data: Partial<TenantConfig>) =>
  Effect.gen(function* () {
    const validId = yield* validateTenantId(tenantId)
    const config = yield* ConfigService
    const gateway = yield* GatewayService
    const currentConfig = yield* config.read()
    const channels = getSlackChannels(currentConfig)

    if (channels[validId]) {
      return yield* Effect.fail(new TenantAlreadyExistsError({ tenantId: validId }))
    }

    const newChannel = tenantToChannel({ ...data, enabled: data.enabled ?? true })
    const updated = setSlackChannels(currentConfig, { ...channels, [validId]: newChannel })

    yield* config.write(updated)
    yield* gateway.restart()

    return channelToTenant(validId, newChannel)
  })

export const updateTenant = (tenantId: string, data: Partial<TenantConfig>) =>
  Effect.gen(function* () {
    const validId = yield* validateTenantId(tenantId)
    const config = yield* ConfigService
    const gateway = yield* GatewayService
    const currentConfig = yield* config.read()
    const channels = getSlackChannels(currentConfig)

    const existing = channels[validId]
    if (!existing) {
      return yield* Effect.fail(new TenantNotFoundError({ tenantId: validId }))
    }

    const merged: TenantChannelConfig = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      ...(data.tools !== undefined && { tools: data.tools }),
      ...(data.users !== undefined && { users: [...data.users] }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.paid !== undefined && { paid: data.paid }),
      ...(data.groupPolicy !== undefined && { groupPolicy: data.groupPolicy }),
    }

    const updated = setSlackChannels(currentConfig, { ...channels, [validId]: merged })

    yield* config.write(updated)
    yield* gateway.restart()

    return channelToTenant(validId, merged)
  })

export const removeTenant = (tenantId: string) =>
  Effect.gen(function* () {
    const validId = yield* validateTenantId(tenantId)
    const config = yield* ConfigService
    const gateway = yield* GatewayService
    const currentConfig = yield* config.read()
    const channels = getSlackChannels(currentConfig)

    if (!channels[validId]) {
      return yield* Effect.fail(new TenantNotFoundError({ tenantId: validId }))
    }

    const { [validId]: _removed, ...remaining } = channels
    const updated = setSlackChannels(currentConfig, remaining)

    yield* config.write(updated)
    yield* gateway.restart()
  })

export const pauseTenant = (tenantId: string) =>
  updateTenant(tenantId, { enabled: false })

export const activateTenant = (tenantId: string) =>
  updateTenant(tenantId, { enabled: true })
