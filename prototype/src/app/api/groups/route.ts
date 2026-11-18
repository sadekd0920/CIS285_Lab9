import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/lib/splitsmart";
import { handleError, readJson } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json(await listGroups());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    return NextResponse.json(await createGroup(await readJson(req)), { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
