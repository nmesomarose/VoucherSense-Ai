import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoucherSense Ai",
  description: "AI-powered receipt capture, extraction and expense insight.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}