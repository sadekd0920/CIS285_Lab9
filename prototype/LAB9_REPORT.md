# CIS 285 Lab 9 — SplitSmart Prototype Report

Branch: `feature/splitsmart-prototype` (no commits or pushes were made)

## 1. Features implemented

| Req | Feature | How it works |
|---|---|---|
| FR1 | Group management | Create a group (sidebar form); every group is listed with its member and expense counts; click one to select it. The selected group is kept in the URL (`?group=<id>`), so a refresh stays on the same group. |
| FR2 | Member management | Add members to the selected group and view the member list. Blank names and duplicate names within a group (case-insensitive) are rejected. |
| FR3 | Expense recording | Description, amount (dollars), payer (dropdown) and participants (checkboxes, all checked by default). The expense is split equally among the selected participants. |
| FR4 | Expense history | Every expense in the selected group, newest first, showing the payer, the date and each participant's share. |
| FR5 | Balances | Net balance per member (positive = gets money back, negative = owes), plus the sum of all balances (always $0.00). |

**Business rules**
- **Integer cents:** amounts are parsed from text straight into integer cents with no floating-point math (`parseAmountToCents`). They are stored as `Int` columns (`amountCents`, `shareCents`).
- **Equal split with a fixed remainder rule:** `base = floor(amount / n)`. The leftover cents go one each to participants in ascending member-ID order, so the split doesn't depend on the order participants were selected in. Example: $10 split three ways becomes 334 / 333 / 333 cents.
- **Shares are saved:** each participant's share is stored in an `ExpenseShare` row. The shares for an expense always add up to its total.
- **Balance formula:** balance = total paid − total of own shares. This always sums to zero.
- **Validation (server side):**
  - The amount must be positive, have at most 2 decimal places and be no more than $100,000,000.
  - The payer and every participant must belong to the selected group.
  - Member IDs must be valid positive integers.
  - At least one participant must be selected, with no duplicates.
  - A description is required.
  - Unknown groups return 404.
  - Malformed JSON is rejected.

  Errors come back as `{ error: "<readable message>" }` and appear in red under the form that caused them.
- **Persistence:** data is stored in a local SQLite database (`prisma/dev.db`) through Prisma.
- **Payer and participants:** the payer does not have to be one of the participants. The payer still has to be a member of the group.

## 2. Major files created or modified

| File | Status | Purpose |
|---|---|---|
| `prisma/schema.prisma` | modified | Added `Group`, `Member`, `Expense`, `ExpenseShare` (the existing `EnvironmentCheck` model is kept) |
| `prisma/migrations/20261118215717_splitsmart_init/` | new | SQLite migration |
| `src/lib/money.ts` | new | Pure logic: amount parsing, equal split with remainder, balances, formatting |
| `src/lib/money.test.ts` | new | Vitest unit tests (19) |
| `src/lib/splitsmart.ts` | new | Service layer: validation and Prisma persistence, group detail with balances |
| `src/lib/db.ts` | new | Shared Prisma client |
| `src/lib/http.ts` | new | JSON body parsing and error-to-HTTP mapping |
| `src/app/api/groups/route.ts` | new | `GET` lists groups, `POST` creates a group |
| `src/app/api/groups/[groupId]/route.ts` | new | `GET` returns group detail (members, expenses, balances) |
| `src/app/api/groups/[groupId]/members/route.ts` | new | `POST` adds a member |
| `src/app/api/groups/[groupId]/expenses/route.ts` | new | `POST` records an expense |
| `src/components/SplitSmartApp.tsx` | new | Client UI |
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | modified | Replaced the starter page; set the title; simplified styles |
| `scripts/api-test.mjs` | new | End-to-end API test script |
| `package.json` | modified | Added a `"test": "vitest run"` script (no new dependencies) |
| `README.md` | modified | Run instructions |
| `.env` | new, **git-ignored** | `DATABASE_URL="file:./dev.db"` |

