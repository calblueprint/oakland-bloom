import getCalendarReservations from "@/actions/supabase/queries/getCalendarReservations";
import { getAccount } from "@/lib/auth/account";
import ReservationTabs from "./ReservationTabs";

// loads the signed-in chef's saved reservations on the server; the tabs that
// filter them need client state, so they live in ReservationTabs
export default async function ReservationsPage() {
  // both cached per request; (main)/layout.tsx has already checked the account
  const [reservations, account] = await Promise.all([
    getCalendarReservations(),
    getAccount(),
  ]);
  return (
    <ReservationTabs
      reservations={reservations}
      owner={{
        email: account?.email ?? "",
        phone: account?.saved.phone ?? "",
      }}
    />
  );
}
