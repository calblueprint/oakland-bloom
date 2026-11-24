"use client";

import styled, { css } from "styled-components";
import { Button } from "@/components/Button/Button";
import COLORS from "@/styles/colors";
import { MOBILE } from "../breakpoints";

export const VisuallyHidden = styled.span`
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

export const PanelHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

export const FieldLabel = styled.p``;

export const TimeInputs = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;

  label {
    display: grid;
    gap: 4px;
  }
`;

export const ChefCounter = styled.div`
  display: flex;
  align-items: center;
  width: 134px;

  button {
    display: flex;
    border: 0;
    background: none;
    padding: 0;
  }
  input::-webkit-inner-spin-button {
    appearance: none;
  }
`;

export const Panel = styled.aside`
  min-width: 0;
  padding: 20px 15px;
  border: 1px solid ${COLORS.divider};
  border-radius: 12px;
  background: ${COLORS.white};

  h2 {
    font-size: 18px;
    font-weight: 600;
    line-height: 24px;
    letter-spacing: -0.18px;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    border: 0;
  }
  :is(label, ${FieldLabel}) {
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
  }
  label:not(:first-child),
  ${FieldLabel} {
    margin-top: 6px;
  }
  input {
    width: 100%;
    min-width: 0;
    height: 36px;
    padding: 6px 12px;
    border: 1px solid ${COLORS.border};
    border-radius: 12px;
    background: ${COLORS.white};
    color: ${COLORS.text};
    font-size: 12px;
  }
  input::placeholder {
    color: ${COLORS.calendarPlaceholder};
  }
  input[aria-invalid="true"] {
    border-color: ${COLORS.error};
  }
  hr {
    width: 100%;
    margin: 8px 0;
    border: 0;
    border-top: 1px solid ${COLORS.calendarHairline};
  }
  ${TimeInputs} input {
    padding: 6px;
  }
  ${ChefCounter} input {
    padding: 0;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    text-align: center;
    appearance: textfield;
  }

  @media ${MOBILE} {
    input {
      font-size: 16px;
    }
  }
`;

export const DetailsPanel = styled(Panel)`
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 12px;
  line-height: 20px;
  overflow-wrap: anywhere;

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 500;
  }
`;

const STATUS_COLORS: Record<string, { fill: string; text: string }> = {
  approved: {
    fill: COLORS.statusApprovedFill,
    text: COLORS.statusApprovedText,
  },
  pending: { fill: COLORS.statusPendingFill, text: COLORS.statusPendingText },
  denied: { fill: COLORS.statusDeniedFill, text: COLORS.statusDeniedText },
};

export const StatusBadge = styled.p<{ $status: string }>`
  align-self: flex-start;
  padding: 5px 12px;
  border-radius: 8px;
  background: ${({ $status }) =>
    (STATUS_COLORS[$status] ?? STATUS_COLORS.approved).fill};
  color: ${({ $status }) =>
    (STATUS_COLORS[$status] ?? STATUS_COLORS.approved).text};
  text-transform: capitalize;
`;

export const DateLine = styled.p`
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  line-height: 20px;
`;

export const Timezone = styled.p`
  font-size: 10px;
  color: ${COLORS.heading};
`;

export const PanelAmenities = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Contact = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 4px 0 8px;

  > div {
    min-width: 0;
    color: ${COLORS.heading};
    font-size: 12px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
  p + p {
    color: ${COLORS.muted};
  }
`;

export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  padding: 4px;
  border: 0;
  background: none;
`;

export const AdditionalContact = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export const AddContactButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  width: 100%;
  padding: 6px 16px;
  border: 1px solid ${COLORS.border};
  border-radius: 12px;
  color: ${COLORS.heading};
  background: ${COLORS.white};
  font-size: 12px;
  text-align: left;
`;

export const Note = styled.p`
  color: ${COLORS.muted};
  font-size: 10px;
  line-height: 1.5;
`;

export const FieldError = styled.p`
  color: ${COLORS.error};
  font-size: 12px;
  line-height: 1.5;
`;

export const SubmitError = styled.div`
  margin: 12px 0;
  padding: 10px;
  border: 1px solid ${COLORS.errorBorder};
  border-radius: 8px;
  background: ${COLORS.errorFill};
  color: ${COLORS.errorText};
  font-size: 12px;
  line-height: 1.5;
`;

const panelButton = css`
  && {
    width: 100%;
    min-height: 37px;
    height: auto;
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 20px;
  }
`;

export const RequestButton = styled(Button)`
  ${panelButton}
  && {
    border: 1px solid ${COLORS.accent};
    background: ${COLORS.accent};
    color: ${COLORS.white};
  }
  &&:hover:not(:disabled) {
    background: ${COLORS.accentSubmitHover};
  }
`;

export const CancelButton = styled(Button)`
  ${panelButton}
  && {
    border: 1px solid ${COLORS.heading};
    background: ${COLORS.white};
    color: ${COLORS.ink};
  }
`;

export const PlainCancelButton = styled.button`
  width: 100%;
  min-height: 37px;
  height: auto;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 20px;
  border: 1px solid ${COLORS.heading};
  background: ${COLORS.white};
  color: ${COLORS.ink};
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
