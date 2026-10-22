import type { Express } from "express";
import request from "supertest";
import { createApp } from "../app.js";
import {
  createAppContext,
  type CreateAppContextOptions,
} from "../createAppContext.js";
import type { PaymentEventInput } from "../validation/paymentEvent.js";

export function buildPaymentEvent(
  overrides: {
    eventId?: string;
    orderId?: string;
    venueId?: string;
    currency?: "EUR";
    items?: PaymentEventInput["order"]["items"];
    total?: number;
    type?: string;
  } = {},
): Record<string, unknown> {
  const items = overrides.items ?? [
    { productId: "burger", quantity: 2, price: 1200 },
    { productId: "water", quantity: 1, price: 250 },
  ];
  const total =
    overrides.total ??
    items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  return {
    eventId: overrides.eventId ?? "evt_001",
    type: overrides.type ?? "payment.succeeded",
    order: {
      id: overrides.orderId ?? "ord_001",
      venueId: overrides.venueId ?? "venue_001",
      currency: overrides.currency ?? "EUR",
      items,
      total,
    },
  };
}

export function createTestApp(options: CreateAppContextOptions = {}) {
  const context = createAppContext(options);
  const app = createApp(context);
  return { app, context };
}

export async function submitPayment(
  app: Express,
  overrides?: Parameters<typeof buildPaymentEvent>[0],
) {
  return request(app)
    .post("/payment-events")
    .send(buildPaymentEvent(overrides));
}

export async function syncOrder(app: Express, orderId: string) {
  return request(app).post(`/orders/${orderId}/sync`);
}

export async function refundOrder(app: Express, orderId: string) {
  return request(app).post(`/orders/${orderId}/refund`);
}

export async function getOrder(app: Express, orderId: string) {
  return request(app).get(`/orders/${orderId}`);
}

export async function listPosTransactions(app: Express) {
  return request(app).get("/debug/pos-transactions");
}

/** Payment (first POS fails) then sync (accepts). */
export async function createSyncedOrder(
  app: Express,
  overrides?: Parameters<typeof buildPaymentEvent>[0],
) {
  const orderId = overrides?.orderId ?? "ord_001";
  const payment = await submitPayment(app, overrides);
  const sync = await syncOrder(app, orderId);
  return { payment, sync, orderId };
}

/** Barrier that resolves once `expected` waiters have arrived. */
export function createOverlapBarrier(expected: number) {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  let notifyReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    notifyReady = resolve;
  });

  return {
    ready,
    release: () => release(),
    wait: async () => {
      arrived += 1;
      if (arrived === expected) {
        notifyReady();
      }
      await gate;
    },
  };
}
