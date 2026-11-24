"use client";

import { Fragment, useEffect, useState } from "react";
import { Instrument_Sans } from "next/font/google";
import Image from "next/image";
import { usePathname } from "next/navigation";
import calendarIcon from "@/assets/images/sidebar/calendar.svg";
import chartIcon from "@/assets/images/sidebar/chart.svg";
import chevronIcon from "@/assets/images/sidebar/chevron.svg";
import homeIcon from "@/assets/images/sidebar/home.svg";
import leaf from "@/assets/images/sidebar/leaf.png";
import shieldIcon from "@/assets/images/sidebar/shield.svg";
import subitemIcon from "@/assets/images/sidebar/subitem.svg";
import userIcon from "@/assets/images/sidebar/user.svg";
import {
  Aside,
  Avatar,
  Backdrop,
  Brand,
  BrandName,
  Chevron,
  Divider,
  Footer,
  FooterDivider,
  Group,
  GroupToggle,
  ItemLink,
  Leaf,
  MenuButton,
  Nav,
  NavList,
  Profile,
  ProfileName,
  ProfileRole,
  ProfileText,
  SubLink,
  SubList,
  ToggleLabel,
  Top,
} from "./styles";

// Figma: https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=817-3791

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["500"],
});

type Icon = { src: string; height: number; width: number };

type NavItem =
  | { label: string; href: string; icon: Icon }
  | { label: string; icon: Icon; children: { label: string; href: string }[] };

// Figma (admin): node 817-3791. only "/admin" and "/admin/accounts" exist so
// far; the rest are the routes these pages will live at
const adminNav: NavItem[] = [
  { label: "Home", href: "/admin", icon: homeIcon },
  {
    label: "Reservation Requests",
    href: "/admin/reservations",
    icon: calendarIcon,
  },
  {
    label: "Usage Statistics",
    icon: chartIcon,
    children: [
      { label: "Overview", href: "/admin/statistics" },
      { label: "By Chef", href: "/admin/statistics/chefs" },
    ],
  },
  {
    label: "Account Management",
    icon: userIcon,
    children: [
      { label: "Pending Accounts", href: "/admin/accounts" },
      { label: "All Users", href: "/admin/users" },
    ],
  },
  {
    label: "Admin Management",
    icon: shieldIcon,
    children: [
      { label: "Team Members", href: "/admin/team" },
      { label: "Invite Admins", href: "/admin/invite" },
    ],
  },
];

// Figma (chef): node 817-4124. "/chef/statistics" doesn't exist yet
const chefNav: NavItem[] = [
  { label: "Home", href: "/chef", icon: homeIcon },
  {
    label: "Your Reservations",
    href: "/chef/reservations",
    icon: calendarIcon,
  },
  { label: "Usage Statistics", href: "/chef/statistics", icon: chartIcon },
];

const variants = {
  // the chef design closes its short list with one more divider; admin's doesn't
  admin: { nav: adminNav, role: "Admin", trailingDivider: false },
  chef: { nav: chefNav, role: "Chef", trailingDivider: true },
};

const isActive = (pathname: string, href: string) => pathname === href;

// e.g. "Usage Statistics" -> "nav-usage-statistics"
const groupId = (label: string) =>
  `nav-${label.toLowerCase().replace(/\s+/g, "-")}`;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");

export default function Sidebar({
  name,
  variant,
}: {
  name: string;
  variant: keyof typeof variants;
}) {
  const { nav, role, trailingDivider } = variants[variant];
  const pathname = usePathname();
  // small screens only; on desktop the sidebar is always shown
  const [menuOpen, setMenuOpen] = useState(false);
  // every section starts expanded, like the design
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // close the small-screen menu after picking a link, or on Escape
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const current = (href: string) =>
    isActive(pathname, href) ? ("page" as const) : undefined;

  return (
    <>
      <MenuButton
        type="button"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={() => setMenuOpen(true)}
      >
        <span />
        <span />
        <span />
      </MenuButton>
      {menuOpen && <Backdrop onClick={closeMenu} />}

      <Aside id="sidebar" $open={menuOpen} className={instrumentSans.className}>
        <Top>
          <Brand
            href={variant === "admin" ? "/admin" : "/chef"}
            aria-label="Oakland Bloom home"
            onClick={closeMenu}
          >
            <Leaf src={leaf} alt="" width={37} height={29} priority />
            <BrandName>Oakland Bloom</BrandName>
          </Brand>

          <Nav aria-label="Main">
            <NavList>
              {nav.map(item => (
                <Fragment key={item.label}>
                  <Divider aria-hidden="true" />
                  <li>
                    {"href" in item ? (
                      <ItemLink
                        href={item.href}
                        aria-current={current(item.href)}
                        $gap={item.label === "Home" ? "1rem" : "1.375rem"}
                        onClick={closeMenu}
                      >
                        <Image src={item.icon} alt="" />
                        {item.label}
                      </ItemLink>
                    ) : (
                      <Group>
                        <GroupToggle
                          type="button"
                          aria-expanded={!collapsed[item.label]}
                          aria-controls={groupId(item.label)}
                          onClick={() =>
                            setCollapsed(c => ({
                              ...c,
                              [item.label]: !c[item.label],
                            }))
                          }
                        >
                          <ToggleLabel>
                            <Image src={item.icon} alt="" />
                            {item.label}
                          </ToggleLabel>
                          <Chevron
                            src={chevronIcon}
                            alt=""
                            $open={!collapsed[item.label]}
                          />
                        </GroupToggle>

                        {!collapsed[item.label] && (
                          <SubList id={groupId(item.label)}>
                            {item.children.map(child => (
                              <li key={child.href}>
                                <SubLink
                                  href={child.href}
                                  aria-current={current(child.href)}
                                  onClick={closeMenu}
                                >
                                  {/* blank 16x14 slot in the design that lines labels up */}
                                  <Image
                                    src={subitemIcon}
                                    alt=""
                                    width={16}
                                    height={14}
                                  />
                                  {child.label}
                                </SubLink>
                              </li>
                            ))}
                          </SubList>
                        )}
                      </Group>
                    )}
                  </li>
                </Fragment>
              ))}
              {trailingDivider && <Divider aria-hidden="true" />}
            </NavList>
          </Nav>
        </Top>

        <Footer>
          <FooterDivider />
          <Profile>
            <Avatar aria-hidden="true">{initialsOf(name)}</Avatar>
            <ProfileText>
              <ProfileName>{name}</ProfileName>
              <ProfileRole>{role}</ProfileRole>
            </ProfileText>
          </Profile>
        </Footer>
      </Aside>
    </>
  );
}
