import { describe, expect, it } from "vitest";
import {
  createSyncedOrder,
  createTestApp,
  getOrder,
  listPosTransactions,
  submitPayment,
  syncOrder,
} from "./helpers.js";

describe("1. Valid payment event", () => {
  it("creates a paid order and attempts POS sync (first attempt fails before accept)", async () => {
    const { app } = createTestApp();

    const response = await submitPayment(app, { orderId: "ord_valid" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: "ord_valid",
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
      posTransactionRef: null,
      total: 2650,
    });

    const txs = await listPosTransactions(app);
    expect(txs.status).toBe(200);
    expect(txs.body).toHaveLength(0);
  });

  it("produces exactly one accepted POS transaction when sync succeeds", async () => {
    const { app } = createTestApp();

    const { sync } = await createSyncedOrder(app, { orderId: "ord_ok" });

    expect(sync.status).toBe(200);
    expect(sync.body).toMatchObject({
      paymentStatus: "paid",
      posStatus: "synced",
      posAttemptCount: 2,
      posTransactionRef: "pos_tx_001",
    });

    const txs = await listPosTransactions(app);
    expect(txs.body).toHaveLength(1);
    expect(txs.body[0]).toMatchObject({
      transactionRef: "pos_tx_001",
      orderReference: "ord_ok",
      total: 2650,
      currency: "EUR",
    });
  });
});

describe("2. Duplicate deliveries", () => {
  it("repeated event ID does not duplicate POS side effects", async () => {
    const { app } = createTestApp();
    const orderId = "ord_dup_same";

    await createSyncedOrder(app, { orderId, eventId: "evt_same" });
    const again = await submitPayment(app, { orderId, eventId: "evt_same" });

    expect(again.status).toBe(200);
    expect(again.body.eventIds).toEqual(["evt_same"]);
    expect(again.body.posTransactionRef).toBe("pos_tx_001");

    const txs = await listPosTransactions(app);
    expect(txs.body).toHaveLength(1);
  });

  it("different event ID for matching order does not duplicate order or transaction", async () => {
    const { app } = createTestApp();
    const orderId = "ord_dup_diff";

    await createSyncedOrder(app, { orderId, eventId: "evt_a" });
    const again = await submitPayment(app, { orderId, eventId: "evt_b" });

    expect(again.status).toBe(200);
    expect(again.body.eventIds).toEqual(["evt_a", "evt_b"]);
    expect(again.body.posAttemptCount).toBe(2);

    const txs = await listPosTransactions(app);
    expect(txs.body).toHaveLength(1);

    const lookup = await getOrder(app, orderId);
    expect(lookup.body.id).toBe(orderId);
  });

  it("conflicting order data is rejected without mutating existing records", async () => {
    const { app } = createTestApp();
    const orderId = "ord_conflict";

    await createSyncedOrder(app, { orderId, eventId: "evt_orig" });
    const before = await getOrder(app, orderId);
    const txsBefore = await listPosTransactions(app);

    const conflict = await submitPayment(app, {
      orderId,
      eventId: "evt_conflict",
      items: [{ productId: "salad", quantity: 1, price: 500 }],
      total: 500,
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("ORDER_CONFLICT");

    const after = await getOrder(app, orderId);
    expect(after.body).toEqual(before.body);

    const txsAfter = await listPosTransactions(app);
    expect(txsAfter.body).toEqual(txsBefore.body);
  });
});

describe("4. Failure and retry", () => {
  it("first POS attempt fails, payment stays paid, retry succeeds, later retry is a no-op", async () => {
    const { app } = createTestApp();
    const orderId = "ord_retry";

    const payment = await submitPayment(app, { orderId });
    expect(payment.body).toMatchObject({
      paymentStatus: "paid",
      posStatus: "failed",
      posAttemptCount: 1,
      posTransactionRef: null,
    });
    expect((await listPosTransactions(app)).body).toHaveLength(0);

    const retry = await syncOrder(app, orderId);
    expect(retry.body).toMatchObject({
      paymentStatus: "paid",
      posStatus: "synced",
      posAttemptCount: 2,
      posTransactionRef: "pos_tx_001",
    });
    expect((await listPosTransactions(app)).body).toHaveLength(1);

    const again = await syncOrder(app, orderId);
    expect(again.status).toBe(200);
    expect(again.body.posTransactionRef).toBe("pos_tx_001");
    expect(again.body.posAttemptCount).toBe(2);
    expect((await listPosTransactions(app)).body).toHaveLength(1);
  });
});
