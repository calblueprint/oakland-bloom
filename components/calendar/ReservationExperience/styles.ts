"use client";

import styled, { css } from "styled-components";
import COLORS from "@/styles/colors";
import { COMPACT, MOBILE, TABLET, WIDE } from "../breakpoints";

export const Shell = styled.div`
  color: ${COLORS.ink};
  background: ${COLORS.white};

  button,
  input,
  summary {
    font-family: inherit;
  }
  button,
  summary {
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  :is(button, summary, input, a):focus-visible {
    outline: 2px solid ${COLORS.calendarGreen};
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
      transition: none;
    }
  }
`;

// AppShell (chef/layout.tsx) already pads the page by 32px. This adds the rest
// of the original calendar spacing: 48px above and clamp(24px, 4.75vw, 64px)
// at the sides on wide screens
export const Page = styled.main`
  min-width: 0;
  padding: 16px clamp(0px, calc(4.75vw - 32px), 32px) 0;

  @media ${WIDE} {
    max-width: 1500px;
  }
  @media ${COMPACT} {
    padding: 0;
  }
`;

export const PageHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 32px;

  h1 {
    margin: 0;
    font-size: 30px;
    line-height: 1.2;
    font-weight: 500;
    letter-spacing: -0.3px;
  }

  @media ${MOBILE} {
    margin-bottom: 24px;

    h1 {
      font-size: 24px;
    }
  }
`;

export const Experience = styled.div<{ $editing: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 32px;

  ${({ $editing }) =>
    $editing &&
    css`
      grid-template-columns: minmax(0, 1fr) 251px;

      @media ${COMPACT} {
        grid-template-columns: minmax(0, 1fr) 251px;
        gap: 20px;
      }
      @media ${TABLET} {
        grid-template-columns: minmax(0, 1fr);
      }
      @media ${MOBILE} {
        grid-template-columns: minmax(0, 1fr);
      }
    `}
`;

export const Workspace = styled.section`
  min-width: 0;
`;

export const Notice = styled.p`
  padding: 10px 14px;
  margin-bottom: 20px;
  border: 1px solid ${COLORS.noticeBorder};
  border-radius: 8px;
  background: ${COLORS.tagGreenFill};
  color: ${COLORS.noticeText};
  font-size: 12px;
  line-height: 1.5;
`;

export const AmenityDropdown = styled.details`
  position: relative;
  font-size: 12px;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    list-style: none;
    padding: 8px 16px;
    min-height: 38px;
    border-radius: 24px;
    background: ${COLORS.accent};
    color: ${COLORS.white};
    font-weight: 500;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  fieldset {
    position: absolute;
    z-index: 20;
    left: 0;
    top: calc(100% + 8px);
    min-width: 235px;
    padding: 16px;
    border: 1px solid ${COLORS.divider};
    border-radius: 12px;
    background: ${COLORS.white};
    box-shadow: 0 8px 28px ${COLORS.calendarShadow};
  }
  legend {
    padding: 0 4px;
    color: ${COLORS.heading};
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    cursor: pointer;
  }
  input {
    width: 16px;
    height: 16px;
    accent-color: ${COLORS.calendarGreen};
  }
`;

export const AmenityPickerActions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;

  button {
    padding: 6px 12px;
    border: 1px solid ${COLORS.divider};
    border-radius: 8px;
    background: ${COLORS.white};
    font-size: 12px;
  }
  button:last-child {
    background: ${COLORS.accent};
    color: ${COLORS.white};
    border-color: ${COLORS.accent};
  }
`;

export const SelectedAmenities = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;

  &:empty {
    display: none;
  }
`;

const smallPrint = css`
  margin-top: 12px;
  color: ${COLORS.muted};
  font-size: 11px;
  line-height: 1.6;
`;

export const Instruction = styled.p`
  ${smallPrint}

  button {
    border: 0;
    padding: 0;
    background: none;
    color: ${COLORS.calendarGreen};
    text-decoration: underline;
    font-size: inherit;
  }
`;

export const Footnote = styled.p`
  ${smallPrint}
  margin-top: 4px;
  font-size: 10px;
`;

export const Legend = styled.p`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  color: ${COLORS.heading};
  font-size: 10px;
`;

const LEGEND_FILLS = {
  available: COLORS.legendAvailable,
  partial: COLORS.legendPartial,
  unavailable: COLORS.white,
};

export const LegendSwatch = styled.span<{
  $kind: keyof typeof LEGEND_FILLS;
}>`
  width: 10px;
  height: 10px;
  margin-left: 12px;
  border: 1px solid ${COLORS.legendBorder};
  border-radius: 2px;
  background: ${({ $kind }) => LEGEND_FILLS[$kind]};

  &:first-child {
    margin-left: 0;
  }
`;

// temporary until the sidebar design has a sign-out
export const SignOutButton = styled.button`
  padding: 6px 12px;
  border: 1px solid ${COLORS.divider};
  border-radius: 8px;
  background: ${COLORS.white};
  color: ${COLORS.heading};
  font-size: 12px;
`;
