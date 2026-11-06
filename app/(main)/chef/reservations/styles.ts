import styled from "styled-components";

// wrap page content in a styled container, so cards don't stretch across entire browser page
export const PageContainer = styled.main`
  width: 100%;
  max-width: 900px;
  margin: 0 auto;

  /* top & bottom padding; left and right padding; bottom padding */
  padding: 3rem 2rem;

  @media (max-width: 600px) {
    padding: 1rem;
  }
`;

// styles the Your Reservations text box
export const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 600;
  color: #242424;
  margin-bottom: 0.8rem;
`;

// styles the View and manage reservations text box
export const PageSubtitle = styled.p`
  font-size: 0.875rem;
  color: #8a8a8a;
  margin-bottom: 2rem;
`;

// for "Upcoming" VS "Past" reservation tabs
export const TabContainer = styled.div`
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 1rem;
`;

// controls how tab's appearance changes when highlighted VS not
export const TabButton = styled.button<{ $active: boolean }>`
  /* top & bottom padding; left and right padding; bottom padding */
  padding: 0.75rem 1rem 1rem;

  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ $active }) => ($active ? "#f35c57" : "transparent")};

  color: ${({ $active }) => ($active ? "#242424" : "#8a8a8a")};

  font-size: 0.95rem;
  font-family: inherit;
  font-weight: ${({ $active }) => ($active ? "500" : "300")};

  cursor: pointer;
`;
