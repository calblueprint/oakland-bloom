import Link from "next/link";

// export makes it available for other files to import
// Chef's HOMEPAGE
export default function ChefHome() {
  return (
    <main>
      <h1>Chef Home</h1>

      {/* TODO: update from generic styling after yash creates design */}
      <Link
        href="/chef/reservations"
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
        View My Reservations
      </Link>
    </main>
  );
}
