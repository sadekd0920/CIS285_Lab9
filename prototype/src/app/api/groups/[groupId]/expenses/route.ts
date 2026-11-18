import { NextResponse } from "next/server";
import { addExpense } from "@/lib/splitsmart";
import { handleError, readJson } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await ctx.params;
    return NextResponse.json(await addExpense(groupId, await readJson(req)), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
