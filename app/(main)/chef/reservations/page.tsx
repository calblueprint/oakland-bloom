"use client";

import { useState } from "react";
import { ReservationCard } from "@/components/ReservationCard";
import { ReservationList } from "@/components/ReservationList";
import { mockReservations } from "@/data/mockReservations";
import {
  PageContainer,
  PageSubtitle,
  PageTitle,
  TabButton,
  TabContainer,
} from "./styles";

export default function ReservationsPage() {
  // remembers and selects tab (upcoming is default vs past)
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // filtering based on whether reservation is BEFORE or AFTER today's date
  const filteredReservations = mockReservations.filter(reservation => {
    const endTime = new Date(reservation.end_time);
    const now = new Date();

    if (activeTab === "upcoming") {
      return endTime >= now;
    }

    return endTime < now;
  });

  return (
    <PageContainer>
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
        <p>You haven&apos;t requested any reservations yet.</p>
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
