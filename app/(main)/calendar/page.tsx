import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import getCalendarReservations from "@/actions/supabase/queries/getCalendarReservations";
import { ReservationExperience } from "@/components/calendar/ReservationExperience";
import { getAccount } from "@/lib/auth/account";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Load the signed-in chef's reservations and render the calendar.
export default async function CalendarPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  const reservations = await getCalendarReservations();

  return (
    <div className={instrumentSans.className}>
      <ReservationExperience
        reservations={reservations}
        contact={{
          name:
            [account.saved.firstName, account.saved.lastName]
              .filter(Boolean)
              .join(" ") || "Chef",
          email: account.email,
        }}
      />
    </div>
  );
}
