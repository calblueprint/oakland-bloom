import Link from "next/link";

export default function ErrorPage() {
  return (
    <main style={{ padding: "4rem 1rem", textAlign: "center" }}>
      <h1>Something went wrong</h1>
      <Link href="/">Go back home</Link>
    </main>
  );
}
