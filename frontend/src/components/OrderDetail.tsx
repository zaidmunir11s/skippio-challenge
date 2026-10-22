import { useState } from "react";
import { refundOrder, syncOrder } from "../api";
import { formatEurCents } from "../format";
import { canRefund, canRetryPos, orderSituation } from "../status";
import type { OrderView } from "../types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  order: OrderView | null;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onOrderUpdated: (order: OrderView, message: string) => void;
  onError: (message: string) => void;
};

export function OrderDetail({
  order,
  disabled,
  onBusyChange,
  onOrderUpdated,
  onError,
}: Props) {
  const [action, setAction] = useState<"sync" | "refund" | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);

  if (!order) {
    return (
      <section className="panel">
        <div className="panel__header">
          <h2>3. Order status</h2>
          <p className="panel__lede">
            Payment and POS outcomes appear here after you submit or look up an
            order.
          </p>
        </div>
        <p className="empty-state">
          No order loaded yet. Submit a payment event or look one up to inspect
          status, retry sync, or refund.
        </p>
      </section>
    );
  }

  const current = order;
  const busy = action !== null;
  const controlsDisabled = disabled || busy;
  const retryEnabled = canRetryPos(current);
  const refundEnabled = canRefund(current);
  const situation = orderSituation(current);

  async function runAction(
    kind: "sync" | "refund",
    request: (orderId: string) => Promise<OrderView>,
    messageFor: (updated: OrderView) => string,
  ) {
    setAction(kind);
    onBusyChange(true);
    try {
      const updated = await request(current.id);
      onOrderUpdated(updated, messageFor(updated));
      if (kind === "refund") {
        setConfirmRefund(false);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Action failed");
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <h2>3. Order status</h2>
        <p className="panel__lede">
          Payment status and POS synchronisation are tracked separately.
        </p>
      </div>

      <div className={`situation situation--${situation.tone}`} role="status">
        <p className="situation__title">{situation.title}</p>
        <p className="situation__detail">{situation.detail}</p>
      </div>

      <dl className="meta-grid">
        <div>
          <dt>Order ID</dt>
          <dd className="mono">{current.id}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd className="mono">{current.venueId}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            <StatusBadge kind="payment" status={current.paymentStatus} />
          </dd>
        </div>
        <div>
          <dt>POS sync</dt>
          <dd>
            <StatusBadge kind="pos" status={current.posStatus} />
          </dd>
        </div>
        <div>
          <dt>POS attempts</dt>
          <dd>{current.posAttemptCount}</dd>
        </div>
        <div>
          <dt>POS reference</dt>
          <dd className="mono">{current.posTransactionRef ?? "—"}</dd>
        </div>
        <div>
          <dt>Refunded amount</dt>
          <dd>
            {current.paymentStatus === "refunded" &&
            current.refundedAmount !== null
              ? formatEurCents(current.refundedAmount)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Event IDs seen</dt>
          <dd className="mono">{current.eventIds.join(", ") || "—"}</dd>
        </div>
      </dl>

      <table className="data-table">
        <caption>Line items</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit price</th>
            <th scope="col">Line total</th>
          </tr>
        </thead>
        <tbody>
          {current.items.map((item, index) => (
            <tr key={`${index}-${item.productId}`}>
              <td className="mono">{item.productId}</td>
              <td>{item.quantity}</td>
              <td>{formatEurCents(item.price)}</td>
              <td>{formatEurCents(item.quantity * item.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td>{formatEurCents(current.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={controlsDisabled || !retryEnabled}
          aria-describedby={!retryEnabled ? "retry-hint" : undefined}
          onClick={() =>
            void runAction("sync", syncOrder, (updated) =>
              updated.posStatus === "synced"
                ? `POS synchronisation succeeded (${updated.posTransactionRef}).`
                : `POS synchronisation finished with status: ${updated.posStatus}.`,
            )
          }
        >
          {action === "sync" && (
            <span className="btn__spinner" aria-hidden="true" />
          )}
          {action === "sync" ? "Retrying POS sync…" : "Retry POS sync"}
        </button>

        {!confirmRefund ? (
          <button
            type="button"
            className="btn btn--danger"
            disabled={controlsDisabled || !refundEnabled}
            aria-describedby={!refundEnabled ? "refund-hint" : undefined}
            onClick={() => setConfirmRefund(true)}
          >
            Full refund ({formatEurCents(current.total)})
          </button>
        ) : null}
      </div>

      {confirmRefund && refundEnabled && (
        <div className="confirm-box" role="region" aria-label="Confirm refund">
          <p>
            Refund the full amount of{" "}
            <strong>{formatEurCents(current.total)}</strong> for order{" "}
            <span className="mono">{current.id}</span>? This cannot be undone
            in the simulation.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={controlsDisabled}
              onClick={() =>
                void runAction("refund", refundOrder, (updated) =>
                  updated.paymentStatus === "refunded"
                    ? `Order refunded (${formatEurCents(updated.refundedAmount ?? 0)}).`
                    : `Refund finished with payment status: ${updated.paymentStatus}.`,
                )
              }
            >
              {action === "refund" && (
                <span className="btn__spinner" aria-hidden="true" />
              )}
              {action === "refund" ? "Refunding…" : "Confirm full refund"}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={controlsDisabled}
              onClick={() => setConfirmRefund(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="action-hints">
        {!retryEnabled && (
          <li id="retry-hint">
            Retry is available when payment is paid and POS sync has failed.
          </li>
        )}
        {!refundEnabled && current.paymentStatus !== "refunded" && (
          <li id="refund-hint">
            Refund is available after payment is paid and POS is synced.
          </li>
        )}
        {current.paymentStatus === "refunded" && (
          <li>This order is already refunded.</li>
        )}
      </ul>
    </section>
  );
}
