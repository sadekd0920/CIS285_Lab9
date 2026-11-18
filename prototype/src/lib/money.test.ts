import { describe, expect, it } from "vitest";
import { computeBalances, formatCents, parseAmountToCents, splitEqually } from "./money";

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("parseAmountToCents", () => {
  it("parses valid amounts exactly", () => {
    expect(parseAmountToCents("60")).toBe(6000);
    expect(parseAmountToCents("10.5")).toBe(1050);
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents(19.99)).toBe(1999);
  });
  it.each(["0", "0.00", "-5", "abc", "", "1.234", "1e3", "  ", "NaN"])("rejects %j", (v) => {
    expect(() => parseAmountToCents(v)).toThrow();
  });
  it("rejects non-string/number input", () => {
    expect(() => parseAmountToCents(undefined)).toThrow();
    expect(() => parseAmountToCents(null)).toThrow();
    expect(() => parseAmountToCents(Infinity)).toThrow();
  });
});

describe("splitEqually", () => {
  it("splits $60 among three evenly", () => {
    expect([...splitEqually(6000, [1, 2, 3])]).toEqual([[1, 2000], [2, 2000], [3, 2000]]);
  });
  it("splits $10 among three to the cent, remainder to lowest IDs", () => {
    const s = splitEqually(1000, [3, 1, 2]);
    expect([...s]).toEqual([[1, 334], [2, 333], [3, 333]]);
    expect(sum(s)).toBe(1000);
  });
  it("is deterministic regardless of input order", () => {
    expect([...splitEqually(101, [9, 4, 7])]).toEqual([...splitEqually(101, [4, 7, 9])]);
  });
  it("always sums to the amount", () => {
    for (let amt = 1; amt <= 500; amt++) {
      for (let n = 1; n <= 7; n++) {
        const ids = Array.from({ length: n }, (_, i) => i + 1);
        expect(sum(splitEqually(amt, ids))).toBe(amt);
      }
    }
  });
  it("rejects empty participants and bad amounts", () => {
    expect(() => splitEqually(100, [])).toThrow();
    expect(() => splitEqually(0, [1])).toThrow();
    expect(() => splitEqually(1.5, [1])).toThrow();
  });
});

describe("computeBalances", () => {
  it("matches the Alice/Bob/Charlie $60 example", () => {
    const shares = [...splitEqually(6000, [1, 2, 3])].map(([memberId, shareCents]) => ({ memberId, shareCents }));
    const b = computeBalances([1, 2, 3], [{ amountCents: 6000, payerId: 1, shares }]);
    expect([...b]).toEqual([[1, 4000], [2, -2000], [3, -2000]]);
    expect(sum(b)).toBe(0);
  });
  it("accumulates multiple expenses and sums to zero", () => {
    const mk = (amt: number, payer: number, ids: number[]) => ({
      amountCents: amt,
      payerId: payer,
      shares: [...splitEqually(amt, ids)].map(([memberId, shareCents]) => ({ memberId, shareCents })),
    });
    const b = computeBalances([1, 2, 3], [mk(6000, 1, [1, 2, 3]), mk(3000, 2, [2, 3]), mk(1000, 3, [1, 2, 3])]);
    // Alice: +6000 -2000 -334 = 3666 ; Bob: -2000 +3000 -1500 -333 = -833 ; Charlie: -2000 -1500 +1000 -333 = -2833
    expect([...b]).toEqual([[1, 3666], [2, -833], [3, -2833]]);
    expect(sum(b)).toBe(0);
  });
});

describe("formatCents", () => {
  it("formats signed values", () => {
    expect(formatCents(4000, true)).toBe("+$40.00");
    expect(formatCents(-2000, true)).toBe("-$20.00");
    expect(formatCents(0, true)).toBe("$0.00");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});
