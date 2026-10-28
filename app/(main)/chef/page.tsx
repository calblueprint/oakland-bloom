import NavButton from "@/components/NavButton";

// export makes it available for other files to import
// Chef's HOMEPAGE
export default function ChefHome() {
  return (
    <main>
      <h1>Chef Home</h1>

      <NavButton href="/chef/reservations">View My Reservations</NavButton>
    </main>
  );
}
