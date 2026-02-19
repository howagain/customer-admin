import { Context, Effect, Layer } from "effect"
import type { StorageReadError, StorageWriteError } from "../errors/index.js"

// --- Plugin interface for data persistence ---
// JSON file for demo, Convex for prod — same interface

export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    readonly get: <T>(key: string) => Effect.Effect<T | null, StorageReadError>
    readonly set: <T>(key: string, value: T) => Effect.Effect<void, StorageWriteError>
    readonly delete: (key: string) => Effect.Effect<void, StorageWriteError>
    readonly list: (prefix?: string) => Effect.Effect<ReadonlyArray<string>, StorageReadError>
  }
>() {}

// --- In-memory implementation (for tests) ---

export const makeInMemoryStorageService = (initial?: Record<string, unknown>) => {
  const store = new Map<string, unknown>(
    initial ? Object.entries(initial) : []
  )

  return StorageService.of({
    get: <T>(key: string) =>
      Effect.succeed((store.get(key) as T) ?? null),

    set: <T>(key: string, value: T) =>
      Effect.sync(() => {
        store.set(key, value)
      }),

    delete: (key: string) =>
      Effect.sync(() => {
        store.delete(key)
      }),

    list: (prefix?: string) =>
      Effect.succeed(
        [...store.keys()].filter((k) => !prefix || k.startsWith(prefix))
      ),
  })
}

export const InMemoryStorageLayer = (initial?: Record<string, unknown>) =>
  Layer.succeed(StorageService, makeInMemoryStorageService(initial))

// --- JSON file implementation (for demo) ---
// Uses Node.js fs — for demo/local dev, not production

export const makeJsonFileStorageService = (filePath: string) => {
  const readStore = (): Record<string, unknown> => {
    try {
      // Dynamic import would be used in real impl
      // For scaffold: placeholder that shows the shape
      const fs = require("fs")
      const data = fs.readFileSync(filePath, "utf-8")
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  const writeStore = (store: Record<string, unknown>): void => {
    const fs = require("fs")
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2))
  }

  return StorageService.of({
    get: <T>(key: string) =>
      Effect.try({
        try: () => {
          const store = readStore()
          return (store[key] as T) ?? null
        },
        catch: (e) => new (require("../errors/index.js").StorageReadError)({ key, cause: e }),
      }),

    set: <T>(key: string, value: T) =>
      Effect.try({
        try: () => {
          const store = readStore()
          store[key] = value
          writeStore(store)
        },
        catch: (e) => new (require("../errors/index.js").StorageWriteError)({ key, cause: e }),
      }),

    delete: (key: string) =>
      Effect.try({
        try: () => {
          const store = readStore()
          delete store[key]
          writeStore(store)
        },
        catch: (e) => new (require("../errors/index.js").StorageWriteError)({ key, cause: e }),
      }),

    list: (prefix?: string) =>
      Effect.try({
        try: () => {
          const store = readStore()
          return Object.keys(store).filter((k) => !prefix || k.startsWith(prefix))
        },
        catch: (e) => new (require("../errors/index.js").StorageReadError)({ key: prefix ?? "*", cause: e }),
      }),
  })
}

export const JsonFileStorageLayer = (filePath: string) =>
  Layer.succeed(StorageService, makeJsonFileStorageService(filePath))
