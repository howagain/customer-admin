import { Context, Effect, Layer } from "effect"
import type { ConfigReadError, ConfigWriteError } from "../errors/index.js"

// --- Domain types ---

export interface TenantToolPolicy {
  readonly deny: ReadonlyArray<string>
}

export interface TenantConfig {
  readonly id: string
  readonly name: string
  readonly channelName: string
  readonly systemPrompt: string
  readonly tools: TenantToolPolicy
  readonly users: ReadonlyArray<string>
  readonly enabled: boolean
  readonly paid: boolean
  readonly groupPolicy: "allowlist" | "open"
}

export interface OpenClawConfig {
  readonly channels: {
    readonly slack?: {
      readonly channels?: Record<string, TenantChannelConfig>
      readonly [key: string]: unknown
    }
    readonly [key: string]: unknown
  }
  readonly [key: string]: unknown
}

export interface TenantChannelConfig {
  readonly name?: string
  readonly systemPrompt?: string
  readonly tools?: TenantToolPolicy
  readonly users?: ReadonlyArray<string>
  readonly enabled?: boolean
  readonly paid?: boolean
  readonly groupPolicy?: "allowlist" | "open"
  readonly [key: string]: unknown
}

// --- Service interface ---

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    readonly read: () => Effect.Effect<OpenClawConfig, ConfigReadError>
    readonly write: (config: OpenClawConfig) => Effect.Effect<void, ConfigWriteError>
    readonly patch: (patch: Record<string, unknown>) => Effect.Effect<void, ConfigWriteError>
  }
>() {}

// --- In-memory implementation (for tests) ---

export const makeInMemoryConfigService = (initial: OpenClawConfig) => {
  let current = structuredClone(initial) as OpenClawConfig

  return ConfigService.of({
    read: () => Effect.succeed(structuredClone(current) as OpenClawConfig),

    write: (config) =>
      Effect.sync(() => {
        current = structuredClone(config) as OpenClawConfig
      }),

    patch: (patchData) =>
      Effect.sync(() => {
        current = deepMerge(current, patchData) as OpenClawConfig
      }),
  })
}

export const InMemoryConfigLayer = (initial: OpenClawConfig) =>
  Layer.succeed(ConfigService, makeInMemoryConfigService(initial))

// --- Helpers ---

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue
    const sv = source[key]
    const tv = target[key]
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>)
    } else {
      result[key] = sv
    }
  }
  return result
}
