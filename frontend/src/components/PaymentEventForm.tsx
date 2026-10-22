import { useState, type FormEvent } from "react";
import { submitPaymentEvent } from "../api";
import { calcItemsTotal, formatEurCents } from "../format";
import type { OrderItem, OrderView } from "../types";

type LineItemDraft = {
  key: string;
  productId: string;
  quantity: string;
  price: string;
};

type FieldErrors = {
  eventId?: string;
  orderId?: string;
  venueId?: string;
  items?: string;
};

type Props = {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (order: OrderView, created: boolean) => void;
  onError: (message: string) => void;
};

function newLineItem(overrides?: Partial<LineItemDraft>): LineItemDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    quantity: "1",
    price: "0",
    ...overrides,
  };
}

function parseLineItems(items: LineItemDraft[]): {
  parsed: OrderItem[] | null;
  error?: string;
} {
  const result: OrderItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    if (!item.productId.trim()) {
      return { parsed: null, error: `Line ${i + 1}: product ID is required.` };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        parsed: null,
        error: `Line ${i + 1}: quantity must be a positive integer.`,
      };
    }
    if (!Number.isInteger(price) || price < 0) {
      return {
        parsed: null,
        error: `Line ${i + 1}: unit price must be a non-negative integer (cents).`,
      };
    }
    result.push({
      productId: item.productId.trim(),
      quantity,
      price,
    });
  }
  if (result.length === 0) {
    return { parsed: null, error: "Add at least one line item." };
  }
  return { parsed: result };
}

