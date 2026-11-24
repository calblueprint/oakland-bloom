import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import getCalendarReservations from "@/actions/supabase/queries/getCalendarReservations";
import { ReservationExperience } from "@/components/calendar/ReservationExperience";
import { getAccount } from "@/lib/auth/account";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Chef's HOMEPAGE: the kitchen reservation calendar. chef/layout.tsx adds the
// sidebar and (main)/layout.tsx has already checked the account is approved
export default async function ChefHome() {
  const [account, reservations] = await Promise.all([
    getAccount(),
    getCalendarReservations(),
  ]);
  if (!account) redirect("/login");

  return (
    <div className={instrumentSans.className}>
      <ReservationExperience
        reservations={reservations}
        contact={{
          name:
            [account.saved.firstName, account.saved.lastName]
              .filter(Boolean)
              .join(" ") || "Chef",
          email: account.email,
        }}
        signOut={
          <form
            action={async () => {
              "use server";
              const result = await signOut();
              if (result?.error) redirect("/error");
            }}
          >
            <button type="submit" className="calendar-sign-out">
              Sign out
            </button>
          </form>
        }
      />
    </div>
  );
}
