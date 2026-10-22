import type { OrderView, PaymentEventRequest } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isOrderItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.productId === "string" &&
    typeof value.quantity === "number" &&
    typeof value.price === "number"
  );
}

function isOrderView(value: unknown): value is OrderView {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.venueId === "string" &&
    value.currency === "EUR" &&
    Array.isArray(value.items) &&
    value.items.every(isOrderItem) &&
    typeof value.total === "number" &&
    (value.paymentStatus === "paid" || value.paymentStatus === "refunded") &&
    (value.posStatus === "pending" ||
      value.posStatus === "failed" ||
      value.posStatus === "synced") &&
    typeof value.posAttemptCount === "number" &&
    (typeof value.posTransactionRef === "string" ||
      value.posTransactionRef === null) &&
    (typeof value.refundedAmount === "number" || value.refundedAmount === null) &&
    Array.isArray(value.eventIds) &&
    value.eventIds.every((id) => typeof id === "string")
  );
}

function parseOrderView(body: unknown): OrderView {
  if (!isOrderView(body)) {
    throw new ApiError(
      500,
      "INVALID_RESPONSE",
      "Server returned an unexpected order payload",
    );
  }
  return body;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_JSON",
      "Server returned a non-JSON response",
    );
  }
}

function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const code =
      typeof body.error.code === "string" ? body.error.code : "UNKNOWN_ERROR";
    const message =
      typeof body.error.message === "string"
        ? body.error.message
        : `Request failed with status ${status}`;
    return new ApiError(status, code, message);
  }

  return new ApiError(status, "UNKNOWN_ERROR", `Request failed with status ${status}`);
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the backend");
  }

  const body = await parseJson(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  return { status: response.status, body };
}

export async function submitPaymentEvent(
  payload: PaymentEventRequest,
): Promise<{ order: OrderView; created: boolean }> {
  const { status, body } = await request("/payment-events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { order: parseOrderView(body), created: status === 201 };
}

export async function getOrder(orderId: string): Promise<OrderView> {
  const { body } = await request(`/orders/${encodeURIComponent(orderId)}`);
  return parseOrderView(body);
}

export async function syncOrder(orderId: string): Promise<OrderView> {
  const { body } = await request(`/orders/${encodeURIComponent(orderId)}/sync`, {
    method: "POST",
  });
  return parseOrderView(body);
}

export async function refundOrder(orderId: string): Promise<OrderView> {
  const { body } = await request(`/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST",
  });
  return parseOrderView(body);
}
