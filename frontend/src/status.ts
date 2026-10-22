import type { OrderView, PaymentStatus, PosStatus } from "./types";

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "refunded":
      return "Refunded";
  }
}

export function posStatusLabel(status: PosStatus): string {
  switch (status) {
    case "pending":
      return "Pending sync";
    case "failed":
      return "Sync failed";
    case "synced":
      return "Synced";
  }
}

export function orderSituation(order: OrderView): {
  tone: "neutral" | "warning" | "success" | "info";
  title: string;
  detail: string;
} {
  if (order.paymentStatus === "refunded") {
    return {
      tone: "neutral",
      title: "Order refunded",
      detail:
        "Payment was reversed in full. POS remains synced; no further sync or refund is needed.",
    };
  }

  if (order.posStatus === "failed") {
    return {
      tone: "warning",
      title: "Payment recorded — POS sync failed",
      detail:
        "The payment is paid. The simulated POS rejected the first attempt. Retry synchronisation to register the order.",
    };
  }

  if (order.posStatus === "synced") {
    return {
      tone: "success",
      title: "Payment paid and POS synced",
      detail: order.posTransactionRef
        ? `POS accepted the order under ${order.posTransactionRef}.`
        : "POS accepted the order.",
    };
  }

  return {
    tone: "info",
    title: "Payment recorded — awaiting POS",
    detail: "The order is paid and synchronisation has not finished yet.",
  };
}

export function canRetryPos(order: OrderView): boolean {
  return order.paymentStatus === "paid" && order.posStatus === "failed";
}

export function canRefund(order: OrderView): boolean {
  return order.paymentStatus === "paid" && order.posStatus === "synced";
}
