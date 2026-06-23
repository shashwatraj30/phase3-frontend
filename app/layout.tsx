import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Copilot",
  description: "Multi-agent academic research assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}