"use client";

import type { CalendarReservation } from "@/types/reservations";
import { useState } from "react";
import { Instrument_Sans } from "next/font/google";
import { ReservationCard } from "@/components/ReservationCard/ReservationCard";
import { ReservationList } from "@/components/ReservationList/ReservationList";
import {
  PageContainer,
  PageSubtitle,
  PageTitle,
  TabButton,
  TabContainer,
} from "./styles";

// defining font
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

export default function ReservationTabs({
  reservations,
}: {
  reservations: CalendarReservation[];
}) {
  // remembers and selects tab (upcoming is default vs past)
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // filtering based on whether reservation is BEFORE or AFTER today's date
  const filteredReservations = reservations.filter(reservation => {
    const endTime = new Date(reservation.end_time);
    const now = new Date();

    if (activeTab === "upcoming") {
      return endTime >= now;
    }

    return endTime < now;
  });

  return (
    // makes sure all the elements inherit the same instrument sans font
    <PageContainer className={instrumentSans.className}>
      <PageTitle>Your Reservations</PageTitle>
      <PageSubtitle>View and manage your kitchen reservations.</PageSubtitle>

      <TabContainer>
        <TabButton
          type="button"
          $active={activeTab === "upcoming"}
          onClick={() => setActiveTab("upcoming")}
        >
          Upcoming
        </TabButton>

        <TabButton
          type="button"
          $active={activeTab === "past"}
          onClick={() => setActiveTab("past")}
        >
          Past
        </TabButton>
      </TabContainer>

      {filteredReservations.length === 0 ? (
        <p>
          {activeTab === "upcoming"
            ? "You don't have any upcoming reservations."
            : "You don't have any past reservations."}
        </p>
      ) : (
        <ReservationList>
          {filteredReservations.map(reservation => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </ReservationList>
      )}
    </PageContainer>
  );
}
