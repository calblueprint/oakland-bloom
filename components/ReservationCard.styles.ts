import styled from "styled-components";

// styles each individual reservation card
// arranging the (IMMEDIATE) children horizontally
export const StyledCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 1.5rem;

  width: 100%;
  min-height: 94px;
  padding: 12px 32px;
  box-sizing: border-box;

  border: 1px solid #e4e4e4;
  border-radius: 10px;
  background-color: #ffffff;

  /* reduce spacing and padding on mobile screens */
  @media (max-width: 480px) {
    gap: 0.75rem;
    padding: 12px;
  }
`;

// groups the date and reservation details together with a 32px gap
export const ReservationInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 32px;
  min-width: 0;

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

  border-right: 1px solid #e4e4e4;
`;

export const Weekday = styled.span`
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.8px;
  color: #8a8a8a;
`;

export const DayNumber = styled.span`
  color: var(--Ink, #20201e);
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
  color: #8a8a8a;
  white-space: nowrap;
`;

export const ReservationTime = styled.p`
  color: var(--Ink, #20201e);
  font-size: 14px;
  font-style: normal;
  font-weight: 600;
  line-height: 20px;

  margin: 0 0 0.25rem 0;
`;

export const GuestCount = styled.p`
  color: var(--Text-Secondary, #707070);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px;

  margin: 0 0 0.25rem 0;
`;

// reuseable color tag for each amenity
// when we figure out which amenity tags -> add specific color filtering?
export const AmenityTag = styled.span`
  border-radius: 0.375rem;
  background-color: #e5f2ed;
  display: inline-flex;
  padding: 0 8px;
  justify-content: center;
  align-items: center;
  gap: 6px;
  color: #367c65;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  line-height: 20px; /* 181.818% */
  letter-spacing: -0.22px;
  margin-top: 0.25rem;

  /* prevent long amenity names from overextending on mobile */
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
`;

// uses avail space to push JUST the *status section* to the right
export const StatusSection = styled.div`
  margin-left: auto;
`;

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

  background-color: ${({ $status }) =>
    $status === "approved"
      ? "#e8f1ff"
      : $status === "denied"
        ? "#fde8ec"
        : "#f1ebff"};

  border: 1px solid
    ${({ $status }) =>
      $status === "approved"
        ? "#C9DDFB"
        : $status === "denied"
          ? "#F8CDD5"
          : "#DED0FA"};

  color: ${({ $status }) =>
    $status === "approved"
      ? "#245ba8"
      : $status === "denied"
        ? "#BD2942"
        : "#7042B5"};
`;

export const ReservationTitle = styled.h2`
  color: var(--Ink, #20201e);
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
