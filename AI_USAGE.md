# AI usage

## Tools used

**Cursor** (agent / Composer) assisted with:

- Scaffolding the Express + Vite TypeScript layout, Zod payment validation, and in-memory order/POS flow.
- Drafting concurrency tests that use an overlap barrier around the fake POS.
- A code-quality pass: removing unused Vite assets, collapsing duplicate types, simplifying pass-throughs, and aligning documentation with the assignment PDF.
- Preparing submission docs (`README.md`, this file, manual checklist, git plan, interview prep).

No other AI products were used for this submission package.

## How generated output was reviewed and verified

- Compared behaviour to the Skippio assignment PDF (endpoints, validation, duplicates, POS first-fail/retry, refunds, frontend form/lookup/retry).
- Ran backend tests (`npm test` / Vitest + Supertest), including cases that force overlapping POS calls and concurrent refunds.
- Ran `npm run typecheck` (frontend + backend), frontend `oxlint`, and `npm run build --prefix frontend`.
- Manually walked the UI: submit → first POS failure → retry sync → full refund.
- Read and can explain the locking model in `orderService` / `OrderLock` / `fakePos`.

I did not treat AI output as correct by default: failing or incomplete behaviour was fixed against tests and the PDF before treating a requirement as done.