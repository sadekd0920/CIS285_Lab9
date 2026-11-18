import { NextResponse } from "next/server";
import { getGroupDetail } from "@/lib/splitsmart";
import { handleError } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await ctx.params;
    return NextResponse.json(await getGroupDetail(groupId));
  } catch (e) {
    return handleError(e);
  }
}
