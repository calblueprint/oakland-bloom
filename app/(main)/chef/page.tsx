import Link from "next/link";

// export makes it available for other files to import
// Chef's HOMEPAGE
export default function ChefHome() {
  return (
    <main>
      <h1>Chef Home</h1>

      {/* changed from button to view Chef's Reservations to Link */}
      {/* TODO: add styling (style={{}}) after yash creates design */}
      <Link href="/chef/reservations">View My Reservations</Link>
    </main>
  );
}
