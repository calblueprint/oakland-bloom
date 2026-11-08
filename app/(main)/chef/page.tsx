import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import getChefReservations from "@/actions/supabase/queries/getChefReservations";
import { CalendarView } from "@/components/CalendarView";

// Chef's HOMEPAGE: their reservations calendar, plus other chefs' occupied times
export default async function ChefHome() {
  const reservations = await getChefReservations();

  return (
    <main className="calendar-page">
      <section className="calendar-card" aria-labelledby="calendar-heading">
        <h1 id="calendar-heading">Kitchen Reservations</h1>
        <div className="calendar-info">
          <span>All times: America/Los_Angeles</span>
          {reservations.length === 0 && (
            <span>You have no reservations yet.</span>
          )}
          {/* temporary until the sidebar design has a sign-out */}
          <form
            action={async () => {
              "use server";
              const result = await signOut();
              if (result?.error) {
                redirect("/error");
              }
            }}
          >
            <button type="submit">Sign out</button>
          </form>
        </div>
        <CalendarView reservations={reservations} />
      </section>
    </main>
  );
}
