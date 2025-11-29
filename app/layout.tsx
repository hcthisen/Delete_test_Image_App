import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "@/components/header";
import "../styles/app.css";

export const metadata: Metadata = {
  title: "Human Forge",
  description: "Forge rich digital humans with detailed traits, stories, and visuals powered by Supabase.",
  icons: {
    icon: [{ url: "/favicon.svg" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="site-body">
        <Header />
        <main className="main-content">
          <div className="section-shell">{children}</div>
        </main>
        <footer>
          <div className="footer-inner">
            <span>Your App Name</span>
            <span>Built with Next.js and Supabase.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
