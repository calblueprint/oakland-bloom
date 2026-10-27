import Link from "next/link";
import { ReservationCard } from "@/components/ReservationCard";
import styles from "@/components/ReservationCard.module.css";
import { mockReservations } from "@/data/mockReservations";

export default function ReservationsPage() {
  return (
    <main>
      <h1>My Reservations</h1>

      {mockReservations.length == 0 ? (
        <p>You haven&apos;t requested any reservations yet.</p>
      ) : (
        <div className={styles.reservationList}>
          {mockReservations.map(reservation => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </div>
      )}

      {/* return navigation; links back to chef page */}
      <Link
        href="/chef"
        style={{
          display: "inline-block",
          padding: "12px 24px",
          backgroundColor: "#4f4f4f",
          color: "white",
          borderRadius: "8px",
          textDecoration: "none",
          marginTop: "16px",
        }}
      >
        Back to Home
      </Link>
    </main>
  );
}
