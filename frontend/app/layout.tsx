import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoPost – AI Video Repurposing",
  description: "Automatically slice and post your best video moments",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
