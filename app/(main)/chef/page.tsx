import SignOutButton from "@/components/SignOutButton/SignOutButton";

// export makes it available for other files to import
// Chef's HOMEPAGE
export default function ChefHome() {
  return (
    <main>
      <h1>Chef Home</h1>

      {/* temporary until the sidebar design has a sign-out */}
      <SignOutButton />
    </main>
  );
}
