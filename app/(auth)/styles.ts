"use client";

import Image from "next/image";
import Link from "next/link";
import styled, { css } from "styled-components";
import COLORS from "@/styles/colors";

// shared by every auth screen. server components can render these too:
// this file is a client module, so they're passed through as client components

export const Page = styled.main`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 1.5rem 1rem;
  background: ${COLORS.background};
`;

export const Glow = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 17.5rem;
  pointer-events: none;
`;

export const GlowImage = styled(Image)`
  object-fit: cover;
  object-position: center bottom;
`;

export const Card = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 25.875rem;
  max-width: 100%;
  padding: 3rem 2.625rem;

  @media (max-width: 27.5rem) {
    padding: 2.5rem 1.5rem;
  }
`;

export const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3rem;
`;

export const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
`;

export const Logo = styled(Image)`
  width: 14.375rem;
  max-width: 100%;
  height: auto;
`;

export const Heading = styled.h1`
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.75rem;
  color: ${COLORS.heading};
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const srOnly = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const SrOnlyLabel = styled.label`
  ${srOnly}
`;

export const SrOnly = styled.span`
  ${srOnly}
`;

export const Field = styled.div`
  display: flex;
  align-items: center;
  height: 2.25rem;
  border: 0.5px solid ${COLORS.border};
  border-radius: 0.75rem;
  background: ${COLORS.white};
  filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.1));

  &:focus-within {
    border-color: ${COLORS.heading};
    outline: 2px solid ${COLORS.text};
    outline-offset: 2px;
  }

  /* red only when the form marks the input aria-invalid */
  &:has(input[aria-invalid="true"]) {
    border-color: ${COLORS.accent};
  }

  &:has(input[aria-invalid="true"]):focus-within {
    outline-color: ${COLORS.accent};
  }
`;

export const Input = styled.input`
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0.375rem 1rem;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.25rem;
  color: ${COLORS.text};

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${COLORS.border};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

export const Toggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 1rem 0 0.5rem;
  border: none;
  border-radius: 0 0.75rem 0.75rem 0;
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: -2px;
  }

  img {
    width: 1.40625rem;
    height: 0.9375rem;
  }
`;

export const ErrorText = styled.p`
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.25rem;
  text-align: center;
  color: ${COLORS.accent};
`;

export const SubmitButton = styled.button`
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 25.5rem;
  background: ${COLORS.buttonFill};
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.25rem;
  color: ${COLORS.heading};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${COLORS.buttonFillHover};
  }

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

// footer links under the card; Card's gap already provides the 2rem above
export const Links = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;

  /* two links plus a dot separator spread to the edges */
  &:has(> :nth-child(2)) {
    justify-content: space-between;
  }
`;

const linkStyles = css`
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: ${COLORS.muted};
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`;

export const TextLink = styled(Link)`
  ${linkStyles}
`;

// looks like a link, behaves like a button (e.g. "Go back", "Sign out")
export const LinkButton = styled.button`
  ${linkStyles}

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

// password checklist
export const Checklist = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const checkItemStyles = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding-left: 1rem;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: ${COLORS.muted};
`;

export const CheckItem = styled.li`
  ${checkItemStyles}
`;

export const CheckLine = styled.p`
  ${checkItemStyles}
`;

export const CheckIcon = styled.span`
  display: inline-flex;
  justify-content: center;
  width: 0.75rem;
  font-size: 0.75rem;
`;

// pending approval message
export const Message = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  text-align: center;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5rem;
  color: ${COLORS.muted};

  p {
    margin: 0;
  }
`;

export const MessageEmail = styled.span`
  color: ${COLORS.text};
`;
