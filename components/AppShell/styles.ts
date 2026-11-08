"use client";

import styled from "styled-components";
import { SIDEBAR_BREAKPOINT } from "@/components/Sidebar/styles";
import COLORS from "@/styles/colors";

// sidebar on the left, page content filling the rest
export const Shell = styled.div`
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  background: ${COLORS.white};
`;

// pages render their own <main> inside this
export const Content = styled.div`
  flex: 1;
  min-width: 0;
  padding: 2rem;

  /* room for the menu button that replaces the sidebar */
  @media (max-width: ${SIDEBAR_BREAKPOINT}) {
    padding: 4.5rem 1rem 2rem;
  }
`;
