import AppShell from "@/components/AppShell/AppShell";

// every admin page gets the admin sidebar. (admin)/layout.tsx already checks access
export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell variant="admin">{children}</AppShell>;
}
