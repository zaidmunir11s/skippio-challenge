export type PaymentStatus = "paid" | "refunded";
export type PosStatus = "pending" | "failed" | "synced";

export type OrderItem = {
  productId: string;
  quantity: number;
  price: number;
};

export type PaymentEventRequest = {
  eventId: string;
  type: "payment.succeeded";
  order: {
    id: string;
    venueId: string;
    currency: "EUR";
    items: OrderItem[];
    total: number;
  };
};

export type OrderView = {
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

