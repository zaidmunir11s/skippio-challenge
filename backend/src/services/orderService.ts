import { AppError } from "../errors.js";
import { PosRejectedError, type PosAdapter } from "../pos/fakePos.js";
import type { MemoryStore } from "../store/memoryStore.js";
import { OrderLock } from "../sync/orderLock.js";
import {
  orderDataMatches,
  toOrderView,
  type Order,
  type OrderView,
  type PosPayload,
} from "../types.js";
import type { PaymentEventInput } from "../validation/paymentEvent.js";

export type OrderService = {
  handlePaymentEvent: (
    event: PaymentEventInput,
  ) => Promise<{ created: boolean; order: OrderView }>;
  getOrder: (orderId: string) => OrderView;
  syncOrder: (orderId: string) => Promise<OrderView>;
  refundOrder: (orderId: string) => Promise<OrderView>;
};

/**
 * Order-level mutex covers state transitions only.
 * POS I/O runs outside that lock so concurrent callers can overlap in the adapter;
 * acceptance is still idempotent (order re-check + POS per-order accept lock).
 */
export function createOrderService(
  store: MemoryStore,
  pos: PosAdapter,
  lock = new OrderLock(),
): OrderService {
  function requireOrder(orderId: string): Order {
    const order = store.orders.get(orderId);
    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", `Order ${orderId} not found`);
    }
    return order;
  }

  async function runPosAttempt(orderId: string): Promise<OrderView> {
    let attemptNumber: number | null = null;
    let payload: PosPayload | null = null;

    await lock.runExclusive(orderId, async () => {
      const order = requireOrder(orderId);

      if (order.paymentStatus === "refunded") {
        throw new AppError(
          409,
          "ORDER_INELIGIBLE",
          `Order ${orderId} is refunded and cannot be synced`,
        );
      }

      if (order.posStatus === "synced" && order.posTransactionRef) {
        return;
      }

      order.posAttemptCount += 1;
      attemptNumber = order.posAttemptCount;
      payload = {
        venueId: order.venueId,
        orderReference: order.id,
        items: order.items.map((item) => ({ ...item })),
        currency: order.currency,
        total: order.total,
      };
    });

    if (attemptNumber === null || payload === null) {
      return toOrderView(requireOrder(orderId));
    }

    try {
      // Intentionally outside the order lock so overlapping syncs can enter POS together.
      const tx = await pos.submit(payload, attemptNumber);

      await lock.runExclusive(orderId, async () => {
        const order = requireOrder(orderId);
        // Do not revive or rewrite a refunded order from a late POS response.
        if (order.paymentStatus === "refunded") {
          return;
        }
        if (order.posStatus === "synced" && order.posTransactionRef) {
          return;
        }
        order.posStatus = "synced";
        order.posTransactionRef = tx.transactionRef;
      });
    } catch (error) {
      if (error instanceof PosRejectedError) {
        await lock.runExclusive(orderId, async () => {
          const order = requireOrder(orderId);
          // A peer may have synced (or refunded) while this attempt was in flight.
          if (order.posStatus !== "synced" && order.paymentStatus !== "refunded") {
            order.posStatus = "failed";
          }
        });
      } else {
        throw error;
      }
    }

    return toOrderView(requireOrder(orderId));
  }

  return {
    async handlePaymentEvent(event) {
      let created = false;

      await lock.runExclusive(event.order.id, async () => {
        const existing = store.orders.get(event.order.id);

        if (existing) {
          if (
            !orderDataMatches(existing, {
              venueId: event.order.venueId,
              currency: event.order.currency,
              items: event.order.items,
              total: event.order.total,
            })
          ) {
            throw new AppError(
              409,
              "ORDER_CONFLICT",
              `Order ${event.order.id} already exists with different data`,
            );
          }

          if (!existing.eventIds.includes(event.eventId)) {
            existing.eventIds.push(event.eventId);
          }

          return;
        }

        const order: Order = {
          id: event.order.id,
          venueId: event.order.venueId,
          currency: event.order.currency,
          items: event.order.items.map((item) => ({ ...item })),
          total: event.order.total,
          paymentStatus: "paid",
          posStatus: "pending",
          posAttemptCount: 0,
          posTransactionRef: null,
          refundedAmount: null,
          eventIds: [event.eventId],
        };

        store.orders.set(order.id, order);
        created = true;
      });

      if (!created) {
        return {
          created: false,
          order: toOrderView(requireOrder(event.order.id)),
        };
      }

      const order = await runPosAttempt(event.order.id);
      return { created: true, order };
    },

    getOrder(orderId) {
      return toOrderView(requireOrder(orderId));
    },

    async syncOrder(orderId) {
      return runPosAttempt(orderId);
    },

    async refundOrder(orderId) {
      return lock.runExclusive(orderId, async () => {
        const order = requireOrder(orderId);

        if (order.paymentStatus === "refunded") {
          return toOrderView(order);
        }

        if (order.paymentStatus !== "paid" || order.posStatus !== "synced") {
          throw new AppError(
            409,
            "ORDER_INELIGIBLE",
            `Order ${orderId} must be paid and POS-synced before refund`,
          );
        }

        order.paymentStatus = "refunded";
        order.refundedAmount = order.total;
        return toOrderView(order);
      });
    },
  };
}
