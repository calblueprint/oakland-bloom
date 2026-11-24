import { ReactNode } from "react";
import { getAccount } from "@/actions/supabase/queries/account";
import Sidebar from "@/components/Sidebar/Sidebar";
import { Content, Shell } from "./styles";

// frame for the signed-in sections: the sidebar for this section, then the page.
// the section's own layouts already check access; this only reads the name
export default async function AppShell({
  variant,
  children,
}: {
  variant: "admin" | "chef";
  children: ReactNode;
}) {
  // cached, so this reuses the layout's lookup
  const account = await getAccount();
  const name =
    `${account?.saved.firstName ?? ""} ${account?.saved.lastName ?? ""}`.trim() ||
    (account?.email ?? "");

  return (
    <Shell>
      <Sidebar name={name} variant={variant} />
      <Content>{children}</Content>
    </Shell>
  );
}
