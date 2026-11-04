"use client";

import Link from "next/link";
import styled from "styled-components";
import COLORS from "@/styles/colors";

// TODO: update from generic styling after Yash creates the design
const NavButton = styled(Link)`
  display: inline-block;
  margin-top: 1rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  background-color: ${COLORS.navButton};
  color: ${COLORS.white};
  text-decoration: none;
`;

export default NavButton;
