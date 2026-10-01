/**
 * Re-exported so `apps/api` keeps one import path for it. The definition lives in
 * `@repo/types/http`, because `apps/web` builds the same response shape and the two
 * must not drift.
 */
export { HttpMethod } from "@repo/types/http";
