// helpers for the /admin/accounts URL state, with no database access. the page
// keeps its state in search params:
// ?tab=pending|approved|denied&account=<userid>

export const ACCOUNT_TABS = ["pending", "approved", "denied"] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

// search params come straight from the URL, so anything unexpected falls back
export function parseTab(value: unknown): AccountTab {
  return ACCOUNT_TABS.find(tab => tab === value) ?? "pending";
}

// userids are Auth uuids. checking the shape first keeps junk out of queries
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAccountId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

// links between tabs and panels. pending is the default, so it's left out
export function accountsHref({
  tab = "pending",
  account,
  done,
  error,
}: {
  tab?: AccountTab;
  account?: string | null;
  done?: string;
  error?: string;
}) {
  const params = new URLSearchParams();
  if (tab !== "pending") params.set("tab", tab);
  if (account) params.set("account", account);
  if (done) params.set("done", done);
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/admin/accounts?${query}` : "/admin/accounts";
}

// "5105550100" -> "(510) 555-0100". anything else (e.g. +44 numbers) as typed
// shared with the chef pages, so it lives in lib/phone.ts
export { formatPhone } from "@/lib/phone";
