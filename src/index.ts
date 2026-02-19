// Service layer — Effect-TS with DI
export { ConfigService, InMemoryConfigLayer, makeInMemoryConfigService } from "./services/ConfigService.js"
export type { OpenClawConfig, TenantConfig, TenantChannelConfig, TenantToolPolicy } from "./services/ConfigService.js"

export { GatewayService, MockGatewayLayer, makeMockGatewayService } from "./services/GatewayService.js"
export type { GatewayStatus } from "./services/GatewayService.js"

export { StorageService, InMemoryStorageLayer, JsonFileStorageLayer, makeInMemoryStorageService, makeJsonFileStorageService } from "./services/StorageService.js"

export {
  listTenants,
  getTenant,
  addTenant,
  updateTenant,
  removeTenant,
  pauseTenant,
  activateTenant,
  DEFAULT_TOOL_DENY,
} from "./services/SlackChannelService.js"

export {
  ConfigReadError,
  ConfigWriteError,
  TenantNotFoundError,
  TenantAlreadyExistsError,
  ValidationError,
  GatewayError,
  StorageReadError,
  StorageWriteError,
} from "./errors/index.js"