export function PaymentEventForm({
  disabled,
  onBusyChange,
  onSuccess,
  onError,
}: Props) {
  const [eventId, setEventId] = useState("evt_001");
  const [orderId, setOrderId] = useState("ord_001");
  const [venueId, setVenueId] = useState("venue_001");
  const [items, setItems] = useState<LineItemDraft[]>([
    newLineItem({ productId: "burger", quantity: "2", price: "1200" }),
    newLineItem({ productId: "water", quantity: "1", price: "250" }),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { parsed: parsedItems, error: itemsError } = parseLineItems(items);
  const calculatedTotal = parsedItems ? calcItemsTotal(parsedItems) : null;

  function updateItem(key: string, patch: Partial<LineItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(key: string) {
    setItems((current) =>
      current.length <= 1 ? current : current.filter((item) => item.key !== key),
    );
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!eventId.trim()) next.eventId = "Event ID is required.";
    if (!orderId.trim()) next.orderId = "Order ID is required.";
    if (!venueId.trim()) next.venueId = "Venue ID is required.";
    if (!parsedItems) next.items = itemsError ?? "Line items are invalid.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || disabled) return;
    if (!validate() || !parsedItems || calculatedTotal === null) return;

    setSubmitting(true);
    onBusyChange(true);
    try {
      const { order, created } = await submitPaymentEvent({
        eventId: eventId.trim(),
        type: "payment.succeeded",
        order: {
          id: orderId.trim(),
          venueId: venueId.trim(),
          currency: "EUR",
          items: parsedItems,
          total: calculatedTotal,
        },
      });
      onSuccess(order, created);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Payment event failed");
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  const formDisabled = disabled || submitting;
  const canSubmit = !formDisabled && parsedItems !== null;

  return (
    <form className="panel" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className="panel__header">
        <h2>1. Submit payment event</h2>
        <p className="panel__lede">
          Build a <code className="mono">payment.succeeded</code> payload from
          the fields below. Resubmit the same values to demonstrate duplicate
          handling — inputs are never auto-changed.
        </p>
      </div>

      <p className="section-label">Event details</p>
      <div className="field-grid">
        <div className="field">
          <label className="field__label" htmlFor="event-id">
            Event ID
          </label>
          <input
            id="event-id"
            className="mono"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            disabled={formDisabled}
            placeholder="evt_001"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.eventId)}
            aria-describedby={fieldErrors.eventId ? "event-id-error" : undefined}
          />
          {fieldErrors.eventId && (
            <p id="event-id-error" className="field__error">
              {fieldErrors.eventId}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="currency">
            Currency
          </label>
          <input id="currency" value="EUR" disabled readOnly aria-readonly="true" />
          <p className="field__hint">Only EUR is supported.</p>
        </div>
      </div>

      <p className="section-label" style={{ marginTop: "1.25rem" }}>
        Order details
      </p>
      <div className="field-grid">
        <div className="field">
          <label className="field__label" htmlFor="order-id">
            Order ID
          </label>
          <input
            id="order-id"
            className="mono"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            disabled={formDisabled}
            placeholder="ord_001"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.orderId)}
            aria-describedby={fieldErrors.orderId ? "order-id-error" : undefined}
          />
          {fieldErrors.orderId && (
            <p id="order-id-error" className="field__error">
              {fieldErrors.orderId}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="venue-id">
            Venue ID
          </label>
          <input
            id="venue-id"
            className="mono"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            disabled={formDisabled}
            placeholder="venue_001"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.venueId)}
            aria-describedby={fieldErrors.venueId ? "venue-id-error" : undefined}
          />
          {fieldErrors.venueId && (
            <p id="venue-id-error" className="field__error">
              {fieldErrors.venueId}
            </p>
          )}
        </div>
      </div>

      <div className="line-items">
        <p className="section-label">Line items</p>
        <div className="line-items__head" aria-hidden="true">
          <span>Product ID</span>
          <span>Qty</span>
          <span>Unit price (¢)</span>
          <span />
        </div>

        <fieldset disabled={formDisabled} style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="visually-hidden">Line items</legend>
          {items.map((item, index) => {
            const priceNum = Number(item.price);
            const pricePreview =
              Number.isInteger(priceNum) && priceNum >= 0
                ? formatEurCents(priceNum)
                : null;
            return (
              <div className="line-item-row" key={item.key}>
                <div className="field">
                  <label className="field__label" htmlFor={`product-${item.key}`}>
                    Product ID
                  </label>
                  <input
                    id={`product-${item.key}`}
                    className="mono"
                    value={item.productId}
                    onChange={(e) =>
                      updateItem(item.key, { productId: e.target.value })
                    }
                    placeholder="product_id"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`qty-${item.key}`}>
                    Quantity
                  </label>
                  <input
                    id={`qty-${item.key}`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.key, { quantity: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`price-${item.key}`}>
                    Unit price (cents)
                  </label>
                  <input
                    id={`price-${item.key}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={item.price}
                    onChange={(e) =>
                      updateItem(item.key, { price: e.target.value })
                    }
                    placeholder="1200"
                  />
                  {pricePreview && (
                    <p className="price-preview">{pricePreview} each</p>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => removeItem(item.key)}
                  disabled={items.length <= 1}
                  aria-label={`Remove line item ${index + 1}`}
                  title="Remove line item"
                >
                  ×
                </button>
              </div>
            );
          })}
        </fieldset>

        {(fieldErrors.items || itemsError) && (
          <p className="field__error" role="status">
            {fieldErrors.items ?? itemsError}
          </p>
        )}

        <div className="line-items__toolbar">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={formDisabled}
            onClick={() => setItems((current) => [...current, newLineItem()])}
          >
            Add line item
          </button>
        </div>
      </div>

      <div className="total-bar" aria-live="polite">
        <span className="total-bar__label">Calculated total</span>
        <div>
          <div className="total-bar__value">
            {calculatedTotal === null ? "—" : formatEurCents(calculatedTotal)}
          </div>
          {calculatedTotal !== null && (
            <span className="total-bar__cents">{calculatedTotal} cents</span>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
          {submitting && <span className="btn__spinner" aria-hidden="true" />}
          {submitting ? "Submitting…" : "Submit payment event"}
        </button>
      </div>
      {formDisabled && !submitting && (
        <p className="field__hint" style={{ marginTop: "0.75rem" }}>
          Wait for the current request to finish before submitting again.
        </p>
      )}
    </form>
  );
}
