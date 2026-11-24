import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { getAccount } from "@/actions/supabase/queries/account";
import { getChefReservations } from "@/actions/supabase/queries/reservations";
import { ReservationExperience } from "@/components/calendar/ReservationExperience/ReservationExperience";
import { SignOutButton as SignOutStyle } from "@/components/calendar/ReservationExperience/styles";
import SignOutButton from "@/components/SignOutButton/SignOutButton";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Chef's HOMEPAGE: the kitchen reservation calendar. chef/layout.tsx adds the
// sidebar and (main)/layout.tsx has already checked the account is approved
export default async function ChefHome() {
  const [account, reservations] = await Promise.all([
    getAccount(),
    getChefReservations(),
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
        signOut={<SignOutButton as={SignOutStyle} />}
      />
    </div>
  );
}
