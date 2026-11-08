import { AccountTab } from "@/lib/admin/accountsView";
import { listChefAccounts } from "@/lib/admin/chefAccounts";
import AccountCard from "./AccountCard";
import { EmptyState, List } from "./styles";

const emptyMessages: Record<AccountTab, string> = {
  pending: "No chefs are waiting for approval.",
  approved: "No chef accounts have been approved yet.",
  // denyAccount deletes the account, so there's no denied status to list yet
  denied: "Declined accounts are deleted, so they don't appear here.",
};

// the cards for one tab. the page checks the caller is an admin first
export default async function AccountList({
  tab,
  selectedId,
}: {
  tab: AccountTab;
  selectedId: string | null;
}) {
  const accounts = await listChefAccounts(tab);

  if (accounts.length === 0) {
    return <EmptyState>{emptyMessages[tab]}</EmptyState>;
  }

  return (
    <List>
      {accounts.map(account => (
        <AccountCard
          key={account.userId}
          account={account}
          tab={tab}
          selected={account.userId === selectedId}
        />
      ))}
    </List>
  );
}
