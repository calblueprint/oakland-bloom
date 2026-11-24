import { getChefReservations } from "@/actions/supabase/queries/reservations";
import ReservationTabs from "./ReservationTabs";

// loads the signed-in chef's saved reservations on the server; the tabs that
// filter them need client state, so they live in ReservationTabs
export default async function ReservationsPage() {
  const reservations = await getChefReservations();
  return <ReservationTabs reservations={reservations} />;
}
