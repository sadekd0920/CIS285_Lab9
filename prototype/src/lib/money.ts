/**
 * Pure money logic for SplitSmart. All amounts are integer cents.
 */

export const MAX_AMOUNT_CENTS = 100_000_000_00; // $100,000,000.00 sanity cap

/**
 * Parse a user-entered dollar amount (e.g. "60", "10.5", "$1,234.56") into
 * integer cents without using floating-point arithmetic.
 * Throws an Error with a user-readable message when invalid.
 */
export function parseAmountToCents(input: unknown): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Amount must be a number.");
    input = String(input);
  }
  if (typeof input !== "string") throw new Error("Amount is required.");
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") throw new Error("Amount is required.");
  if (cleaned.startsWith("-")) throw new Error("Amount must be greater than zero.");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    throw new Error(
      "Amount must be a positive number with at most two decimal places (e.g. 12.50).",
    );
  }
  const dollars = match[1];
  const fraction = (match[2] ?? "").padEnd(2, "0");
  if (dollars.length > 12) throw new Error("Amount is too large.");
  const cents = Number(dollars) * 100 + Number(fraction);
  if (cents <= 0) throw new Error("Amount must be greater than zero.");
  if (cents > MAX_AMOUNT_CENTS) throw new Error("Amount is too large.");
  return cents;
}

/**
 * Split amountCents equally among participants. Remainder cents are given,
 * one each, to participants in ascending member-ID order (deterministic).
 * The returned shares always sum exactly to amountCents.
 */
export function splitEqually(
  amountCents: number,
  participantIds: number[],
): Map<number, number> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be a positive whole number of cents.");
  }
  const ids = [...new Set(participantIds)].sort((a, b) => a - b);
  if (ids.length === 0) throw new Error("Select at least one participant.");
  const base = Math.floor(amountCents / ids.length);
  let remainder = amountCents - base * ids.length;
  const shares = new Map<number, number>();
  for (const id of ids) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shares;
}

export interface ExpenseForBalance {
  amountCents: number;
  payerId: number;
  shares: { memberId: number; shareCents: number }[];
}

/**
 * Net balance per member in cents: positive = should receive, negative = owes.
 * balance = (total paid) - (total of own shares). Sums to zero.
 */
export function computeBalances(
  memberIds: number[],
  expenses: ExpenseForBalance[],
): Map<number, number> {
  const balances = new Map<number, number>(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    balances.set(e.payerId, (balances.get(e.payerId) ?? 0) + e.amountCents);
    for (const s of e.shares) {
      balances.set(s.memberId, (balances.get(s.memberId) ?? 0) - s.shareCents);
    }
  }
  return balances;
}

/** Format integer cents as a dollar string, e.g. -2000 -> "-$20.00". */
export function formatCents(cents: number, signed = false): string {
  const sign = cents < 0 ? "-" : signed && cents > 0 ? "+" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rest}`;
}
