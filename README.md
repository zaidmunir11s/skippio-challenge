# Skippio Engineering Challenge

Payment confirmation → simulated POS sync → order lookup / retry / full refund.

TypeScript throughout. Separate `frontend/` (React + Vite) and `backend/` (Node.js + Express). Business logic lives in the backend; the UI talks over HTTP.

## Prerequisites

- **Node.js** 20+ (ESM; tested with current LTS/toolchain in this workspace)
- **npm** 10+

## Installation

```bash
cd skippio
npm run install:all
```

This installs dependencies in both `backend/` and `frontend/` (lockfiles included).

## Run

**Backend** — `http://localhost:3001`:

```bash
npm run dev:backend
```

**Frontend** — `http://localhost:5173` (Vite proxies `/api` → backend):

```bash
npm run dev:frontend
```

Both (macOS/Linux):

```bash
npm run dev
```

Useful URLs:

- Health: `http://localhost:3001/health`
- POS side effects (debug, not part of the challenge UI): `http://localhost:3001/debug/pos-transactions`

## Automated tests and checks

```bash
npm test                          # backend Vitest + Supertest
npm run typecheck                 # backend + frontend TypeScript
npm run lint --prefix frontend    # oxlint
npm run build --prefix frontend   # production frontend build
```

Backend tests cover assignment §5.1: valid payment + POS accept path, duplicates (same/different event IDs), overlapping POS calls (barrier-enforced), fail/retry/no-op after success, invalid totals and conflicts, full refunds (duplicate/concurrent/replay), unknown/ineligible orders.

## Example API commands

Assume the backend is running on port 3001.

**Valid payment event** (first POS attempt fails before acceptance):

```bash
curl -sS -X POST http://localhost:3001/payment-events \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "evt_001",
    "type": "payment.succeeded",
    "order": {
      "id": "ord_001",
      "venueId": "venue_001",
      "currency": "EUR",
      "items": [
        { "productId": "burger", "quantity": 2, "price": 1200 },
        { "productId": "water", "quantity": 1, "price": 250 }
      ],
      "total": 2650
    }
  }' | jq .
```

Expected: `201`, `paymentStatus: "paid"`, `posStatus: "failed"`, `posAttemptCount: 1`, `posTransactionRef: null`.

**Look up order:**

```bash
curl -sS http://localhost:3001/orders/ord_001 | jq .
```

**Retry POS sync** (second attempt accepts):

```bash
curl -sS -X POST http://localhost:3001/orders/ord_001/sync | jq .
```

Expected: `200`, `posStatus: "synced"`, `posAttemptCount: 2`, `posTransactionRef: "pos_tx_001"`.

**Full refund:**

```bash
curl -sS -X POST http://localhost:3001/orders/ord_001/refund | jq .
```

Expected: `200`, `paymentStatus: "refunded"`, `refundedAmount: 2650`.

**Duplicate payment (different event ID, same order data):**

```bash
curl -sS -X POST http://localhost:3001/payment-events \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "evt_002",
    "type": "payment.succeeded",
    "order": {
      "id": "ord_001",
      "venueId": "venue_001",
      "currency": "EUR",
      "items": [
        { "productId": "burger", "quantity": 2, "price": 1200 },
        { "productId": "water", "quantity": 1, "price": 250 }
      ],
      "total": 2650
    }
  }' | jq .
```

Expected: `200`, refund status preserved if already refunded; still a single POS transaction under `/debug/pos-transactions`.

**Conflict (must not mutate existing records):**

```bash
curl -sS -o /tmp/conflict.json -w '%{http_code}\n' -X POST http://localhost:3001/payment-events \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "evt_conflict",
    "type": "payment.succeeded",
    "order": {
      "id": "ord_001",
      "venueId": "venue_001",
      "currency": "EUR",
      "items": [{ "productId": "salad", "quantity": 1, "price": 500 }],
      "total": 500
    }
  }'
cat /tmp/conflict.json | jq .
```

Expected: `409` / `ORDER_CONFLICT`.

## Failure → retry → sync → refund walkthrough

