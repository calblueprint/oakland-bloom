import { Suspense } from "react";
import { Instrument_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import {
  accountsHref,
  parseAccountId,
  parseTab,
} from "@/lib/admin/accountsView";
import { getChefAccount } from "@/lib/admin/chefAccounts";
import { getAccount } from "@/lib/auth/account";
import AccountDetailsPanel, { UnavailablePanel } from "./AccountDetailsPanel";
import AccountList from "./AccountList";
import AccountTabs from "./AccountTabs";
import {
  ErrorText,
  Header,
  ListColumn,
  ListSection,
  Messages,
  Notice,
  Page,
  Panel,
  PanelSlot,
  Subtitle,
  Title,
} from "./styles";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const successes: Record<string, string> = {
  approve: "Account approved. The chef can now sign in and use Oakland Bloom.",
  deny: "Account declined and deleted. The chef would need to sign up again.",
};

const errors: Record<string, string> = {
  invalid:
    "That account can't be reviewed. It may already have been approved or declined.",
  incomplete: "That account hasn't finished onboarding yet.",
  unverified: "That chef hasn't confirmed their email yet.",
  failed: "Couldn't update that account. Refresh and try again.",
};

// the chef in ?account=, loaded and checked on the server
async function SelectedAccount({
  userId,
  closeHref,
}: {
  userId: string;
  closeHref: string;
}) {
  const account = await getChefAccount(userId);
  if (!account) return <UnavailablePanel closeHref={closeHref} />;
  return (
    <AccountDetailsPanel
      key={account.userId}
      account={account}
      closeHref={closeHref}
    />
  );
}

// Figma: list 1043-9925, details panel open 1056-10458.
// state lives in the URL: ?tab=pending|approved|denied&account=<userid>
export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // the (admin) layout checks this too, but pages render alongside layouts,
  // so check here before reading every account
  const admin = await getAccount();
  if (!admin?.isAdmin) redirect(admin ? admin.homePath : "/login");

  const params = await searchParams;
  const tab = parseTab(params.tab);
  const selectedId = parseAccountId(params.account);
  const closeHref = accountsHref({ tab });
  const success = typeof params.done === "string" && successes[params.done];
  const error = typeof params.error === "string" && errors[params.error];

  return (
    <Page className={instrumentSans.className}>
      <ListColumn>
        <Header>
          <Title>Chef Accounts</Title>
          <Subtitle>
            Review new chefs and their restaurant information.
          </Subtitle>
        </Header>

        <ListSection aria-label="Chef accounts">
          <AccountTabs current={tab} />

          {/* always mounted so screen readers hear what changed */}
          <Messages>
            <div aria-live="polite">
              {success && <Notice>{success}</Notice>}
            </div>
            <div aria-live="assertive">
              {error && <ErrorText>{error}</ErrorText>}
            </div>
          </Messages>

          {/* keyed by tab: a new tab shows the loading line, while opening a
              panel keeps the current list on screen */}
          <Suspense
            key={tab}
            fallback={<Notice role="status">Loading chef accounts…</Notice>}
          >
            <AccountList tab={tab} selectedId={selectedId} />
          </Suspense>
        </ListSection>
      </ListColumn>

      {selectedId && (
        <PanelSlot>
          <Suspense
            key={selectedId}
            fallback={
              <Panel aria-busy="true">
                <Notice role="status">Loading account…</Notice>
              </Panel>
            }
          >
            <SelectedAccount userId={selectedId} closeHref={closeHref} />
          </Suspense>
        </PanelSlot>
      )}
    </Page>
  );
}
