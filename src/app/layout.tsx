import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FrankiFlow Mail",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "FrankiFlow Mail", statusBarStyle: "default" },
  description: "A calmer space for your conversations.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
