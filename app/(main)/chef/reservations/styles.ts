import styled from "styled-components";
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

  color: ${({ $active }) => ($active ? "${COLORS.text}" : COLORS.muted)};

  font-size: 0.95rem;
  font-family: inherit;
  font-weight: ${({ $active }) => ($active ? "500" : "300")};

  cursor: pointer;
`;
