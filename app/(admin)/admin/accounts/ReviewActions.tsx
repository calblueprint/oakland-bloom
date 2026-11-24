"use client";

import { useFormStatus } from "react-dom";
import { approveAccount, denyAccount } from "@/actions/admin/review-account";
import { ApproveButton, DeclineButton, PanelActions } from "./styles";

// the buttons that actually approve or decline. the actions check admin,
// email confirmation, and onboarding on the server themselves
export default function ReviewActions({ userId }: { userId: string }) {
  return (
    <PanelActions>
      <form action={approveAccount.bind(null, userId)}>
        <Submit kind="approve" />
      </form>
      <form action={denyAccount.bind(null, userId)}>
        <Submit kind="decline" />
      </form>
    </PanelActions>
  );
}

// useFormStatus only sees the form it's rendered inside
function Submit({ kind }: { kind: "approve" | "decline" }) {
  const { pending } = useFormStatus();
  const Button = kind === "approve" ? ApproveButton : DeclineButton;
  const label = kind === "approve" ? "Approve Account" : "Decline Account";
  const busy = kind === "approve" ? "Approving…" : "Declining…";

  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}
