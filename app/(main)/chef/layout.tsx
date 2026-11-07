import AppShell from "@/components/AppShell";

// every chef page gets the chef sidebar. (main)/layout.tsx already checks access
export default function ChefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell variant="chef">{children}</AppShell>;
}
