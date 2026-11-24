"use client";

import type { CalendarReservation } from "@/types/reservations";
import { useCallback, useState } from "react";
import { Instrument_Sans } from "next/font/google";
import { ReservationCard } from "@/components/ReservationCard";
import {
  ReservationDetails,
  ReservationOwner,
} from "@/components/ReservationDetails";
import { ReservationList } from "@/components/ReservationList";
import {
  Layout,
  ListColumn,
  Notice,
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
  owner,
}: {
  reservations: CalendarReservation[];
  owner: ReservationOwner;
}) {
  // remembers and selects tab (upcoming is default vs past)
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  // the card whose details panel is open, if any
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // put focus back on the card that opened the panel
  const closeDetails = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    if (id) {
      requestAnimationFrame(() =>
        document.getElementById(`reservation-card-${id}`)?.focus(),
      );
    }
  }, [selectedId]);

  // announced after a cancel, since the card and panel both disappear
  const [notice, setNotice] = useState("");
  const onCancelled = useCallback(() => {
    setSelectedId(null);
    setNotice("Reservation cancelled.");
  }, []);

  const showTab = (tab: "upcoming" | "past") => {
    setActiveTab(tab);
    setSelectedId(null);
    setNotice("");
  };

  // filtering based on whether reservation is BEFORE or AFTER today's date
  const filteredReservations = reservations.filter(reservation => {
    const endTime = new Date(reservation.end_time);
    const now = new Date();

    if (activeTab === "upcoming") {
      return endTime >= now;
    }

    return endTime < now;
  });
  const selected =
    filteredReservations.find(reservation => reservation.id === selectedId) ??
    null;

  return (
    // makes sure all the elements inherit the same instrument sans font
    <PageContainer className={instrumentSans.className}>
      <Layout $withDetails={!!selected}>
        <ListColumn>
          <PageTitle>Your Reservations</PageTitle>
          <PageSubtitle>
            View and manage your kitchen reservations.
          </PageSubtitle>

          <TabContainer>
            <TabButton
              type="button"
              $active={activeTab === "upcoming"}
              onClick={() => showTab("upcoming")}
            >
              Upcoming
            </TabButton>

            <TabButton
              type="button"
              $active={activeTab === "past"}
              onClick={() => showTab("past")}
            >
              Past
            </TabButton>
          </TabContainer>

          {/* always mounted so screen readers hear it */}
          <Notice role="status">{notice}</Notice>

          {filteredReservations.length === 0 ? (
            <p>
              {activeTab === "upcoming"
                ? "You don't have any upcoming reservations."
                : "You don't have any past reservations."}
            </p>
          ) : (
            <ReservationList>
              {filteredReservations.map(reservation => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  selected={reservation.id === selectedId}
                  onSelect={() => {
                    setNotice("");
                    setSelectedId(id =>
                      id === reservation.id ? null : reservation.id,
                    );
                  }}
                />
              ))}
            </ReservationList>
          )}
        </ListColumn>

        {selected && (
          <ReservationDetails
            key={selected.id}
            reservation={selected}
            owner={owner}
            onClose={closeDetails}
            onCancelled={onCancelled}
          />
        )}
      </Layout>
    </PageContainer>
  );
}
