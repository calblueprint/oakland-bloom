"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "./styles";

export const PANEL_ID = "account-details";

// the panel's keyboard behavior. its content stays server-rendered: this only
// moves focus in on open, closes on Escape, and hands focus back to the card
export default function PanelFrame({
  closeHref,
  returnFocusTo,
  labelledBy,
  children,
}: {
  closeHref: string;
  returnFocusTo: string;
  labelledBy: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();

    // runs after the panel is gone from the page. skip it when another
    // chef's panel replaced this one, since that one just took focus
    return () => {
      setTimeout(() => {
        if (document.getElementById(PANEL_ID)) return;
        document.getElementById(returnFocusTo)?.focus();
      });
    };
  }, [returnFocusTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeHref, router]);

  return (
    <Panel
      id={PANEL_ID}
      ref={panelRef}
      tabIndex={-1}
      aria-labelledby={labelledBy}
    >
      {children}
    </Panel>
  );
}
