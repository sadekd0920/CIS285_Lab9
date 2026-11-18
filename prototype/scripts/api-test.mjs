// End-to-end API test against a running SplitSmart server.
// Usage: node scripts/api-test.mjs [baseUrl]   (default http://localhost:3000)
const BASE = process.argv[2] ?? "http://localhost:3000";
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const bal = (d) => Object.fromEntries(d.balances.map((b) => [b.name, b.balanceCents]));

for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/api/groups"); break; } catch { await new Promise(r => setTimeout(r, 500)); } }

// 1. Create group
const g = await call("POST", "/api/groups", { name: `Lab9 Test ${Date.now()}` });
check("create group returns 201", g.status === 201, JSON.stringify(g));
const gid = g.data.id;
const list = await call("GET", "/api/groups");
check("group appears in group list", list.data.some((x) => x.id === gid));
check("empty group name rejected", (await call("POST", "/api/groups", { name: "  " })).status === 400);

// 2. Add three members
const ids = {};
for (const n of ["Alice", "Bob", "Charlie"]) {
  const r = await call("POST", `/api/groups/${gid}/members`, { name: n });
  check(`add member ${n}`, r.status === 201, JSON.stringify(r));
  ids[n] = r.data.id;
}
let d = (await call("GET", `/api/groups/${gid}`)).data;
check("member list has 3 members", d.members.length === 3 && d.members.map(m => m.name).join() === "Alice,Bob,Charlie");
const dup = await call("POST", `/api/groups/${gid}/members`, { name: "alice" });
check("duplicate member name rejected", dup.status === 409, JSON.stringify(dup.data));

// 3. $60 paid by Alice, shared by all three
const all = [ids.Alice, ids.Bob, ids.Charlie];
const e1 = await call("POST", `/api/groups/${gid}/expenses`, { description: "Groceries", amount: "60", payerId: ids.Alice, participantIds: all });
check("record $60 expense", e1.status === 201, JSON.stringify(e1));
d = (await call("GET", `/api/groups/${gid}`)).data;
let b = bal(d);
console.log("      balances after $60:", b);
check("$60 → Alice +$40, Bob -$20, Charlie -$20", b.Alice === 4000 && b.Bob === -2000 && b.Charlie === -2000);
check("balances sum to zero (after $60)", d.balanceTotalCents === 0);

// 4. Multiple expenses: $30 paid by Bob, Bob+Charlie
const e2 = await call("POST", `/api/groups/${gid}/expenses`, { description: "Taxi", amount: "30.00", payerId: ids.Bob, participantIds: [ids.Bob, ids.Charlie] });
check("record $30 expense", e2.status === 201);
d = (await call("GET", `/api/groups/${gid}`)).data;
b = bal(d);
console.log("      balances after +$30:", b);
check("multi-expense: Alice +$40, Bob -$5, Charlie -$35", b.Alice === 4000 && b.Bob === -500 && b.Charlie === -3500);
check("balances sum to zero (after $30)", d.balanceTotalCents === 0);

// 5. $10 split three ways, paid by Charlie
const e3 = await call("POST", `/api/groups/${gid}/expenses`, { description: "Coffee", amount: "10", payerId: ids.Charlie, participantIds: all });
check("record $10 expense", e3.status === 201);
const shares = Object.fromEntries(e3.data.shares.map((s) => [s.memberId, s.shareCents]));
console.log("      $10 shares (cents):", { Alice: shares[ids.Alice], Bob: shares[ids.Bob], Charlie: shares[ids.Charlie] });
check("$10/3 → 334 + 333 + 333 cents (remainder to lowest member ID)",
  shares[ids.Alice] === 334 && shares[ids.Bob] === 333 && shares[ids.Charlie] === 333);
check("$10 shares sum to exactly 1000 cents", Object.values(shares).reduce((a, c) => a + c, 0) === 1000);
d = (await call("GET", `/api/groups/${gid}`)).data;
b = bal(d);
console.log("      balances after +$10:", b, "sum:", d.balanceTotalCents);
check("after $10: Alice +$36.66, Bob -$8.33, Charlie -$28.33", b.Alice === 3666 && b.Bob === -833 && b.Charlie === -2833);
check("all balances sum to zero (final)", Object.values(b).reduce((a, c) => a + c, 0) === 0 && d.balanceTotalCents === 0);
check("expense history lists 3 expenses", d.expenses.length === 3);

// 6. Invalid amounts
for (const amount of ["0", "-5", "abc", "", "1.234", null, -10]) {
  const r = await call("POST", `/api/groups/${gid}/expenses`, { description: "Bad", amount, payerId: ids.Alice, participantIds: all });
  check(`invalid amount ${JSON.stringify(amount)} rejected (400)`, r.status === 400 && typeof r.data?.error === "string", JSON.stringify(r));
}

// 7. Invalid member IDs (nonexistent + from another group)
const other = (await call("POST", "/api/groups", { name: `Other ${Date.now()}` })).data;
const outsider = (await call("POST", `/api/groups/${other.id}/members`, { name: "Mallory" })).data;
const cases = [
  ["nonexistent participant", { payerId: ids.Alice, participantIds: [ids.Alice, 999999] }],
  ["participant from other group", { payerId: ids.Alice, participantIds: [ids.Alice, outsider.id] }],
  ["nonexistent payer", { payerId: 999999, participantIds: all }],
  ["payer from other group", { payerId: outsider.id, participantIds: all }],
  ["non-numeric participant ID", { payerId: ids.Alice, participantIds: ["abc"] }],
  ["no participants", { payerId: ids.Alice, participantIds: [] }],
  ["missing payer", { participantIds: all }],
  ["duplicate participants", { payerId: ids.Alice, participantIds: [ids.Bob, ids.Bob] }],
];
for (const [name, body] of cases) {
  const r = await call("POST", `/api/groups/${gid}/expenses`, { description: "Bad", amount: "5", ...body });
  check(`${name} rejected (400)`, r.status === 400, JSON.stringify(r));
  if (r.data?.error) console.log(`      message: ${r.data.error}`);
}
check("empty description rejected", (await call("POST", `/api/groups/${gid}/expenses`, { description: "", amount: "5", payerId: ids.Alice, participantIds: all })).status === 400);
check("malformed JSON rejected", (await call("POST", `/api/groups/${gid}/expenses`, "{not json")).status === 400);
check("unknown group → 404", (await call("GET", `/api/groups/999999`)).status === 404);
check("adding member to unknown group → 404", (await call("POST", `/api/groups/999999/members`, { name: "X" })).status === 404);
d = (await call("GET", `/api/groups/${gid}`)).data;
check("rejected requests did not change data (still 3 expenses, sum 0)", d.expenses.length === 3 && d.balanceTotalCents === 0);

console.log(`\nGROUP_ID=${gid}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
