import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/global.css";
import { AuthProvider } from "@/contexts/AuthProvider";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body className={sans.className}>
        <AuthProvider userId={user?.id ?? null} userEmail={user?.email ?? null}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
