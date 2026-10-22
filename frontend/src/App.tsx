import { useState } from "react";
import { FeedbackBanner } from "./components/FeedbackBanner";
import { OrderDetail } from "./components/OrderDetail";
import { OrderLookup } from "./components/OrderLookup";
import { PaymentEventForm } from "./components/PaymentEventForm";
import { paymentStatusLabel, posStatusLabel } from "./status";
import type { OrderView } from "./types";
import "./App.css";

type Feedback = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

export default function App() {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [lookupId, setLookupId] = useState("ord_001");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function showFeedback(kind: NonNullable<Feedback>["kind"], message: string) {
    setFeedback({ kind, message });
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <p className="brand__name">Skippio</p>
          <p className="brand__tag">
            Payment confirmation and POS synchronisation — submit events,
            inspect status, retry failed sync, and refund.
          </p>
        </div>
      </header>

      <div className="workspace">
        <div className="workspace-stack">
          <PaymentEventForm
            disabled={busy}
            onBusyChange={setBusy}
            onSuccess={(next, created) => {
              setOrder(next);
              setLookupId(next.id);
              if (created) {
                if (next.posStatus === "failed") {
                  showFeedback(
                    "info",
                    `Payment accepted (${paymentStatusLabel(next.paymentStatus)}). POS sync failed on the first attempt — use Retry POS sync.`,
                  );
                } else {
                  showFeedback(
                    "success",
                    `Payment accepted. POS status: ${posStatusLabel(next.posStatus)}.`,
                  );
                }
              } else {
                showFeedback(
                  "info",
                  `Duplicate delivery accepted — existing order unchanged. Payment: ${paymentStatusLabel(next.paymentStatus)}; POS: ${posStatusLabel(next.posStatus)}.`,
                );
              }
            }}
            onError={(message) => showFeedback("error", message)}
          />
        </div>

        <div className="workspace-stack">
          <FeedbackBanner feedback={feedback} />

          <OrderLookup
            orderId={lookupId}
            onOrderIdChange={setLookupId}
            disabled={busy}
            onBusyChange={setBusy}
            onSuccess={(next) => {
              setOrder(next);
              showFeedback(
                "success",
                `Loaded order ${next.id} (${paymentStatusLabel(next.paymentStatus)} / ${posStatusLabel(next.posStatus)}).`,
              );
            }}
            onError={(message) => {
              setOrder(null);
              showFeedback("error", message);
            }}
          />

          <OrderDetail
            order={order}
            disabled={busy}
            onBusyChange={setBusy}
            onOrderUpdated={(next, message) => {
              setOrder(next);
              showFeedback("success", message);
            }}
            onError={(message) => showFeedback("error", message)}
          />
        </div>
      </div>
    </div>
  );
}
