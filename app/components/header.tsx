"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const navigationLinks = [
  { href: "/", label: "Home" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setUser(currentUser ?? null);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    router.push("/");
  };

  return (
    <header className="site-header" role="banner">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Your App Name</span>
        </Link>

        <nav aria-label="Primary" className="nav-links">
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              className="nav-link"
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="auth-actions">
          {user ? (
            <>
              <Link className="button secondary" href="/profile">
                Profile
              </Link>
              <button className="button" type="button" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? "Signing out…" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link className="button secondary" href="/signup">
                Sign up
              </Link>
              <Link className="button" href="/login">
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
