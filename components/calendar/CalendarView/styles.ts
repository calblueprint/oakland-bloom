"use client";

import styled, { css } from "styled-components";
import COLORS from "@/styles/colors";
import { COMPACT, MOBILE } from "../breakpoints";

export const ControlRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 38px;
  margin-bottom: 16px;
`;

export const Navigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;

  @media ${COMPACT} {
    gap: 4px;
  }
  @media ${MOBILE} {
    width: 100%;
    justify-content: flex-end;
  }
`;

export const DatePicker = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 14px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;

  img {
    transform: rotate(-90deg);
  }
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  @media ${COMPACT} {
    margin-right: 4px;
  }
  @media ${MOBILE} {
    margin-right: auto;
  }
`;

export const TodayButton = styled.button`
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid ${COLORS.divider};
  border-radius: 12px;
  color: ${COLORS.heading};
  background: ${COLORS.white};
  font-size: 12px;
  margin-right: 10px;
`;

export const ArrowButton = styled.button`
  display: flex;
  padding: 0;
  border: 0;
  background: none;

  img {
    display: block;
  }
`;

export const AvailabilityMessage = styled.p`
  padding: 10px;
  margin-bottom: 12px;
  border: 1px solid ${COLORS.warningBorder};
  border-radius: 8px;
  background: ${COLORS.warningFill};
  font-size: 12px;
  line-height: 1.5;

  button {
    margin-left: 8px;
    padding: 4px 8px;
  }
`;

export const CalendarContainer = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
  --fc-monarch-primary: ${COLORS.accent};
  --fc-monarch-primary-foreground: ${COLORS.white};
  --fc-monarch-primary-over: ${COLORS.accentHover};
  --fc-monarch-primary-down: ${COLORS.accentPressed};
  --fc-monarch-secondary: ${COLORS.accentSoft};
  --fc-monarch-secondary-foreground: ${COLORS.accent};
  --fc-monarch-secondary-over: ${COLORS.accentSoft};
  --fc-monarch-secondary-down: ${COLORS.accentSoftPressed};
  --fc-monarch-tertiary: ${COLORS.calendarGreen};
  --fc-monarch-tertiary-foreground: ${COLORS.white};
  --fc-monarch-event: ${COLORS.statusApprovedFill};
  --fc-monarch-event-contrast: ${COLORS.statusApprovedText};
  --fc-monarch-highlight: ${COLORS.accentHighlight};
  --fc-monarch-now: ${COLORS.accent};
  --fc-monarch-selected: ${COLORS.accentSoft};
  --fc-monarch-selected-foreground: ${COLORS.accent};
  --fc-monarch-outline: ${COLORS.accent};
  --fc-monarch-background: ${COLORS.white};
  --fc-monarch-popover: ${COLORS.white};
  --fc-monarch-foreground: ${COLORS.ink};
  --fc-monarch-faint-foreground: ${COLORS.muted};
  --fc-monarch-muted-foreground: ${COLORS.heading};
  --fc-monarch-faint: ${COLORS.white};
  --fc-monarch-muted: ${COLORS.calendarSurfaceMuted};
  --fc-monarch-strong: ${COLORS.divider};
  --fc-monarch-stronger: ${COLORS.border};
  --fc-monarch-strongest: ${COLORS.calendarGridLine};
  --fc-monarch-border: ${COLORS.calendarPlaceholder};
  --fc-monarch-strong-border: ${COLORS.calendarGridLine};

  > * {
    min-width: 0;
    max-width: 100%;
  }
  .calendar-grid {
    font-size: 12px;
    line-height: 1.3333;
  }
  .calendar-day-cell {
    border: 0;
    background: ${COLORS.white};
  }
  .calendar-time-label {
    min-height: 16px;
    color: ${COLORS.heading};
    font-size: 12px;
    letter-spacing: 0.5px;
  }
  .calendar-time-label-inner {
    min-height: 16px;
    padding: 0 6px 0 0;
    font-size: 12px;
    line-height: 16px;
  }
  .calendar-time-slot {
    min-height: 27px;
  }
  .availability-cell {
    opacity: 1;
    background-color: var(--fc-event-color);
    border-right: 0.5px solid ${COLORS.calendarGridLine};
    border-bottom: 0.5px solid ${COLORS.calendarGridLine};
    pointer-events: none;
    border-radius: 0;
    box-shadow:
      inset -0.5px 0 ${COLORS.calendarGridLine},
      inset 0 -0.5px ${COLORS.calendarGridLine};
  }
  .reservation-block {
    color: var(--fc-event-contrast-color);
    background: var(--fc-event-color);
    border: 1px solid ${COLORS.statusApprovedBorder};
    border-left-width: 3px;
    border-radius: 4px;
    cursor: pointer;
  }
  .reservation-block--pending {
    border: 1px dashed ${COLORS.statusPendingBorder};
    background: ${COLORS.statusPendingFill};
  }
  .reservation-block--denied {
    border-color: ${COLORS.statusDeniedBorder};
  }
  .reservation-block--draft {
    border: 1px solid ${COLORS.accent};
    color: ${COLORS.accent};
    background: ${COLORS.accentSoft};
    cursor: grab;
  }
`;

export const DayHeading = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
`;

export const Weekday = styled.span<{ $today: boolean }>`
  color: ${({ $today }) => ($today ? COLORS.accent : COLORS.muted)};
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.8px;
  text-transform: uppercase;
`;

export const DayNumber = styled.span<{ $today: boolean }>`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 20px;
  font-weight: 400;
  line-height: 24px;

  ${({ $today }) =>
    $today &&
    css`
      background: ${COLORS.accent};
      color: ${COLORS.white};
    `}
`;

export const EventContent = styled.div<{ $short: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0;
  height: auto;
  min-width: 0;
  padding: 2px 6px;
  font-size: 11px;
  line-height: 12px;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    line-height: 14px;
  }

  ${({ $short }) =>
    $short &&
    css`
      gap: 0;
      padding: 1px 4px;
      font-size: 9px;
      line-height: 11px;

      strong {
        font-size: 10px;
        line-height: 12px;
      }
      > span:nth-of-type(n + 2) {
        display: none;
      }
    `}

  @media ${MOBILE} {
    padding: 3px;
    font-size: 10px;
    line-height: 14px;

    strong {
      font-size: 11px;
    }
  }
`;

export const EventStatus = styled.span`
  margin-top: auto;
  text-transform: capitalize;
`;
