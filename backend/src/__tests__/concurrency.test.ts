import { describe, expect, it } from "vitest";
import {
  createOverlapBarrier,
  createTestApp,
  getOrder as requestGetOrder,
  listPosTransactions,
  submitPayment,
  syncOrder,
} from "./helpers.js";

describe("3. Concurrent requests", () => {
  it("overlapping payment deliveries for a new order create one order and no accepted POS tx", async () => {
    const { app } = createTestApp();
    const orderId = "ord_concurrent_pay";

    const [first, second] = await Promise.all([
      submitPayment(app, { orderId, eventId: "evt_c1" }),
      submitPayment(app, { orderId, eventId: "evt_c2" }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 201]);
    expect(first.body.id).toBe(orderId);
    expect(second.body.id).toBe(orderId);

    // Settled state after both handlers finish (duplicate may observe mid-sync briefly).
    const settled = await requestGetOrder(app, orderId);
    expect(settled.body).toMatchObject({
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
      posTransactionRef: null,
    });
    expect(settled.body.eventIds).toEqual(
      expect.arrayContaining(["evt_c1", "evt_c2"]),
    );
    expect(settled.body.eventIds).toHaveLength(2);

    expect((await listPosTransactions(app)).body).toHaveLength(0);
  });

  it("overlapping sync retries share one accepted POS transaction (POS calls actually overlap)", async () => {
    const barrier = createOverlapBarrier(2);
    const { app, context } = createTestApp({
      pos: {
        beforeSubmit: async ({ attemptNumber }) => {
          // Only block accepting attempts so both retries meet inside POS.
          if (attemptNumber > 1) {
            await barrier.wait();
          }
        },
      },
    });

    const orderId = "ord_concurrent_sync";
    await submitPayment(app, { orderId, eventId: "evt_s0" });

    const syncPromise = Promise.all([
      syncOrder(app, orderId),
      syncOrder(app, orderId),
    ]);

    await barrier.ready;

    // Both accepting POS submits are in flight at the same time.
    expect(context.pos.getInFlightCount()).toBe(2);

    barrier.release();
    const [a, b] = await syncPromise;

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.posStatus).toBe("synced");
    expect(b.body.posStatus).toBe("synced");
    expect(a.body.posTransactionRef).toBe(b.body.posTransactionRef);

    const txs = await listPosTransactions(app);
    expect(txs.body).toHaveLength(1);
    expect(txs.body[0].orderReference).toBe(orderId);
  });

  it("overlapping payment deliveries after sync still leave a single POS transaction", async () => {
    const { app } = createTestApp();
    const orderId = "ord_concurrent_replay";

    await submitPayment(app, { orderId, eventId: "evt_r0" });
    await syncOrder(app, orderId);

    const [a, b] = await Promise.all([
      submitPayment(app, { orderId, eventId: "evt_r1" }),
      submitPayment(app, { orderId, eventId: "evt_r2" }),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.posTransactionRef).toBe("pos_tx_001");
    expect(b.body.posTransactionRef).toBe("pos_tx_001");
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });
});
