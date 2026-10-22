"use client";

import { ComponentProps, useState } from "react";
import Image from "next/image";
import eyeIcon from "@/assets/images/eye.svg";
import styles from "./auth.module.css";

type FieldProps = Omit<ComponentProps<"input">, "className"> & {
  id: string;
  // read by screen readers only, the design shows the placeholder instead
  label: string;
};

export function TextField({
  id,
  label,
  error,
  ...inputProps
}: FieldProps & {
  // shown under the box, which turns red. tied to the input for screen readers
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={id} className={styles.srOnly}>
        {label}
      </label>
      <div className={styles.field}>
        <input
          id={id}
          className={styles.input}
          {...inputProps}
          aria-invalid={error ? true : inputProps["aria-invalid"]}
          aria-describedby={error ? errorId : inputProps["aria-describedby"]}
        />
      </div>
      {error && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
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
      <label htmlFor={id} className={styles.srOnly}>
        {label}
      </label>
      <div className={styles.field}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={styles.input}
          {...inputProps}
        />
        {/* toggle buttons keep a fixed label; aria-pressed carries the state */}
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible(v => !v)}
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={id}
          disabled={inputProps.disabled}
        >
          <Image src={eyeIcon} alt="" />
        </button>
      </div>
    </>
  );
}
