import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediBill Pro",
  description: "Secure billing, inventory, GST and collections for medical agencies.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
