import NavButton from "@/components/NavButton";
import { ReservationCard } from "@/components/ReservationCard";
import { ReservationList } from "@/components/ReservationList";
import { mockReservations } from "@/data/mockReservations";

export default function ReservationsPage() {
  return (
    <main>
      <h1>My Reservations</h1>

      {mockReservations.length == 0 ? (
        <p>You haven&apos;t requested any reservations yet.</p>
      ) : (
        <ReservationList>
          {mockReservations.map(reservation => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </ReservationList>
      )}

      {/* return navigation; links back to chef page */}
      <NavButton href="/chef">Back to Home</NavButton>
    </main>
  );
}
