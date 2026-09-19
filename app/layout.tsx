import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Break My Agent",
  description: "Try to stop a durable AI agent from completing its task.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
