import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR Platform",
  description: "Core HR and employee directory",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
