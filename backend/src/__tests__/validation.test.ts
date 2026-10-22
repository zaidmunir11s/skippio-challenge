import { describe, expect, it } from "vitest";
import {
  buildPaymentEvent,
  createSyncedOrder,
  createTestApp,
  getOrder,
  listPosTransactions,
  submitPayment,
} from "./helpers.js";
import request from "supertest";

describe("5. Validation", () => {
  it("rejects invalid totals without creating records", async () => {
    const { app } = createTestApp();

    const response = await submitPayment(app, {
      orderId: "ord_bad_total",
      total: 999,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect((await getOrder(app, "ord_bad_total")).status).toBe(404);
    expect((await listPosTransactions(app)).body).toHaveLength(0);
  });

  it("rejects non-positive quantities and negative amounts", async () => {
    const { app } = createTestApp();

    const zeroQty = await request(app)
      .post("/payment-events")
      .send(
        buildPaymentEvent({
          orderId: "ord_bad_qty",
          items: [{ productId: "x", quantity: 0, price: 100 }],
          total: 0,
        }),
      );
    expect(zeroQty.status).toBe(400);

    const negativePrice = await request(app)
      .post("/payment-events")
      .send(
        buildPaymentEvent({
          orderId: "ord_bad_price",
          items: [{ productId: "x", quantity: 1, price: -1 }],
          total: -1,
        }),
      );
    expect(negativePrice.status).toBe(400);

    expect((await listPosTransactions(app)).body).toHaveLength(0);
  });

  it("rejects empty identifiers", async () => {
    const { app } = createTestApp();

    const emptyEvent = await request(app)
      .post("/payment-events")
      .send(buildPaymentEvent({ eventId: "  ", orderId: "ord_empty" }));
    expect(emptyEvent.status).toBe(400);

    const emptyOrder = await request(app)
      .post("/payment-events")
      .send(buildPaymentEvent({ orderId: "" }));
    expect(emptyOrder.status).toBe(400);
  });

  it("rejects unsupported event types and currencies", async () => {
    const { app } = createTestApp();

    const badType = await request(app)
      .post("/payment-events")
      .send(buildPaymentEvent({ type: "payment.failed", orderId: "ord_type" }));
    expect(badType.status).toBe(400);

    const badCurrency = await request(app)
      .post("/payment-events")
      .send({
        eventId: "evt_cur",
        type: "payment.succeeded",
        order: {
          id: "ord_cur",
          venueId: "venue_001",
          currency: "USD",
          items: [{ productId: "x", quantity: 1, price: 100 }],
          total: 100,
        },
      });
    expect(badCurrency.status).toBe(400);
  });

  it("rejects conflicting data without mutating existing order or POS txs", async () => {
    const { app } = createTestApp();
    const orderId = "ord_val_conflict";

    await createSyncedOrder(app, { orderId });
    const before = await getOrder(app, orderId);
    const txsBefore = await listPosTransactions(app);

    const conflict = await submitPayment(app, {
      orderId,
      eventId: "evt_other",
      venueId: "venue_other",
    });

    expect(conflict.status).toBe(409);

    const after = await getOrder(app, orderId);
    expect(after.body).toEqual(before.body);
    expect((await listPosTransactions(app)).body).toEqual(txsBefore.body);
  });
});
