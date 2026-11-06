import styled from "styled-components";
import COLORS from "@/styles/colors";

// styles each individual reservation card
// arranging the (IMMEDIATE) children horizontally
export const StyledCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;

  padding: 1.2rem;
  border: 1px solid ${COLORS.border};
  border-radius: 0.75rem;
  background-color: ${COLORS.white};

  /* reduce spacing and padding on mobile screens */
  @media (max-width: 480px) {
    gap: 0.75rem;
    padding: 0.75rem;
  }
`;

// immediate child: left-side Date details section; stacking 3 elements vertically + vertical line to the right
export const DateSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 6rem;
  padding-right: 1rem;
  border-right: 1px solid ${COLORS.border};
`;

export const Weekday = styled.span`
  font-size: 0.75rem;
  color: #8a8a8a;
`;

export const DayNumber = styled.span`
  font-size: 1.5rem;
  font-weight: 600;
`;

export const MonthYear = styled.span`
  font-size: 0.75rem;
  color: #8a8a8a;
`;

export const ReservationTime = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: #242424;
  margin: 0 0 0.25rem 0;
`;

export const GuestCount = styled.p`
  font-size: 0.75rem;
  color: #8a8a8a;
  margin: 0 0 0.25rem 0;
`;

// reuseable color tag for each amenity
// when we figure out which amenity tags -> add specific color filtering?
export const AmenityTag = styled.span`
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  background-color: #e5f3ed;
  color: #28785b;
  font-size: 0.75rem;
  font-weight: 500;
  margin-top: 0.25rem;

  /* prevent long amenity names from overextending on mobile */
  max-width: 100%;
  hite-space: normal;
  overflow-wrap: anywhere;
`;

// uses avail space to push JUST the *status section* to the right
export const StatusSection = styled.div`
  margin-left: auto;
`;

// $status indicates which colors to use for the styled component
export const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;

  background-color: ${({ $status }) =>
    $status === "approved"
      ? "#e8f0ff"
      : $status === "denied"
        ? "#ffe8ec"
        : "#f1e8ff"};

  color: ${({ $status }) =>
    $status === "approved"
      ? "#245bb2"
      : $status === "denied"
        ? "#d11a36"
        : "#7b45c5"};
`;
