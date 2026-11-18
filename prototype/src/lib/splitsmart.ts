/**
 * Application service layer: validation + persistence for SplitSmart.
 */
import { prisma } from "./db";
import { computeBalances, parseAmountToCents, splitEqually } from "./money";

export class ValidationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const MAX_NAME = 60;
const MAX_DESCRIPTION = 200;

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} is required.`);
  }
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters.`);
  }
  return text;
}

function parseId(value: unknown, field: string): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
    throw new ValidationError(`${field} is not a valid ID.`);
  }
  return n;
}

export async function listGroups() {
  const groups = await prisma.group.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { members: true, expenses: true } } },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    memberCount: g._count.members,
    expenseCount: g._count.expenses,
  }));
}

export async function createGroup(input: { name?: unknown }) {
  const name = requireText(input.name, "Group name", MAX_NAME);
  const g = await prisma.group.create({ data: { name } });
  return { id: g.id, name: g.name, createdAt: g.createdAt };
}

async function requireGroup(groupIdRaw: unknown) {
  const groupId = parseId(groupIdRaw, "Group");
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new ValidationError("Group not found.", 404);
  return group;
}

export async function addMember(groupIdRaw: unknown, input: { name?: unknown }) {
  const group = await requireGroup(groupIdRaw);
  const name = requireText(input.name, "Member name", MAX_NAME);
  const existing = await prisma.member.findMany({ where: { groupId: group.id } });
  if (existing.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    throw new ValidationError(`A member named "${name}" already exists in this group.`, 409);
  }
  const m = await prisma.member.create({ data: { name, groupId: group.id } });
  return { id: m.id, name: m.name };
}

export async function addExpense(
  groupIdRaw: unknown,
  input: {
    description?: unknown;
    amount?: unknown;
    payerId?: unknown;
    participantIds?: unknown;
  },
) {
  const group = await requireGroup(groupIdRaw);
  const description = requireText(input.description, "Description", MAX_DESCRIPTION);

  let amountCents: number;
  try {
    amountCents = parseAmountToCents(input.amount);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }

  if (input.payerId === undefined || input.payerId === null || input.payerId === "") {
    throw new ValidationError("Select who paid.");
  }
  const payerId = parseId(input.payerId, "Payer");

  if (!Array.isArray(input.participantIds) || input.participantIds.length === 0) {
    throw new ValidationError("Select at least one participant.");
  }
  const participantIds = input.participantIds.map((p) => parseId(p, "Participant"));
  if (new Set(participantIds).size !== participantIds.length) {
    throw new ValidationError("Each participant can only be selected once.");
  }

  const members = await prisma.member.findMany({ where: { groupId: group.id } });
  const memberIds = new Set(members.map((m) => m.id));
  if (!memberIds.has(payerId)) {
    throw new ValidationError("The payer must be a member of this group.");
  }
  const outsiders = participantIds.filter((id) => !memberIds.has(id));
  if (outsiders.length > 0) {
    throw new ValidationError(
      `All participants must be members of this group (invalid ID: ${outsiders.join(", ")}).`,
    );
  }

  const shares = splitEqually(amountCents, participantIds);
  const expense = await prisma.expense.create({
    data: {
      groupId: group.id,
      description,
      amountCents,
      payerId,
      shares: {
        create: [...shares].map(([memberId, shareCents]) => ({ memberId, shareCents })),
      },
    },
    include: { shares: true },
  });
  return expense;
}

export async function getGroupDetail(groupIdRaw: unknown) {
  const group = await requireGroup(groupIdRaw);
  const [members, expenses] = await Promise.all([
    prisma.member.findMany({ where: { groupId: group.id }, orderBy: { id: "asc" } }),
    prisma.expense.findMany({
      where: { groupId: group.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { shares: { orderBy: { memberId: "asc" } } },
    }),
  ]);
  const balanceMap = computeBalances(
    members.map((m) => m.id),
    expenses,
  );
  const balances = members.map((m) => ({
    memberId: m.id,
    name: m.name,
    balanceCents: balanceMap.get(m.id) ?? 0,
  }));
  const balanceTotalCents = balances.reduce((s, b) => s + b.balanceCents, 0);
  return {
    group: { id: group.id, name: group.name, createdAt: group.createdAt },
    members: members.map((m) => ({ id: m.id, name: m.name })),
    expenses: expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      payerId: e.payerId,
      createdAt: e.createdAt,
      shares: e.shares.map((s) => ({ memberId: s.memberId, shareCents: s.shareCents })),
    })),
    balances,
    balanceTotalCents,
  };
}
