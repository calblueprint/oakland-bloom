import getCalendarReservations from "@/actions/supabase/queries/getCalendarReservations";
import { ReservationCard } from "@/components/ReservationCard";
import { ReservationList } from "@/components/ReservationList";

export default async function ReservationsPage() {
  const reservations = await getCalendarReservations();
  return (
    <main>
      <h1>My Reservations</h1>

      {reservations.length === 0 ? (
        <p>You haven&apos;t requested any reservations yet.</p>
      ) : (
        <ReservationList>
          {reservations.map(reservation => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </ReservationList>
      )}
    </main>
  );
}
