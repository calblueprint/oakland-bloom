import type { ChefAccount } from "@/lib/admin/chefAccounts";
import { formatPhone } from "@/lib/admin/accountsView";
import { cardLinkId } from "./AccountCard";
import PanelFrame from "./PanelFrame";
import ReviewActions from "./ReviewActions";
import {
  CloseLink,
  Divider,
  Missing,
  PanelHeader,
  PanelTitle,
  Primary,
  Secondary,
  Section,
  SectionLabel,
  Values,
} from "./styles";

const TITLE_ID = "account-details-title";

// a field with nothing saved shows a marked placeholder instead of a blank
function Value({
  value,
  as: Text,
  label,
}: {
  value: string;
  as: typeof Primary | typeof Secondary;
  label: string;
}) {
  return value ? <Text>{value}</Text> : <Missing>No {label} on file</Missing>;
}

// the chef open in ?account=. only pending chefs get Approve/Decline;
// approved ones are read-only
export default function AccountDetailsPanel({
  account,
  closeHref,
}: {
  account: ChefAccount;
  closeHref: string;
}) {
  return (
    <PanelFrame
      closeHref={closeHref}
      returnFocusTo={cardLinkId(account.userId)}
      labelledBy={TITLE_ID}
    >
      <PanelHeader>
        <PanelTitle id={TITLE_ID}>Account Details</PanelTitle>
        <CloseLink href={closeHref} scroll={false}>
          Close
        </CloseLink>
      </PanelHeader>

      <Divider />
      <Section>
        <SectionLabel>Chef</SectionLabel>
        <Values>
          <Value value={account.name} as={Primary} label="name" />
        </Values>
      </Section>

      <Divider />
      <Section>
        <SectionLabel>Contact</SectionLabel>
        <Values $gap>
          <Value value={account.email} as={Secondary} label="email" />
          <Value
            value={account.phone && formatPhone(account.phone)}
            as={Secondary}
            label="phone number"
          />
        </Values>
      </Section>

      <Divider />
      <Section>
        <SectionLabel>Restaurant</SectionLabel>
        <Values>
          <Value
            value={account.restaurantName}
            as={Primary}
            label="restaurant name"
          />
          <Value
            value={account.restaurantAddress}
            as={Secondary}
            label="address"
          />
        </Values>
      </Section>
      <Divider />

      {account.status === "pending" && (
        <ReviewActions userId={account.userId} />
      )}
    </PanelFrame>
  );
}

// for an ?account= id that isn't a chef this admin can review or view
export function UnavailablePanel({ closeHref }: { closeHref: string }) {
  return (
    <PanelFrame closeHref={closeHref} returnFocusTo="" labelledBy={TITLE_ID}>
      <PanelHeader>
        <PanelTitle id={TITLE_ID}>Account Details</PanelTitle>
        <CloseLink href={closeHref} scroll={false}>
          Close
        </CloseLink>
      </PanelHeader>
      <Divider />
      <Values>
        <Secondary>
          This account isn&apos;t available. It may have been declined, or the
          chef hasn&apos;t confirmed their email or finished signing up.
        </Secondary>
      </Values>
    </PanelFrame>
  );
}
