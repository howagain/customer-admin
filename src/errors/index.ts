import { Data } from "effect"

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class TenantNotFoundError extends Data.TaggedError("TenantNotFoundError")<{
  readonly tenantId: string
}> {}

export class TenantAlreadyExistsError extends Data.TaggedError("TenantAlreadyExistsError")<{
  readonly tenantId: string
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

export class GatewayError extends Data.TaggedError("GatewayError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class StorageReadError extends Data.TaggedError("StorageReadError")<{
  readonly key: string
  readonly cause?: unknown
}> {}

export class StorageWriteError extends Data.TaggedError("StorageWriteError")<{
  readonly key: string
  readonly cause?: unknown
}> {}
