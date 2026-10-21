import { NextResponse } from "next/server";
import getChefReservations from "@/actions/supabase/queries/getChefReservations";
import { getCurrentUser } from "@/lib/supabase/getUser";

/** Opt-in development integration probe; never enabled in production. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.RESERVATION_LIVE_TEST_ENABLED !== "1"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers },
    );
  }
  const testUserIds = [
    process.env.RESERVATION_TEST_USER_ID,
    process.env.RESERVATION_TEST_USER2_ID,
  ].filter(Boolean);
  if (!testUserIds.includes(user.id)) {
    return NextResponse.json(
      { error: "Test account required" },
      { status: 403, headers },
    );
  }

  try {
    const reservations = await getChefReservations();
    return NextResponse.json(
      { authenticatedUserId: user.id, reservations },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Reservation query failed" },
      { status: 502, headers },
    );
  }
}
