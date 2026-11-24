"use client";

import styled from "styled-components";
import COLORS from "@/styles/colors";

// below this width there isn't room for the panel beside the cards, so it
// becomes a bottom sheet over the page
export const DETAILS_BREAKPOINT = "75rem";

// Figma: "Upcoming Reservations - Details", node 910:9744

// a card beside the reservation list on wide screens, a bottom sheet below
// DETAILS_BREAKPOINT
export const Panel = styled.aside`
  position: sticky;
  top: 2rem;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 1.25rem 0.9375rem;
  border: 1px solid ${COLORS.divider};
  border-radius: 0.75rem;
  background: ${COLORS.white};

  @media (max-width: ${DETAILS_BREAKPOINT}) {
    position: fixed;
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    /* a phone-sized sheet, centred on tablets and small laptops */
    max-width: 32rem;
    margin: 0 auto;
    max-height: 85dvh;
    overflow-y: auto;
    padding: 1.25rem max(1rem, env(safe-area-inset-right, 0px))
      calc(1.25rem + env(safe-area-inset-bottom, 0px))
      max(1rem, env(safe-area-inset-left, 0px));
    border-radius: 0.75rem 0.75rem 0 0;
    box-shadow: 0 -0.5rem 2rem rgba(32, 32, 30, 0.16);
  }
`;

// dims the page behind the bottom sheet; tapping it closes the panel
export const Backdrop = styled.div`
  display: none;

  @media (max-width: ${DETAILS_BREAKPOINT}) {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 29;
    background: rgba(32, 32, 30, 0.32);
  }
`;

export const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
`;

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
`;

export const Heading = styled.h2`
  margin: 0;

  /* focus moves here when the panel opens so screen readers start in it;
     the heading isn't interactive, so don't draw a focus ring */
  &:focus {
    outline: none;
  }
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.5rem;
  letter-spacing: -0.01125rem;
  color: ${COLORS.ink};
`;

export const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  font: inherit;
  font-size: 1.125rem;
  line-height: 1;
  color: ${COLORS.heading};
  cursor: pointer;

  &:hover {
    background: ${COLORS.buttonFill};
  }

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`;

export const Divider = styled.hr`
  width: 100%;
  height: 0.5px;
  margin: 0;
  border: none;
  background: ${COLORS.divider};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
`;

// the small caps labels: the reservation's title, AMENITIES, CONTACT
export const SectionLabel = styled.h3`
  margin: 0 0 0.25rem;
  font-size: 0.5rem;
  font-weight: 600;
  line-height: 1rem;
  letter-spacing: 0.035rem;
  text-transform: uppercase;
  color: ${COLORS.heading};
  overflow-wrap: anywhere;
`;

export const InfoList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
`;

// icon then text, 16px apart. $muted is the grey contact rows
export const InfoRow = styled.li<{ $muted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: ${({ $muted }) => ($muted ? COLORS.heading : COLORS.ink)};
  overflow-wrap: anywhere;

  svg {
    flex-shrink: 0;
  }
`;

// fixed-width slot so the text lines up whatever each icon's width is
export const InfoIcon = styled.span`
  display: inline-flex;
  justify-content: center;
  width: 0.875rem;
  flex-shrink: 0;
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
`;

const actionButton = `
  width: 100%;
  height: 2.3125rem;
  padding: 0 1rem;
  border-radius: 0.5rem;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

export const EditButton = styled.button`
  ${actionButton}
  border: 1px solid ${COLORS.heading};
  background: ${COLORS.white};
  color: ${COLORS.ink};
`;

export const CancelButton = styled.button`
  ${actionButton}
  cursor: pointer;
  border: 1px solid ${COLORS.accent};
  background: ${COLORS.accent};
  color: ${COLORS.white};
`;

export const ActionsNote = styled.p`
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1rem;
  color: ${COLORS.muted};
`;

export const ConfirmText = styled.p`
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: ${COLORS.ink};
`;

export const CancelErrorText = styled.p`
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: ${COLORS.accent};
`;
