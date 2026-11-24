import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/global.css";
import StyledComponentsRegistry from "@/lib/registry";

// font definitions
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// site metadata - what shows up on embeds
export const metadata: Metadata = {
  title: "Oakland Bloom",
  description: "Kitchen reservations and catering for Oakland Bloom chefs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={sans.className}>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}
