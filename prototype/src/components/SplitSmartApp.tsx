"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

interface GroupSummary {
  id: number;
  name: string;
  memberCount: number;
  expenseCount: number;
}
interface Member {
  id: number;
  name: string;
}
interface Expense {
  id: number;
  description: string;
  amountCents: number;
  payerId: number;
  createdAt: string;
  shares: { memberId: number; shareCents: number }[];
}
interface GroupDetail {
  group: { id: number; name: string };
  members: Member[];
  expenses: Expense[];
  balances: { memberId: number; name: string; balanceCents: number }[];
  balanceTotalCents: number;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";
const button =
  "rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export default function SplitSmartApp() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [groupName, setGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);

  const [memberName, setMemberName] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [participants, setParticipants] = useState<number[]>([]);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const list = await api<GroupSummary[]>("/api/groups");
    setGroups(list);
    return list;
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const d = await api<GroupDetail>(`/api/groups/${id}`);
      setDetail(d);
      setLoadError(null);
      return d;
    } catch (e) {
      setDetail(null);
      setLoadError((e as Error).message);
      return null;
    }
  }, []);

  const selectGroup = useCallback(
    async (id: number | null) => {
      setSelectedId(id);
      setMemberError(null);
      setExpenseError(null);
      setDescription("");
      setAmount("");
      setPayerId("");
      const url = new URL(window.location.href);
      if (id === null) url.searchParams.delete("group");
      else url.searchParams.set("group", String(id));
      window.history.replaceState(null, "", url);
      if (id === null) {
        setDetail(null);
        return;
      }
      const d = await loadDetail(id);
      setParticipants(d ? d.members.map((m) => m.id) : []);
    },
    [loadDetail],
  );

  // Initial load: restore the selected group from the URL so refresh keeps context.
  useEffect(() => {
    (async () => {
      try {
        const list = await loadGroups();
        const fromUrl = Number(new URL(window.location.href).searchParams.get("group"));
        const initial = list.find((g) => g.id === fromUrl) ?? list[0];
        if (initial) await selectGroup(initial.id);
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
  }, [loadGroups, selectGroup]);

  async function onCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setGroupError(null);
    setBusy(true);
    try {
      const g = await api<{ id: number }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: groupName }),
      });
      setGroupName("");
      await loadGroups();
      await selectGroup(g.id);
    } catch (err) {
      setGroupError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId === null) return;
    setMemberError(null);
    setBusy(true);
    try {
      const m = await api<Member>(`/api/groups/${selectedId}/members`, {
        method: "POST",
        body: JSON.stringify({ name: memberName }),
      });
      setMemberName("");
      setParticipants((p) => [...p, m.id]);
      await Promise.all([loadDetail(selectedId), loadGroups()]);
    } catch (err) {
      setMemberError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId === null) return;
    setExpenseError(null);
    setBusy(true);
    try {
      await api(`/api/groups/${selectedId}/expenses`, {
        method: "POST",
        body: JSON.stringify({
          description,
          amount,
          payerId: payerId === "" ? null : Number(payerId),
          participantIds: participants,
        }),
      });
      setDescription("");
      setAmount("");
      await Promise.all([loadDetail(selectedId), loadGroups()]);
    } catch (err) {
      setExpenseError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: number) => detail?.members.find((m) => m.id === id)?.name ?? `#${id}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-2xl font-bold text-emerald-700">SplitSmart</h1>
          <p className="text-sm text-slate-500">Split shared expenses fairly, to the cent.</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[260px_1fr]">
        {/* Groups sidebar */}
        <aside className="space-y-4">
          <section className={card}>
            <h2 className="mb-3 font-semibold">Create a group</h2>
            <form onSubmit={onCreateGroup} className="space-y-2">
              <label htmlFor="group-name" className="sr-only">
                Group name
              </label>
              <input
                id="group-name"
                className={input}
                placeholder="e.g. Ski Trip"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <button type="submit" className={`${button} w-full`} disabled={busy}>
                Create group
              </button>
              <ErrorText message={groupError} />
            </form>
          </section>

          <section className={card}>
            <h2 className="mb-3 font-semibold">Your groups</h2>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500">No groups yet. Create one above.</p>
            ) : (
              <ul className="space-y-1">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => selectGroup(g.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        g.id === selectedId
                          ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      <span className="block">{g.name}</span>
                      <span className="text-xs text-slate-500">
                        {g.memberCount} member{g.memberCount === 1 ? "" : "s"} · {g.expenseCount}{" "}
                        expense{g.expenseCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* Selected group */}
        <div className="space-y-6">
          <ErrorText message={loadError} />
          {!detail ? (
            <div className={`${card} text-slate-500`}>
              Select or create a group to get started.
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold">{detail.group.name}</h2>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Members */}
                <section className={card}>
                  <h3 className="mb-3 font-semibold">Members</h3>
                  {detail.members.length === 0 ? (
                    <p className="mb-3 text-sm text-slate-500">No members yet.</p>
                  ) : (
                    <ul className="mb-3 flex flex-wrap gap-2">
                      {detail.members.map((m) => (
                        <li
                          key={m.id}
                          className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                        >
                          {m.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={onAddMember} className="flex gap-2">
                    <label htmlFor="member-name" className="sr-only">
                      Member name
                    </label>
                    <input
                      id="member-name"
                      className={input}
                      placeholder="Member name"
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                    />
                    <button type="submit" className={button} disabled={busy}>
                      Add
                    </button>
                  </form>
                  <ErrorText message={memberError} />
                </section>

                {/* Balances */}
                <section className={card}>
                  <h3 className="mb-3 font-semibold">Balances</h3>
                  {detail.balances.length === 0 ? (
                    <p className="text-sm text-slate-500">Add members to see balances.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {detail.balances.map((b) => (
                          <tr key={b.memberId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2">{b.name}</td>
                            <td
                              className={`py-2 text-right font-mono font-semibold ${
                                b.balanceCents > 0
                                  ? "text-emerald-700"
                                  : b.balanceCents < 0
                                    ? "text-red-600"
                                    : "text-slate-500"
                              }`}
                            >
                              {formatCents(b.balanceCents, true)}
                            </td>
                            <td className="py-2 pl-3 text-right text-xs text-slate-500">
                              {b.balanceCents > 0
                                ? "gets back"
                                : b.balanceCents < 0
                                  ? "owes"
                                  : "settled"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    Sum of balances: {formatCents(detail.balanceTotalCents)}
                  </p>
                </section>
              </div>

              {/* Add expense */}
              <section className={card}>
                <h3 className="mb-3 font-semibold">Record an expense</h3>
                {detail.members.length === 0 ? (
                  <p className="text-sm text-slate-500">Add at least one member first.</p>
                ) : (
                  <form onSubmit={onAddExpense} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <label htmlFor="desc" className="mb-1 block text-xs font-medium text-slate-600">
                          Description
                        </label>
                        <input
                          id="desc"
                          className={input}
                          placeholder="e.g. Dinner"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="amount" className="mb-1 block text-xs font-medium text-slate-600">
                          Amount ($)
                        </label>
                        <input
                          id="amount"
                          className={input}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="payer" className="mb-1 block text-xs font-medium text-slate-600">
                          Paid by
                        </label>
                        <select
                          id="payer"
                          className={input}
                          value={payerId}
                          onChange={(e) => setPayerId(e.target.value)}
                        >
                          <option value="">Select payer…</option>
                          {detail.members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <fieldset>
                      <legend className="mb-1 text-xs font-medium text-slate-600">
                        Split equally between
                      </legend>
                      <div className="flex flex-wrap gap-3">
                        {detail.members.map((m) => (
                          <label key={m.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              className="accent-emerald-600"
                              checked={participants.includes(m.id)}
                              onChange={(e) =>
                                setParticipants((p) =>
                                  e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id),
                                )
                              }
                            />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="submit" className={button} disabled={busy}>
                      Add expense
                    </button>
                    <ErrorText message={expenseError} />
                  </form>
                )}
              </section>

              {/* History */}
              <section className={card}>
                <h3 className="mb-3 font-semibold">Expense history</h3>
                {detail.expenses.length === 0 ? (
                  <p className="text-sm text-slate-500">No expenses recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {detail.expenses.map((e) => (
                      <li key={e.id} className="py-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <div>
                            <p className="font-medium">{e.description}</p>
                            <p className="text-xs text-slate-500">
                              Paid by {nameOf(e.payerId)} ·{" "}
                              {new Date(e.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <p className="font-mono font-semibold">{formatCents(e.amountCents)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          Split:{" "}
                          {e.shares
                            .map((s) => `${nameOf(s.memberId)} ${formatCents(s.shareCents)}`)
                            .join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
