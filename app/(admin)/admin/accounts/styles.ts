"use client";

import styled, { css } from "styled-components";
import COLORS from "@/styles/colors";

// no Figma frame yet; reuses the auth screens' type scale and colors

export const Page = styled.main`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 48rem;
  min-height: 100vh;
  margin: 0 auto;
  padding: 3rem 1rem;
  background: ${COLORS.background};
  color: ${COLORS.text};
`;

export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

export const Heading = styled.h1`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.75rem;
  color: ${COLORS.heading};
`;

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`;

export const LinkButton = styled.button`
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: ${COLORS.muted};
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  ${focusRing}
`;

const messageStyles = css`
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: ${COLORS.muted};
`;

// success notice and the empty state
export const Notice = styled.p`
  ${messageStyles}
`;

export const ErrorText = styled.p`
  ${messageStyles}
  color: ${COLORS.accent};
`;

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex-shrink: 0;
`;

export const Card = styled.li`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem 1.5rem;
  border: 0.5px solid ${COLORS.border};
  border-radius: 0.75rem;
  background: ${COLORS.white};
  filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.1));

  @media (max-width: 36rem) {
    flex-direction: column;

    ${Actions} {
      flex-direction: row;
      width: 100%;
    }

    ${Actions} form {
      flex: 1;
    }
  }
`;

export const Details = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
`;

export const RestaurantName = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5rem;
`;

export const Fields = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.25rem;

  dt {
    color: ${COLORS.muted};
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const reviewButtonStyles = css`
  min-width: 6.5rem;
  padding: 0.5rem 1rem;
  border-radius: 25.5rem;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.25rem;
  cursor: pointer;

  ${focusRing}

  @media (max-width: 36rem) {
    width: 100%;
  }
`;

export const ApproveButton = styled.button`
  ${reviewButtonStyles}
  border: none;
  background: ${COLORS.text};
  color: ${COLORS.white};

  &:hover {
    background: #3a3a3a;
  }
`;

export const DenyButton = styled.button`
  ${reviewButtonStyles}
  border: 0.5px solid ${COLORS.border};
  background: ${COLORS.white};
  color: ${COLORS.text};

  &:hover {
    background: #f5f5f5;
  }
`;
