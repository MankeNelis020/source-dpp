import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { RouteShell } from "@/components/source/route-shell";

const space = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "SOURCE — Trusted product claims infrastructure",
    template: "%s · SOURCE",
  },
  description:
    "The evidence layer for product data. Connect your product system. SOURCE resolves what you have, what is missing, what can be trusted and what may be reused.",
};

export const viewport = {
  themeColor: "#EFF2ED",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${space.variable} ${inter.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RouteShell>{children}</RouteShell>
      </body>
    </html>
  );
}
