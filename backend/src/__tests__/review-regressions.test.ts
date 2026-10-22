import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  buildPaymentEvent,
  createOverlapBarrier,
  createSyncedOrder,
  createTestApp,
  getOrder,
  listPosTransactions,
  refundOrder,
  submitPayment,
  syncOrder,
} from "./helpers.js";

describe("Review regressions", () => {
  it("sync after success does not call POS again or bump attempt count", async () => {
    let submitCount = 0;
    const { app } = createTestApp({
      pos: {
        beforeSubmit: async () => {
          submitCount += 1;
        },
      },
    });
    const orderId = "ord_reg_nosync";

    await createSyncedOrder(app, { orderId });
    expect(submitCount).toBe(2); // fail + accept

    const again = await syncOrder(app, orderId);
    expect(again.status).toBe(200);
    expect(again.body.posAttemptCount).toBe(2);
    expect(again.body.posTransactionRef).toBe("pos_tx_001");
    expect(submitCount).toBe(2);
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });

  it("failed POS attempts leave zero accepted transactions", async () => {
    const { app } = createTestApp();
    const response = await submitPayment(app, { orderId: "ord_reg_fail" });

    expect(response.body.posStatus).toBe("failed");
    expect(response.body.posTransactionRef).toBeNull();
    expect(response.body.paymentStatus).toBe("paid");
    expect((await listPosTransactions(app)).body).toHaveLength(0);
  });

  it("concurrent refund and payment replay preserve a single refund", async () => {
    const { app } = createTestApp();
    const orderId = "ord_reg_refund_race";

    await createSyncedOrder(app, { orderId, eventId: "evt_0" });

    const [refund, replay] = await Promise.all([
      refundOrder(app, orderId),
      submitPayment(app, { orderId, eventId: "evt_replay" }),
    ]);

    expect(refund.status).toBe(200);
    expect(replay.status).toBe(200);

    const settled = await getOrder(app, orderId);
    expect(settled.body.paymentStatus).toBe("refunded");
    expect(settled.body.refundedAmount).toBe(2650);
    expect(settled.body.eventIds).toEqual(
      expect.arrayContaining(["evt_0", "evt_replay"]),
    );
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });

  it("overlapping payment POS and sync produce one accepted transaction", async () => {
    const barrier = createOverlapBarrier(2);
    const { app, context } = createTestApp({
      pos: {
        beforeSubmit: async () => {
          await barrier.wait();
        },
      },
    });
    const orderId = "ord_reg_pay_sync";

    const paymentPromise = submitPayment(app, { orderId, eventId: "evt_ps" });

    // Wait until the order exists (created before POS I/O), then overlap sync.
    for (let i = 0; i < 50; i += 1) {
      const lookup = await getOrder(app, orderId);
      if (lookup.status === 200) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const syncPromise = syncOrder(app, orderId);
    await barrier.ready;
    expect(context.pos.getInFlightCount()).toBe(2);
    barrier.release();

    const [payment, sync] = await Promise.all([paymentPromise, syncPromise]);
    expect(payment.status).toBe(201);
    expect(sync.status).toBe(200);

    const settled = await getOrder(app, orderId);
    expect(settled.body.paymentStatus).toBe("paid");
    expect(settled.body.posStatus).toBe("synced");
    expect(settled.body.posTransactionRef).toBeTruthy();
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });

  it("rejects malformed JSON with 400", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/payment-events")
      .set("Content-Type", "application/json")
      .send('{"eventId":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects unsafe integer line totals", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/payment-events")
      .send(
        buildPaymentEvent({
          orderId: "ord_reg_unsafe",
          items: [
            {
              productId: "huge",
              quantity: Number.MAX_SAFE_INTEGER,
              price: 2,
            },
          ],
          total: Number.MAX_SAFE_INTEGER * 2,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
