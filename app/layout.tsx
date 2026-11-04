import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/global.css";
import { AuthProvider } from "@/contexts/AuthProvider";
import StyledComponentsRegistry from "@/lib/registry";
import { getCurrentUser } from "@/lib/supabase/getUser";

// font definitions
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// site metadata - what shows up on embeds
export const metadata: Metadata = {
  title: "Project Name",
  description: "Description of project",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className={sans.className}>
        <StyledComponentsRegistry>
          <AuthProvider
            userId={user?.id ?? null}
            userEmail={user?.email ?? null}
          >
            {children}
          </AuthProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
