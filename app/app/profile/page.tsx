"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export default function ProfilePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({ full_name: "", avatar_url: "", bio: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login");
        return;
      }

      if (!isMounted) return;
      setUser(currentUser);

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, bio")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        setStatus(error.message);
      } else if (data) {
        setProfile({
          full_name: data.full_name ?? "",
          avatar_url: data.avatar_url ?? "",
          bio: data.bio ?? "",
        });
      } else {
        setStatus("Create your profile details and hit save.");
      }

      setIsLoading(false);
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setStatus(null);

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Profile saved.");
    }

    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="panel">
        <p className="page-lead">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1 className="page-title">Profile</h1>
      <p className="page-lead">Update your basic information stored in Supabase.</p>

      <dl className="page-lead">
        <dt>Email</dt>
        <dd>{user?.email}</dd>
      </dl>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Full name</span>
          <input
            className="input"
            type="text"
            value={profile.full_name ?? ""}
            onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
            placeholder="Your full name"
          />
        </label>

        <label className="field">
          <span className="label">Avatar URL</span>
          <input
            className="input"
            type="url"
            value={profile.avatar_url ?? ""}
            onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })}
            placeholder="https://example.com/avatar.png"
          />
        </label>

        <label className="field">
          <span className="label">Bio</span>
          <textarea
            className="textarea"
            value={profile.bio ?? ""}
            onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
            placeholder="Tell us about yourself"
          />
        </label>

        {status ? <p className="message">{status}</p> : null}

        <button className="button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
