"use client";

import styled from "styled-components";
import COLORS from "@/styles/colors";

export const Chip = styled.span<{ $oven: boolean }>`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  border-radius: 6px;
  background: ${({ $oven }) =>
    $oven ? COLORS.tagPurpleFill : COLORS.tagGreenFill};
  color: ${({ $oven }) => ($oven ? COLORS.tagPurpleText : COLORS.tagGreenText)};
  font-size: 11px;
  line-height: 20px;
  font-weight: 500;

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    min-height: 20px;
    padding: 0;
    border: 0;
    background: none;
  }
`;
