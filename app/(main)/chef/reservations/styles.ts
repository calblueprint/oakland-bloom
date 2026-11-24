"use client";

import styled from "styled-components";
import { DETAILS_BREAKPOINT } from "@/components/ReservationDetails/styles";
import COLORS from "@/styles/colors";

// wrap page content in a styled container, so cards don't stretch across entire browser page
export const PageContainer = styled.main`
  width: 100%;
  max-width: 933px;
  margin: 0 auto;

  /* top & bottom padding; left and right padding; bottom padding */
  padding: 3rem 2rem 2rem;

  @media (max-width: 600px) {
    padding: 1rem;
  }
`;

// styles the Your Reservations text box
export const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 600;
  color: ${COLORS.text};
  margin-bottom: 0.8rem;
`;

// styles the View and manage reservations text box
export const PageSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${COLORS.muted};
  margin-bottom: 2rem;
`;

// for "Upcoming" VS "Past" reservation tabs
export const TabContainer = styled.div`
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid ${COLORS.tabDivider};
  margin-bottom: 1rem;
`;

// controls how tab's appearance changes when highlighted VS not
export const TabButton = styled.button<{ $active: boolean }>`
  /* top & bottom padding; left and right padding; bottom padding */
  padding: 0.75rem 1rem 1rem;

  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ $active }) => ($active ? COLORS.accent : "transparent")};

  color: ${({ $active }) => ($active ? COLORS.text : COLORS.muted)};

  font-size: 0.95rem;
  font-family: inherit;
  font-weight: ${({ $active }) => ($active ? "500" : "300")};

  cursor: pointer;
`;

// the page (title, tabs, list), plus the details panel beside it when a card
// is open. the panel starts level with the title (Figma)
export const Layout = styled.div<{ $withDetails: boolean }>`
  display: grid;
  grid-template-columns: ${({ $withDetails }) =>
    $withDetails ? "minmax(0, 1fr) 15.6875rem" : "minmax(0, 1fr)"};
  gap: 2rem;
  align-items: start;

  /* the panel becomes a bottom sheet here, so the list keeps the full width */
  @media (max-width: ${DETAILS_BREAKPOINT}) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const ListColumn = styled.div`
  min-width: 0;
`;

// "Reservation cancelled." after a cancel; empty (and takes no room) otherwise
export const Notice = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: ${COLORS.tagGreenText};

  &:not(:empty) {
    margin-bottom: 1rem;
  }
`;
