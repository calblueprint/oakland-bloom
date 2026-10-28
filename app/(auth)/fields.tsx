"use client";

import { ComponentProps, useState } from "react";
import Image from "next/image";
import eyeIcon from "@/assets/images/eye.svg";
import { Field, Input, SrOnlyLabel, Toggle } from "./styles";

type FieldProps = Omit<ComponentProps<"input">, "className" | "ref"> & {
  id: string;
  // read by screen readers only, the design shows the placeholder instead
  label: string;
};

export function TextField({ id, label, ...inputProps }: FieldProps) {
  return (
    <>
      <SrOnlyLabel htmlFor={id}>{label}</SrOnlyLabel>
      <Field>
        <Input id={id} {...inputProps} />
      </Field>
    </>
  );
}

// password box with the show/hide eye toggle
export function PasswordField({
  id,
  label,
  ...inputProps
}: Omit<FieldProps, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <SrOnlyLabel htmlFor={id}>{label}</SrOnlyLabel>
      <Field>
        <Input id={id} type={visible ? "text" : "password"} {...inputProps} />
        {/* toggle buttons keep a fixed label; aria-pressed carries the state */}
        <Toggle
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={id}
          disabled={inputProps.disabled}
        >
          <Image src={eyeIcon} alt="" />
        </Toggle>
      </Field>
    </>
  );
}
