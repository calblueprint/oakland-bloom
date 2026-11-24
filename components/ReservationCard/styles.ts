import styled from "styled-components";
import COLORS from "@/styles/colors";

// styles each individual reservation card
// arranging the (IMMEDIATE) children horizontally
// a button, so the card can be clicked or picked with the keyboard to open
// its details. $selected gives the open card the darker Figma border
export const StyledCard = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 1.5rem;

  width: 100%;
  min-height: 94px;
  padding: 12px 32px;
  box-sizing: border-box;

  border: 1px solid
    ${({ $selected }) => ($selected ? COLORS.heading : COLORS.divider)};
  border-radius: 10px;
  background-color: ${COLORS.white};

  /* undo the browser's button styles */
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: ${COLORS.heading};
  }

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }

  /* reduce spacing and padding on mobile screens */
  @media (max-width: 480px) {
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 12px;
  }
`;

// groups the date and reservation details together with a 32px gap
export const ReservationInfo = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  gap: 32px;
  min-width: 0;

  /* the text column takes the room left after the date */
  > :last-child {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 480px) {
    gap: 12px;
  }
`;

// immediate child: left-side Date details section; stacking 3 elements vertically + vertical line to the right
export const DateSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  flex-shrink: 0;
  width: 80px;
  padding-right: 30px;

  border-right: 1px solid ${COLORS.divider};
`;

export const Weekday = styled.span`
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.8px;
  color: ${COLORS.muted};
`;

export const DayNumber = styled.span`
  color: ${COLORS.ink};
  font-size: 20px;
  font-style: normal;
  font-weight: 500;
  line-height: 24px; /* 120% */
  letter-spacing: -0.2px;
`;

export const MonthYear = styled.span`
  font-size: 12px;
  font-weight: 400;
  line-height: 24px;
  color: ${COLORS.muted};
  white-space: nowrap;
`;

export const ReservationTime = styled.p`
  color: ${COLORS.ink};
  font-size: 14px;
  font-style: normal;
  font-weight: 600;
  line-height: 20px;

  margin: 0 0 0.25rem 0;
`;

export const GuestCount = styled.p`
  color: ${COLORS.heading};
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px;

  margin: 0 0 0.25rem 0;
`;

// reuseable color tag for each amenity: tables are green, the oven is purple
// (Figma). the amenity icon uses currentColor, so it follows the text color
export const AmenityTag = styled.span<{ $amenity?: string }>`
  border-radius: 0.375rem;
  background-color: ${({ $amenity }) =>
    $amenity === "oven" ? COLORS.tagPurpleFill : COLORS.tagGreenFill};
  display: inline-flex;
  padding: 0 8px;
  justify-content: center;
  align-items: center;
  gap: 6px;
  color: ${({ $amenity }) => ($amenity === "oven" ? COLORS.tagPurpleText : COLORS.tagGreenText)};
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  line-height: 20px; /* 181.818% */
  letter-spacing: -0.22px;
  margin-top: 0.25rem;

  /* keep each name on one line; the tags wrap as whole pills instead */
  max-width: 100%;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }

  /* phone cards are too narrow for some names, so let those wrap */
  @media (max-width: 480px) {
    white-space: normal;
  }
`;

// uses avail space to push JUST the *status section* to the right
export const StatusSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;

  /* phones: status and chevron get their own row under the details */
  @media (max-width: 480px) {
    width: 100%;
    justify-content: space-between;
    padding-top: 0.75rem;
    border-top: 1px solid ${COLORS.divider};
  }
`;

// the ">" after the status badge
export const Chevron = styled.span`
  display: inline-flex;
  color: ${COLORS.heading};
`;

// approved / denied / pending colours from Figma
const statusColors: Record<
  string,
  { background: string; border: string; text: string }
> = {
  approved: {
    background: COLORS.badgeApprovedFill,
    border: COLORS.badgeApprovedBorder,
    text: COLORS.badgeApprovedText,
  },
  denied: {
    background: COLORS.badgeDeniedFill,
    border: COLORS.badgeDeniedBorder,
    text: COLORS.badgeDeniedText,
  },
  pending: {
    background: COLORS.badgePendingFill,
    border: COLORS.badgePendingBorder,
    text: COLORS.badgePendingText,
  },
};
const colorsFor = (status: string) =>
  statusColors[status] ?? statusColors.pending;

// $status indicates which colors to use for the styled component
export const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  padding: 4px 12px;
  border-radius: 15px;

  font-size: 11px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: -0.22px;

  text-transform: capitalize;

  background-color: ${({ $status }) => colorsFor($status).background};
  border: 1px solid ${({ $status }) => colorsFor($status).border};
  color: ${({ $status }) => colorsFor($status).text};
`;

// a span, since headings can't go inside the card's button
export const ReservationTitle = styled.span`
  display: block;
  color: ${COLORS.ink};
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5rem;
  margin: 0 0 0.25rem 0;
`;

// a booking can hold several amenities; wrap their tags onto new lines
export const AmenityTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;
