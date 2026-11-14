import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Wall — A little more connected",
  description: "A familiar place for friends, small updates, and good conversation. A 2008-inspired social wall with live updates.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
