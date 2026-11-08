"use client";

import Image from "next/image";
import Link from "next/link";
import styled, { css } from "styled-components";
import { SIDEBAR_BREAKPOINT } from "@/components/Sidebar/styles";
import COLORS from "@/styles/colors";

// Figma: list 1043-9925, details panel open 1056-10458

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`;

const small = css`
  font-size: 0.75rem;
  line-height: 1.25rem;
`;

// screen-reader-only text, e.g. which chef a card's button is for
export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

// list on the left, details panel on the right. the design's 960px content
// width is shared: the list narrows when the panel opens. AppShell's Content
// already pads the page, so this only adds what the design has on top
export const Page = styled.main`
  display: flex;
  align-items: flex-start;
  gap: 2rem;
  max-width: 60rem;
  padding-top: 1rem;
  color: ${COLORS.ink};
`;

export const ListColumn = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2rem;
  min-width: 0;
`;

export const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1.5rem;
`;

export const Title = styled.h1`
  margin: 0;
  font-size: 1.875rem;
  font-weight: 500;
  line-height: 1.5rem;
  letter-spacing: -0.01875rem;
`;

export const Subtitle = styled.p`
  margin: 0;
  font-size: 1rem;
  line-height: 1.5rem;
  color: ${COLORS.heading};
`;

export const ListSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

// tabs

export const TabList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Tab = styled(Link)`
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border: 1px solid ${COLORS.divider};
  border-radius: 1rem;
  ${small}
  font-weight: 500;
  color: ${COLORS.heading};
  text-decoration: none;
  ${focusRing}

  &:hover {
    border-color: ${COLORS.muted};
  }

  &[aria-current="page"] {
    border-color: ${COLORS.muted};
    color: ${COLORS.ink};
  }
`;

// messages and empty states

const message = css`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

// both live regions stay mounted; with nothing to say they take no room
export const Messages = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &:not(:has(p)) {
    margin-top: -1rem;
  }
`;

export const Notice = styled.p`
  ${message}
  color: ${COLORS.heading};
`;

export const ErrorText = styled.p`
  ${message}
  color: ${COLORS.accent};
`;

export const EmptyState = styled.p`
  ${message}
  padding: 2rem;
  border: 1px dashed ${COLORS.divider};
  border-radius: 0.625rem;
  color: ${COLORS.heading};
  text-align: center;
`;

// account cards

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Card = styled.li<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 5.875rem;
  padding: 1rem 2rem;
  border: 1px solid
    ${({ $selected }) => ($selected ? COLORS.heading : COLORS.divider)};
  border-radius: 0.625rem;
  background: ${COLORS.white};

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    padding: 1rem 1.25rem;
  }
`;

export const CardInfo = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const cardLine = css`
  margin: 0;
  ${small}
  overflow-wrap: anywhere;
`;

export const CardName = styled.p`
  ${cardLine}
  margin-bottom: 0.125rem;
  font-size: 0.875rem;
  font-weight: 600;
`;

export const CardEmail = styled.p`
  ${cardLine}
  color: ${COLORS.heading};
`;

export const CardRestaurant = styled.p`
  ${cardLine}
  color: ${COLORS.muted};
`;

export const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-shrink: 0;

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    gap: 1rem;
  }
`;

// green until its chef is open in the panel, then neutral like the design
export const RowButton = styled(Link)<{ $selected: boolean }>`
  padding: 0.5rem 1rem;
  border: 1px solid
    ${({ $selected }) => ($selected ? COLORS.divider : COLORS.approveBorder)};
  border-radius: 0.75rem;
  background: ${({ $selected }) =>
    $selected ? COLORS.white : COLORS.approveFill};
  ${small}
  font-weight: 500;
  color: ${({ $selected }) =>
    $selected ? COLORS.heading : COLORS.approveText};
  text-decoration: none;
  white-space: nowrap;
  ${focusRing}

  &:hover {
    border-color: ${({ $selected }) =>
      $selected ? COLORS.muted : COLORS.approveText};
  }
`;

export const ChevronLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  /* bigger target than the 6x10 icon */
  width: 1.5rem;
  height: 1.5rem;
  margin: -0.5rem;
  border-radius: 0.375rem;
  ${focusRing}

  &:hover {
    background: ${COLORS.buttonFill};
  }
`;

// the source chevron points left; the design turns it to point right
export const Chevron = styled(Image)`
  transform: rotate(180deg);
`;

// details panel

export const PanelSlot = styled.div`
  position: sticky;
  top: 2rem;
  flex-shrink: 0;
  width: 15.6875rem;
  margin-top: 3rem;

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    position: static;
    width: auto;
    margin: 0;
  }
`;

// a side panel on desktop; a full-screen sheet over the list on small screens
export const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 0.9375rem;
  border: 1px solid ${COLORS.divider};
  border-radius: 0.75rem;
  background: ${COLORS.white};

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    position: fixed;
    inset: 0;
    z-index: 30;
    overflow-y: auto;
    padding: 1.5rem 1rem 2rem;
    border: none;
    border-radius: 0;
  }
`;

export const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const PanelTitle = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.5rem;
  letter-spacing: -0.01125rem;
`;

// not in the design; small and quiet so the panel still reads like the frame
export const CloseLink = styled(Link)`
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  ${small}
  color: ${COLORS.heading};
  text-decoration: none;
  ${focusRing}

  &:hover {
    color: ${COLORS.ink};
    text-decoration: underline;
  }
`;

export const Divider = styled.hr`
  width: 100%;
  height: 0.5px;
  margin: 0;
  border: none;
  border-radius: 1px;
  background: ${COLORS.divider};
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const SectionLabel = styled.h3`
  margin: 0;
  font-size: 0.5rem;
  font-weight: 600;
  line-height: 1rem;
  letter-spacing: 0.035rem;
  text-transform: uppercase;
  color: ${COLORS.heading};
`;

export const Values = styled.div<{ $gap?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => ($gap ? "0.5rem" : "0")};
  ${small}

  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

export const Primary = styled.p`
  color: ${COLORS.ink};
`;

export const Secondary = styled.p`
  color: ${COLORS.heading};
`;

// shown where the database has nothing saved for a field
export const Missing = styled.p`
  font-style: italic;
  color: ${COLORS.muted};
`;

export const PanelActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  form {
    display: flex;
  }
`;

const panelButton = css`
  flex: 1;
  height: 2.3125rem;
  padding: 0 1rem;
  border: 1px solid;
  border-radius: 0.5rem;
  background: ${COLORS.white};
  font: inherit;
  ${small}
  font-weight: 500;
  cursor: pointer;
  ${focusRing}

  &:disabled {
    cursor: progress;
    opacity: 0.6;
  }
`;

export const ApproveButton = styled.button`
  ${panelButton}
  border-color: ${COLORS.heading};
  color: ${COLORS.ink};

  &:hover:not(:disabled) {
    background: ${COLORS.buttonFill};
  }
`;

export const DeclineButton = styled.button`
  ${panelButton}
  border-color: ${COLORS.accent};
  color: ${COLORS.accent};

  &:hover:not(:disabled) {
    background: ${COLORS.buttonFill};
  }
`;
