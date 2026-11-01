import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** ALB target-group health check. Verifies the app can reach the database. */
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
