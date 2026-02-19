import { Context, Effect, Layer } from "effect"
import type { GatewayError } from "../errors/index.js"

export interface GatewayStatus {
  readonly running: boolean
  readonly uptime?: number
  readonly version?: string
}

export class GatewayService extends Context.Tag("GatewayService")<
  GatewayService,
  {
    readonly restart: () => Effect.Effect<void, GatewayError>
    readonly health: () => Effect.Effect<GatewayStatus, GatewayError>
  }
>() {}

// --- Mock implementation (for tests) ---

export const makeMockGatewayService = () => {
  const calls: Array<{ method: string; timestamp: number }> = []

  const service = GatewayService.of({
    restart: () =>
      Effect.sync(() => {
        calls.push({ method: "restart", timestamp: Date.now() })
      }),

    health: () =>
      Effect.succeed({
        running: true,
        uptime: 1000,
        version: "test",
      } satisfies GatewayStatus),
  })

  return { service, calls }
}

export const MockGatewayLayer = () => {
  const mock = makeMockGatewayService()
  return {
    layer: Layer.succeed(GatewayService, mock.service),
    calls: mock.calls,
  }
}
