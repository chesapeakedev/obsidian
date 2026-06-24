import type { Cache } from "./cache/quickCache.ts";

/** Shared mutable scope for server-side cache wiring between modules. */
export const serviceScope: { cache?: Cache } = {};
