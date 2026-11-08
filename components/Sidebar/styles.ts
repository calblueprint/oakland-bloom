"use client";

import Image from "next/image";
import Link from "next/link";
import styled, { css } from "styled-components";
import COLORS from "@/styles/colors";

// below this the sidebar slides in from the left behind a toggle
export const SIDEBAR_BREAKPOINT = "48rem";

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`;

export const Aside = styled.aside<{ $open: boolean }>`
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex-shrink: 0;
  width: 14rem;
  height: 100vh;
  height: 100dvh;
  padding: 1.5rem;
  overflow-y: auto;
  border-right: 0.5px solid ${COLORS.divider};
  background: ${COLORS.white};

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    position: fixed;
    left: 0;
    z-index: 20;
    transform: translateX(${({ $open }) => ($open ? "0" : "-100%")});
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    transition:
      transform 0.2s ease,
      visibility 0.2s;
  }
`;

export const Top = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

export const Brand = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: none;
  ${focusRing}
`;

export const Leaf = styled(Image)`
  width: 36.5px;
  height: 28.84px;
  margin-right: -4px;
  object-fit: cover;
`;

// Avenir isn't a web font; it's installed on macOS/iOS, so other systems fall back
export const BrandName = styled.span`
  font-family: Avenir, "Avenir Next", inherit;
  font-size: 1.375rem;
  font-weight: 500;
  line-height: 2rem;
  letter-spacing: -0.88px;
  color: ${COLORS.muted};
  white-space: nowrap;
`;

export const Nav = styled.nav`
  width: 11rem;
`;

export const NavList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Divider = styled.li`
  height: 0.5px;
  border-radius: 1px;
  background: ${COLORS.divider};
`;

export const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

export const SubList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const itemText = css`
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;
  white-space: nowrap;
`;

// the highlight reaches 10px past the column on each side and ~9.5px above and
// below the row, without moving anything around it
const highlight = css`
  margin: -0.59375rem -0.625rem;
  padding: 0.59375rem 0.625rem;
  border-radius: 0.625rem;

  &:hover {
    background: ${COLORS.buttonFill};
  }

  &[aria-current="page"] {
    background: ${COLORS.buttonFill};
  }
`;

// Home's label sits closer to its icon than the other sections' in the design
export const ItemLink = styled(Link)<{ $gap: string }>`
  ${itemText}
  ${highlight}
  ${focusRing}
  display: flex;
  align-items: center;
  gap: ${({ $gap }) => $gap};
  color: ${COLORS.ink};
  text-decoration: none;
`;

export const SubLink = styled(Link)`
  ${itemText}
  ${highlight}
  ${focusRing}
  display: flex;
  align-items: center;
  gap: 1.125rem;
  color: ${COLORS.heading};
  text-decoration: none;

  &[aria-current="page"] {
    color: ${COLORS.ink};
  }
`;

export const GroupToggle = styled.button`
  ${itemText}
  ${highlight}
  ${focusRing}
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% + 1.25rem);
  border: none;
  background: none;
  color: ${COLORS.ink};
  text-align: left;
  cursor: pointer;
`;

export const ToggleLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 1.375rem;
`;

// the source chevron points left: -90deg turns it down (open), 180deg right (closed)
export const Chevron = styled(Image)<{ $open: boolean }>`
  transform: rotate(${({ $open }) => ($open ? "-90deg" : "-180deg")});
  transition: transform 0.15s ease;
`;

export const Footer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 11rem;
  margin-top: 1.5rem;
`;

export const FooterDivider = styled.div`
  height: 0.5px;
  border-radius: 1px;
  background: ${COLORS.divider};
`;

export const Profile = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const Avatar = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 45px;
  height: 45px;
  border: 1px solid rgba(99, 116, 92, 0.1);
  border-radius: 50%;
  background: rgba(201, 201, 201, 0.4);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 0.9375rem;
  color: #999999;
`;

export const ProfileText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;
`;

export const ProfileName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${COLORS.ink};
`;

export const ProfileRole = styled.span`
  color: ${COLORS.heading};
`;

// small screens only: opens the sidebar, and a backdrop closes it
export const MenuButton = styled.button`
  display: none;

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0 0.6875rem;
    border: 0.5px solid ${COLORS.divider};
    border-radius: 0.625rem;
    background: ${COLORS.white};
    cursor: pointer;
    ${focusRing}

    span {
      height: 1.5px;
      border-radius: 1px;
      background: ${COLORS.ink};
    }
  }
`;

export const Backdrop = styled.div`
  display: none;

  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: block;
    background: rgba(0, 0, 0, 0.2);
  }
`;
