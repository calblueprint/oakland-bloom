import NavButton from "@/components/NavButton";

export default function ReservationsPage() {
  return (
    <main>
      <h1>My Reservations</h1>

      <p>Your reservations will appear here.</p>

      {/* return navigation; links back to chef page */}
      <NavButton href="/chef">Back to Home</NavButton>
    </main>
  );
}
