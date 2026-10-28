import { NextResponse } from "next/server";
import getOccupiedPeriods from "@/actions/supabase/queries/getOccupiedPeriods";
import { isValidCalendarRange } from "@/lib/calendarRange";
import { getCurrentUser } from "@/lib/supabase/getUser";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  if (!isValidCalendarRange(start, end)) {
    return NextResponse.json(
      { error: "Request a valid range of up to 42 days." },
      { status: 400, headers },
    );
  }
  try {
    if (!(await getCurrentUser())) {
      return NextResponse.json(
        { error: "Sign in required." },
        { status: 401, headers },
      );
    }
    return NextResponse.json(await getOccupiedPeriods(start, end), { headers });
  } catch {
    return NextResponse.json(
      { error: "Unable to load availability." },
      { status: 502, headers },
    );
  }
}
