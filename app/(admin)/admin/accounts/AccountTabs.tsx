import { accountsHref, AccountTab } from "@/lib/admin/accountsView";
import { Tab, TabList } from "./styles";

const labels: Record<AccountTab, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

// each tab is a link to its own URL, so they work with Tab/Enter, can be
// bookmarked, and keep the page a server component. switching closes the panel
export default function AccountTabs({ current }: { current: AccountTab }) {
  return (
    <nav aria-label="Account status">
      <TabList>
        {(Object.keys(labels) as AccountTab[]).map(tab => (
          <li key={tab}>
            <Tab
              href={accountsHref({ tab })}
              aria-current={tab === current ? "page" : undefined}
              scroll={false}
            >
              {labels[tab]}
            </Tab>
          </li>
        ))}
      </TabList>
    </nav>
  );
}
