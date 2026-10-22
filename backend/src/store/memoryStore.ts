import type { Order, PosTransaction } from "../types.js";

/**
 * Process-local in-memory state. Lost on restart; not shared across instances.
 * `posTransactions` is keyed by order reference (at most one accepted tx per order).
 */
export type MemoryStore = {
  orders: Map<string, Order>;
  posTransactions: Map<string, PosTransaction>;
};

export function createMemoryStore(): MemoryStore {
  return {
    orders: new Map(),
    posTransactions: new Map(),
  };
}