Not touched: the Dev Container config, the Lab 6/7 docs (`specs/`, `UserRequirement.md`, `.specify/`) and `prisma.config.ts`.

## 3. Running the application

```bash
cd prototype
echo 'DATABASE_URL="file:./dev.db"' > .env   # required by prisma.config.ts; .env is git-ignored
npx prisma migrate dev                       # creates prisma/dev.db and generates the client
npm run dev                                  # open http://localhost:3000 (Codespaces forwards port 3000)
```

Tests: run `npm test` for the unit tests. Run `node scripts/api-test.mjs` for the API tests while the dev server is running.

## 4. Test results (all were actually run)

**Static checks:** `npx tsc --noEmit` passed with no errors, `npm run lint` passed with no warnings, and `npm run build` succeeded.

**Unit tests (`npm test`): 19 passed, 0 failed.** They cover:
- amount parsing, including rejection of 0, negative, non-numeric, empty and 3-decimal values
- the $60 and $10 splits
- order independence of the split
- an exhaustive check that shares sum to the total (amounts of 1–500 cents, 1–7 participants)
- the $60 example balances
- multiple expenses summing to zero

**End-to-end API tests (`node scripts/api-test.mjs` against `npm run dev`): 40 passed, 0 failed.**

| Required test | Result |
|---|---|
| A group can be created | PASS (201, and it appears in the group list) |
| Three members can be added | PASS (Alice, Bob and Charlie; the list returns all 3) |
| $60 paid by Alice, shared by 3 | PASS: Alice +$40.00, Bob −$20.00, Charlie −$20.00 |
| Multiple expenses update balances | PASS: after adding $30 paid by Bob for Bob and Charlie, balances are Alice +$40, Bob −$5, Charlie −$35 |
| $10 shared by 3, accurate to the cent | PASS: shares are 334 / 333 / 333 cents (sum 1000). Afterwards balances are Alice +$36.66, Bob −$8.33, Charlie −$28.33 |
| All balances sum to zero | PASS after every expense |
| Invalid amounts rejected | PASS: `"0"`, `"-5"`, `"abc"`, `""`, `"1.234"`, `null` and `-10` all return 400 with a message |
| Invalid member IDs rejected | PASS: nonexistent participant, participant from another group, nonexistent payer, payer from another group, non-numeric ID, no participants, missing payer and duplicate participants all return 400 with a message (e.g. "All participants must be members of this group (invalid ID: 999999).") |
| Rejected requests have no side effects | PASS (still 3 expenses, sum 0) |
| Data persists | PASS at the server/database level: I stopped the dev server completely and started it again. The same groups, 3 expenses and balances (3666 / −833 / −2833, sum 0) came back from the API. The rows were also confirmed directly in `prisma/dev.db` with `sqlite3`. Reloading `/?group=1` returned HTTP 200. |

## 5. Known issues and limitations

- **The UI was not tested in a real browser.** No headless browser is installed in the Codespace, so the scenarios above were run through the same HTTP API the UI calls. The page compiles, type-checks, builds, and serves HTTP 200 with the SplitSmart markup. The click-through flow and how error messages look on screen still need a manual check in the browser.
- **Test data is left in the database:** the test run left two groups in `prisma/dev.db` ("Lab9 Test …" and "Other …"). Run `npx prisma migrate reset` to start fresh.
- **No edit or delete:** expenses, members and groups can't be edited or deleted, and there is no settle-up or payment recording. None of these were required.
- **Equal splits only.** There are no custom or percentage splits. Everything is in a single currency (USD display).
- **Access control:** there is no authentication (as instructed), so anyone who can reach the server can see and change every group.
- **`.env` setup:** `.env` is git-ignored, so a fresh clone needs the `echo 'DATABASE_URL=…' > .env` step before running Prisma.
- **Google Fonts at build time:** `layout.tsx` still loads the starter's Geist font from Google Fonts, so `next build` needs internet access. It had access in this Codespace.
