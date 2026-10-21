import Link from "next/link";

export default function ReservationsPage() {
  return (
    <main>
      <h1>My Reservations</h1>

      <p>Your reservations will appear here.</p>

      {/* return navigation; links back to chef page */}
      <Link
        href="/chef"
        style={{
          display: "inline-block",
          padding: "12 px 24 px",
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
