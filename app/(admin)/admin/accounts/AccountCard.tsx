import type { ChefAccount } from "@/lib/admin/chefAccounts";
import chevron from "@/assets/images/accounts/chevron.svg";
import { accountsHref, AccountTab } from "@/lib/admin/accountsView";
import {
  Card,
  CardActions,
  CardEmail,
  CardInfo,
  CardName,
  CardRestaurant,
  Chevron,
  ChevronLink,
  RowButton,
  VisuallyHidden,
} from "./styles";

// the panel sends focus back here when it closes
export const cardLinkId = (userId: string) => `account-${userId}`;

// one chef in the list. neither control approves anything: both open the
// details panel, where the real Approve and Decline buttons are
export default function AccountCard({
  account,
  tab,
  selected,
}: {
  account: ChefAccount;
  tab: AccountTab;
  selected: boolean;
}) {
  const href = accountsHref({ tab, account: account.userId });
  const name = account.name || account.email;
  const reviewable = account.status === "pending";

  return (
    <Card $selected={selected}>
      <CardInfo>
        <CardName>{name}</CardName>
        <CardEmail>{account.email}</CardEmail>
        <CardRestaurant>{account.restaurantName}</CardRestaurant>
      </CardInfo>

      <CardActions>
        {reviewable && (
          <RowButton
            id={cardLinkId(account.userId)}
            href={href}
            scroll={false}
            $selected={selected}
            aria-current={selected ? "true" : undefined}
          >
            Approve Account<VisuallyHidden>: review {name}</VisuallyHidden>
          </RowButton>
        )}
        {/* for pending chefs the button above is the keyboard stop, so this
            is a mouse shortcut only. otherwise it's the card's one control */}
        <ChevronLink
          href={href}
          scroll={false}
          {...(reviewable
            ? { tabIndex: -1, "aria-hidden": true }
            : {
                id: cardLinkId(account.userId),
                "aria-label": `View details for ${name}`,
                "aria-current": selected ? ("true" as const) : undefined,
              })}
        >
          <Chevron src={chevron} alt="" />
        </ChevronLink>
      </CardActions>
    </Card>
  );
}
