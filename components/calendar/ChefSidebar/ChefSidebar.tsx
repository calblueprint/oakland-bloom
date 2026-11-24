"use client";

import type { CalendarReservation } from "@/types/reservations";
import type { ReservationContact } from "../ReservationForm/ReservationForm";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/actions/auth/logout";
import brandLeaf from "@/assets/calendar/brand-leaf.png";
import home from "@/assets/calendar/home.svg";
import reservationIcon from "@/assets/calendar/reservations.svg";
import statistics from "@/assets/calendar/statistics.svg";
import {
  Brand,
  ContactAvatar,
  Sidebar,
  SidebarNav,
  SidebarUser,
  StatisticsDialog,
} from "./styles";

export function ChefSidebar({
  contact,
  reservations,
}: {
  contact: ReservationContact;
  reservations: CalendarReservation[];
}) {
  const stats = useRef<HTMLDialogElement>(null);
  const approved = reservations.filter(b => b.approval_status === "approved");
  const hours = approved.reduce(
    (sum, b) =>
      sum + (Date.parse(b.end_time) - Date.parse(b.start_time)) / 3600000,
    0,
  );
  return (
    <>
      <Sidebar aria-label="Chef navigation">
        <div>
          <Brand href="/calendar">
            <Image src={brandLeaf} alt="" width={37} height={29} />
            <span>Oakland Bloom</span>
          </Brand>
          <SidebarNav aria-label="Main navigation">
            <Link href="/calendar" aria-current="page">
              <Image src={home} alt="" />
              Home
            </Link>
            <Link href="/chef/reservations">
              <Image src={reservationIcon} alt="" />
              Your Reservations
            </Link>
            <button type="button" onClick={() => stats.current?.showModal()}>
              <Image src={statistics} alt="" />
              Usage Statistics
            </button>
          </SidebarNav>
        </div>
        <SidebarUser>
          <ContactAvatar aria-hidden="true">
            {contact.name
              .split(/\s+/)
              .map(n => n[0])
              .slice(0, 2)
              .join("")}
          </ContactAvatar>
          <div>
            <p>{contact.name}</p>
            <p>
              Chef{" "}
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out
              </button>
            </p>
          </div>
        </SidebarUser>
      </Sidebar>
      <StatisticsDialog ref={stats}>
        <h2>Usage Statistics</h2>
        <p>Based on your saved reservations.</p>
        <dl>
          <div>
            <dt>Approved reservations</dt>
            <dd>{approved.length}</dd>
          </div>
          <div>
            <dt>Approved hours</dt>
            <dd>
              {hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </dd>
          </div>
          <div>
            <dt>Pending requests</dt>
            <dd>
              {reservations.filter(b => b.approval_status === "pending").length}
            </dd>
          </div>
        </dl>
        <button type="button" onClick={() => stats.current?.close()}>
          Close
        </button>
      </StatisticsDialog>
    </>
  );
}
