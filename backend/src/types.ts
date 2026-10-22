export type PaymentStatus = "paid" | "refunded";
export type PosStatus = "pending" | "failed" | "synced";

export type OrderItem = {
  productId: string;
  quantity: number;
  price: number;
};

export type Order = {
  id: string;
  venueId: string;
  currency: "EUR";
  items: OrderItem[];
  total: number;
  paymentStatus: PaymentStatus;
  posStatus: PosStatus;
  posAttemptCount: number;
  posTransactionRef: string | null;
  refundedAmount: number | null;
  eventIds: string[];
};

/** Deep-cloned order snapshot returned by the API. */
export type OrderView = Order;

export type PosPayload = {
  venueId: string;
  orderReference: string;
  items: OrderItem[];
  currency: "EUR";
  total: number;
};

export type PosTransaction = {
  transactionRef: string;
  venueId: string;
  orderReference: string;
  items: OrderItem[];
  currency: "EUR";
  total: number;
  createdAt: string;
};

export type OrderSnapshot = {
  venueId: string;
  currency: "EUR";
  items: OrderItem[];
  total: number;
};

export function toOrderView(order: Order): OrderView {
  return {
    id: order.id,
    venueId: order.venueId,
    currency: order.currency,
    items: order.items.map((item) => ({ ...item })),
    total: order.total,
    paymentStatus: order.paymentStatus,
    posStatus: order.posStatus,
    posAttemptCount: order.posAttemptCount,
    posTransactionRef: order.posTransactionRef,
    refundedAmount: order.refundedAmount,
    eventIds: [...order.eventIds],
  };
}

export function orderDataMatches(existing: Order, incoming: OrderSnapshot): boolean {
  if (
    existing.venueId !== incoming.venueId ||
    existing.currency !== incoming.currency ||
    existing.total !== incoming.total ||
    existing.items.length !== incoming.items.length
  ) {
    return false;
  }

  return existing.items.every((item, index) => {
    const other = incoming.items[index];
    return (
      other !== undefined &&
      item.productId === other.productId &&
      item.quantity === other.quantity &&
      item.price === other.price
    );
  });
}
