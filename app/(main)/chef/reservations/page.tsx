import Link from "next/link";

export default function ReservationsPage() {
  return (
    <main>
      <h1>My Reservations</h1>

      <p>Your reservations will appear here.</p>

      {/* return navigation; links back to chef page */}
      <Link href="/chef">Back to Home</Link>
    </main>
  );
}
