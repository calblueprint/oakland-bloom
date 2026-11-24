"use client";

import Link from "next/link";
import styled from "styled-components";
import COLORS from "@/styles/colors";
import { MOBILE } from "../breakpoints";

export const Sidebar = styled.aside`
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 225px;
  padding: 24px;
  border-right: 1px solid ${COLORS.divider};
  background: ${COLORS.white};

  @media ${MOBILE} {
    position: static;
    width: 100%;
    padding: 16px;
    border-right: 0;
    border-bottom: 1px solid ${COLORS.calendarHairline};
  }
`;

export const Brand = styled(Link)`
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  color: ${COLORS.muted};
  text-decoration: none;
  white-space: nowrap;

  img {
    flex-shrink: 0;
    margin-right: -4px;
  }
  span {
    font-family: Avenir, "Helvetica Neue", sans-serif;
    font-size: 22px;
    letter-spacing: -0.88px;
  }

  @media ${MOBILE} {
    margin-bottom: 12px;
  }
`;

export const SidebarNav = styled.nav`
  display: flex;
  flex-direction: column;

  > * {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px 0;
    background: none;
    border: 0;
    border-top: 1px solid ${COLORS.divider};
    color: ${COLORS.ink};
    text-decoration: none;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
  }
  > :last-child {
    border-bottom: 1px solid ${COLORS.divider};
  }
  > [aria-current="page"] {
    font-weight: 600;
  }

  @media ${MOBILE} {
    flex-direction: row;
    gap: 16px;
    flex-wrap: wrap;

    > * {
      padding: 8px 0;
      border: 0;
      gap: 8px;
    }
    > :last-child {
      border: 0;
    }
  }
`;

export const SidebarUser = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid ${COLORS.divider};
  font-size: 12px;
  line-height: 20px;

  > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  p + p {
    color: ${COLORS.heading};
  }
  button {
    border: 0;
    background: none;
    color: ${COLORS.muted};
    font-size: 11px;
    padding: 0 0 0 3px;
  }

  @media ${MOBILE} {
    display: none;
  }
`;

export const StatisticsDialog = styled.dialog`
  margin: auto;
  max-width: calc(100vw - 32px);
  width: 360px;
  padding: 24px;
  border: 1px solid ${COLORS.divider};
  border-radius: 12px;
  color: ${COLORS.ink};

  &::backdrop {
    background: ${COLORS.calendarBackdrop};
  }
  h2 {
    font-size: 20px;
    margin-bottom: 8px;
  }
  p {
    color: ${COLORS.heading};
    font-size: 12px;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    margin: 20px 0;
    font-size: 14px;
  }
  button {
    padding: 8px 16px;
    border: 1px solid ${COLORS.dialogButtonBorder};
    border-radius: 8px;
    background: ${COLORS.white};
  }
`;

export const ContactAvatar = styled.span`
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid ${COLORS.divider};
  border-radius: 50%;
  background: ${COLORS.avatarFill};
  color: ${COLORS.avatarText};
  font-size: 11px;
`;
