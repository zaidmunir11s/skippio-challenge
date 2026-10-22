import { describe, expect, it } from "vitest";
import {
  createSyncedOrder,
  createTestApp,
  getOrder,
  listPosTransactions,
  refundOrder,
  submitPayment,
  syncOrder,
} from "./helpers.js";

describe("6. Refunds", () => {
  it("records the full refund amount and status", async () => {
    const { app } = createTestApp();
    const orderId = "ord_refund_ok";

    await createSyncedOrder(app, { orderId });
    const response = await refundOrder(app, orderId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      paymentStatus: "refunded",
      refundedAmount: 2650,
      posStatus: "synced",
      posTransactionRef: "pos_tx_001",
    });
  });

  it("duplicate refunds do not refund twice", async () => {
    const { app } = createTestApp();
    const orderId = "ord_refund_dup";

    await createSyncedOrder(app, { orderId });
    const first = await refundOrder(app, orderId);
    const second = await refundOrder(app, orderId);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.refundedAmount).toBe(2650);
    expect(second.body.paymentStatus).toBe("refunded");
  });

  it("concurrent refunds do not refund twice", async () => {
    const { app } = createTestApp();
    const orderId = "ord_refund_race";

    await createSyncedOrder(app, { orderId });
    const [a, b] = await Promise.all([
      refundOrder(app, orderId),
      refundOrder(app, orderId),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.refundedAmount).toBe(2650);
    expect(b.body.refundedAmount).toBe(2650);
    expect(a.body.paymentStatus).toBe("refunded");
    expect(b.body.paymentStatus).toBe("refunded");
  });

  it("repeated payment events preserve refunded status", async () => {
    const { app } = createTestApp();
    const orderId = "ord_refund_preserve";

    await createSyncedOrder(app, { orderId, eventId: "evt_p0" });
    await refundOrder(app, orderId);

    const replay = await submitPayment(app, { orderId, eventId: "evt_p1" });

    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({
      paymentStatus: "refunded",
      refundedAmount: 2650,
      posStatus: "synced",
    });
    expect(replay.body.eventIds).toEqual(["evt_p0", "evt_p1"]);
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });

  it("rejects unknown and ineligible orders", async () => {
    const { app } = createTestApp();

    const unknown = await refundOrder(app, "ord_missing");
    expect(unknown.status).toBe(404);

    await submitPayment(app, { orderId: "ord_not_synced" });
    const ineligible = await refundOrder(app, "ord_not_synced");
    expect(ineligible.status).toBe(409);
    expect(ineligible.body.error.code).toBe("ORDER_INELIGIBLE");

    const stillFailed = await getOrder(app, "ord_not_synced");
    expect(stillFailed.body.paymentStatus).toBe("paid");
    expect(stillFailed.body.posStatus).toBe("failed");
    expect(stillFailed.body.refundedAmount).toBeNull();
  });

  it("rejects sync after refund", async () => {
    const { app } = createTestApp();
    const orderId = "ord_refund_nosync";

    await createSyncedOrder(app, { orderId });
    await refundOrder(app, orderId);

    const sync = await syncOrder(app, orderId);
    expect(sync.status).toBe(409);
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });
});
