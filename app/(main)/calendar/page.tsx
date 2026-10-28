import getChefReservations from "@/actions/supabase/queries/getChefReservations";
import { CalendarView } from "@/components/CalendarView";

export default async function CalendarPage() {
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
        </div>
        <CalendarView reservations={reservations} />
      </section>
    </main>
  );
}
