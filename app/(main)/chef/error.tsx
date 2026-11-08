"use client";

export default function CalendarError({ reset }: { reset: () => void }) {
  return (
    <main role="alert">
      <p>Unable to load reservations. Please try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
