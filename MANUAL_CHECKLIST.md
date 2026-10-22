# Manual verification checklist

Use the UI at `http://localhost:5173` with the backend on `http://localhost:3001`, or the curl examples in the README. Tick each item after observing the stated outcome.

## Valid submission

- [ ] Submit the default form (or sample `POST /payment-events`).
- [ ] Response/UI shows **paid**, POS **failed**, attempt count **1**, no POS reference.
- [ ] `/debug/pos-transactions` has **no** accepted transaction for that order.

## Duplicate submission

- [ ] Resubmit the **same** event ID and order payload → `200`, still one order, still no extra POS accept after failure (or still one POS tx if already synced).
- [ ] Resubmit with a **different** event ID and **matching** order data → `200`, event IDs include both; still one order / one accepted POS transaction when synced.

## Conflicting order data

- [ ] Submit a payment for an existing order ID with different items/total/venue.
- [ ] Expect **409** `ORDER_CONFLICT`.
- [ ] Re-fetch the order: previous payment/POS/refund fields unchanged; POS transaction list unchanged.

## Order lookup

- [ ] Enter the order ID and look up (or `GET /orders/:id`).
- [ ] See line items, EUR-formatted prices/total, payment status, POS status, attempt count, POS reference (or —), refund amount when refunded, event IDs.
- [ ] Unknown ID → clear error / **404**.

## POS failure and recovery

- [ ] After first payment: paid + failed (as above).
- [ ] Click **Retry POS sync** (or `POST /orders/:id/sync`).
- [ ] Expect **synced**, attempt count **2**, a POS reference, and one entry in `/debug/pos-transactions`.

## Repeated sync after success

- [ ] Click **Retry POS sync** again (or call sync again).
- [ ] Expect `200`, same POS reference, attempt count unchanged, still **one** POS transaction.
- [ ] Retry button stays disabled while POS is not `failed` (UI).

## Successful refund and duplicate refund

- [ ] With paid + synced, click **Full refund** (or `POST /orders/:id/refund`).
- [ ] Expect **refunded** and `refundedAmount` equal to total (e.g. 2650).
- [ ] Refund again → same refunded state, amount unchanged.
- [ ] Resubmit a matching payment event → refund status **preserved**.

## Invalid and unknown orders

- [ ] Invalid total / empty IDs / bad currency or type → **400** validation error; no order created.
- [ ] `GET` / sync / refund unknown order ID → **404**.
- [ ] Refund before POS sync → **409** ineligible; order stays paid/failed.
- [ ] Sync after refund → **409** ineligible.

## Notes

- Automated frontend tests were not added (optional per assignment §5.2).
- This checklist was exercised end-to-end in the browser during development (submit → fail → retry → refund). Re-run before final GitHub submission after any code change.
