/**
 * One file per area, re-exported here. drizzle.config.ts globs the directory,
 * so a new file is picked up automatically — but add it here too, so
 * `import { ... } from "@/db/schema"` keeps working everywhere.
 */
export * from "./auth"
export * from "./categories"
export * from "./duplicates"
export * from "./materials"
export * from "./ops"
export * from "./search"