1. **Submit payment** (UI form or `POST /payment-events`).
   - Order is recorded as **paid**.
   - Fake POS **rejects the first attempt** before accepting a transaction.
   - Result: `posStatus: failed`, `posAttemptCount: 1`, no `posTransactionRef`, and `/debug/pos-transactions` is empty for that order.
2. **Retry sync** (`Retry POS sync` or `POST /orders/:id/sync`).
   - Attempt count becomes `2`; POS **accepts** and returns a transaction reference (e.g. `pos_tx_001`).
   - Result: `posStatus: synced`. Payment remains **paid**.
3. **Retry again after success**.
   - Response `200` with the same reference; attempt count unchanged; still **one** POS transaction.
4. **Full refund** (`Full refund` or `POST /orders/:id/refund`).
   - Requires paid + synced. Sets `paymentStatus: refunded` and `refundedAmount` to the order total (integer cents).
   - Duplicate/concurrent refunds return the same refunded state without double-crediting.
   - Replaying a matching payment event does **not** reset the refund.

Amounts are integer cents everywhere; the UI formats EUR for display only.

## Manual verification checklist

See [MANUAL_CHECKLIST.md](./MANUAL_CHECKLIST.md) for UI and API steps covering valid/duplicate/conflict submission, lookup, POS failure/recovery, post-success sync, refunds, and invalid/unknown orders.

## Architecture and duplicate prevention

| Layer | Role |
| --- | --- |
| Routes | HTTP + Zod validation at the boundary |
| `orderService` | Paid/sync/refund state transitions |
| `OrderLock` | Per-order mutex for critical sections (single Node process) |
| `MemoryStore` | In-memory orders + accepted POS txs |
| `fakePos` | Async adapter; first attempt fails; later attempts accept |

**Duplicate-prevention strategy**

1. **Orders:** create under a per-order lock. Matching replays (including different `eventId`) append event IDs and return `200` without creating another order or re-running POS. Conflicting snapshots → `409`, unchanged.
2. **POS attempts:** attempt count is incremented under the order lock; POS I/O runs **outside** that lock so concurrent retries can overlap (required for tests). Acceptance is serialized with a second per-order lock; the store keeps **at most one** accepted transaction keyed by order reference. Already-synced orders short-circuit before calling POS.
3. **Refunds:** transition `paid → refunded` under the order lock; idempotent if already refunded. Payment replay never clears refund fields.

Locks and maps are **process-local**. They are not safe across multiple server instances or restarts.

## Key decisions

- Integer cents; display formatting only on the frontend.
- Distinguish payment vs POS outcomes (`paymentStatus` vs `posStatus`).
- Deterministic first-attempt POS failure so the UI can demonstrate recovery.
- `/debug/pos-transactions` keeps POS side effects observable and separate from order records.
- No DI framework, queue, or database — YAGNI for the take-home scope.

## Known limitations / before production

- In-memory state is lost on restart; no multi-instance coordination.
- Trusted webhook sender assumed; no signature verification or auth.
- No durable outbox, real POS timeouts, partial refunds, or payment-provider refunds.
- Single-process mutex only.

Would improve for production: durable storage, webhook auth, idempotency at the edge, structured logging/metrics, multi-instance-safe locking or an outbox, and real POS timeout/retry semantics.

## Time spent and unfinished work

**Approximate time spent:** ~4 hours of focused implementation, testing, and documentation (within the challenge’s 3–4 hour guidance).

**Unfinished / incomplete for submission packaging**

- This working copy is **not a git repository** yet and has **no GitHub remote** (assignment §6.1–6.2). See [GIT_PLAN.md](./GIT_PLAN.md) for a recommended milestone commit sequence after `git init`.
- Automated frontend tests not included (optional in the brief).
- No cloud deployment (out of scope).

## Git workflow

Intended: incremental commits by milestone (foundation → payment/POS → concurrency/refunds → frontend → docs), push after each green check. **Nothing has been committed or pushed from this folder yet** — initialize git and follow [GIT_PLAN.md](./GIT_PLAN.md) before submitting a GitHub URL.

## Interview prep

See [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) for architecture, concurrency, idempotency, and trade-off Q&A aligned with this codebase.

## AI usage

See [AI_USAGE.md](./AI_USAGE.md).
