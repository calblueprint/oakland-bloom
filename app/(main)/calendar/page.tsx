import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { getAccount } from "@/actions/supabase/queries/account";
import { getChefReservations } from "@/actions/supabase/queries/reservations";
import { ReservationExperience } from "@/components/calendar/ReservationExperience/ReservationExperience";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Load the signed-in chef's reservations and render the calendar.
export default async function CalendarPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  const reservations = await getChefReservations();

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
