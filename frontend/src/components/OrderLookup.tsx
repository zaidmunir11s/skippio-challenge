import { useState, type FormEvent } from "react";
import { getOrder } from "../api";
import type { OrderView } from "../types";

type Props = {
  orderId: string;
  onOrderIdChange: (orderId: string) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (order: OrderView) => void;
  onError: (message: string) => void;
};

export function OrderLookup({
  orderId,
  onOrderIdChange,
  disabled,
  onBusyChange,
  onSuccess,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const id = orderId.trim();
    if (!id || loading || disabled) {
      return;
    }

    setLoading(true);
    onBusyChange(true);
    try {
      const order = await getOrder(id);
      onSuccess(order);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  }

  const formDisabled = disabled || loading;

  return (
    <form className="panel" onSubmit={(e) => void handleSubmit(e)}>
      <div className="panel__header">
        <h2>2. Look up an order</h2>
        <p className="panel__lede">
          Fetch the latest payment and POS state by order ID. Submitting a
          payment also loads the order here automatically.
        </p>
      </div>

      <div className="lookup-row">
        <div className="field grow">
          <label className="field__label" htmlFor="lookup-order-id">
            Order ID
          </label>
          <input
            id="lookup-order-id"
            className="mono"
            value={orderId}
            onChange={(e) => onOrderIdChange(e.target.value)}
            disabled={formDisabled}
            placeholder="ord_001"
            required
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className="btn btn--secondary"
          disabled={formDisabled || !orderId.trim()}
        >
          {loading && <span className="btn__spinner" aria-hidden="true" />}
          {loading ? "Loading…" : "Look up"}
        </button>
      </div>
    </form>
  );
}
