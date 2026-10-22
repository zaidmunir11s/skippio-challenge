import { OrderLock } from "../sync/orderLock.js";
import type { MemoryStore } from "../store/memoryStore.js";
import type { PosPayload, PosTransaction } from "../types.js";

export class PosRejectedError extends Error {
  constructor(message = "POS rejected the transaction") {
    super(message);
    this.name = "PosRejectedError";
  }
}

export type PosSubmitContext = {
  payload: PosPayload;
  attemptNumber: number;
};

export type FakePosOptions = {
  /** Invoked after a submit starts, before accept/reject. Use for concurrency barriers. */
  beforeSubmit?: (ctx: PosSubmitContext) => Promise<void>;
};

export type PosAdapter = {
  /** @param attemptNumber 1-based attempt count for this order */
  submit: (payload: PosPayload, attemptNumber: number) => Promise<PosTransaction>;
  listTransactions: () => PosTransaction[];
  getInFlightCount: () => number;
};

/**
 * Fake POS: first attempt for an order always fails; later attempts accept.
 * Accepted transactions are keyed by order reference so duplicate accepts are O(1).
 */
export function createFakePos(
  store: MemoryStore,
  options: FakePosOptions = {},
): PosAdapter {
  let sequence = 0;
  let inFlight = 0;
  const acceptLock = new OrderLock();

  return {
    async submit(payload, attemptNumber) {
      inFlight += 1;
      try {
        if (options.beforeSubmit) {
          await options.beforeSubmit({ payload, attemptNumber });
        }

        if (attemptNumber <= 1) {
          throw new PosRejectedError("Simulated first-attempt POS failure");
        }

        // Serialize acceptance per order so overlapping submits cannot double-accept.
        return acceptLock.runExclusive(payload.orderReference, async () => {
          const existing = store.posTransactions.get(payload.orderReference);
          if (existing) {
            return existing;
          }

          sequence += 1;
          const transaction: PosTransaction = {
            transactionRef: `pos_tx_${sequence.toString().padStart(3, "0")}`,
            venueId: payload.venueId,
            orderReference: payload.orderReference,
            items: payload.items.map((item) => ({ ...item })),
            currency: payload.currency,
            total: payload.total,
            createdAt: new Date().toISOString(),
          };

          store.posTransactions.set(payload.orderReference, transaction);
          return transaction;
        });
      } finally {
        inFlight -= 1;
      }
    },

    listTransactions() {
      return [...store.posTransactions.values()];
    },

    getInFlightCount() {
      return inFlight;
    },
  };
}
