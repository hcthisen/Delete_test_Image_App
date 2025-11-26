// Root layout scaffolding added to wire Supabase-ready pages into Next.js App Router.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles/app.css";

export const metadata: Metadata = {
  title: "Journal.vet",
  description:
    "Journal.vet streamlines record keeping and communication for modern veterinary practices.",
  icons: {
    icon: [
      { url: "/branding/favicon.svg", type: "image/svg+xml" },
      { url: "/branding/favicon.ico" },
    ],
    shortcut: "/branding/favicon.ico",
    apple: "/branding/favicon.svg",
  },
  openGraph: {
    title: "Journal.vet",
    description:
      "Streamlined journaling and collaboration tools tailored for veterinary teams.",
    images: [
      {
        url: "/branding/social-card.png",
        width: 1200,
        height: 630,
        alt: "Journal.vet branding card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Journal.vet",
    description:
      "Streamlined journaling and collaboration tools tailored for veterinary teams.",
    images: ["/branding/social-card.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="app-body">
        {children}
      </body>
    </html>
  );
}
