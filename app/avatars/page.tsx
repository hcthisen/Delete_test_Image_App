"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-id";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAvatarsForUser, getPrimaryAvatarImages, getSignedAvatarUrls } from "@/lib/supabase/avatars";
import type { Avatar, AvatarImage } from "@/lib/types/avatars";

export default function AvatarsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const requestId = useMemo(() => getRequestId(), []);
  const [user, setUser] = useState<User | null>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAvatars = async () => {
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

      const { data, error } = await getAvatarsForUser(supabase, currentUser.id);

      if (!isMounted) return;
      if (error) {
        logger.error({
          scope: "http.avatar.list",
          msg: "Failed to fetch avatars",
          requestId,
          userId: currentUser.id,
          err: error,
        });
      }
      if (data) {
        setAvatars(data as Avatar[]);
        const avatarIds = data.map((avatar) => avatar.id);
        const { data: primaryImages, error: primaryError } = await getPrimaryAvatarImages(
          supabase,
          avatarIds,
          currentUser.id
        );

        if (primaryError) {
          logger.error({
            scope: "http.avatar.list",
            msg: "Failed to fetch primary avatar images",
            requestId,
            userId: currentUser.id,
            err: primaryError,
          });
        }

        if (isMounted && primaryImages) {
          const typedPrimaryImages = primaryImages as AvatarImage[];
          const signedUrls = await getSignedAvatarUrls(supabase, typedPrimaryImages);
          const avatarToUrl = Object.fromEntries(
            Object.entries(signedUrls)
              .map(([imageId, url]) => {
                const matchingImage = typedPrimaryImages.find((img) => img.id === imageId);
                return matchingImage ? [matchingImage.avatar_id, url] : null;
              })
              .filter(Boolean) as [string, string][]
          );
          setImageMap(avatarToUrl);
        }
        logger.info({
          scope: "http.avatar.list",
          msg: "Avatars loaded",
          requestId,
          userId: currentUser.id,
          payloadSummary: { count: data.length },
        });
      }

      setIsLoading(false);
    };

    loadAvatars();

    return () => {
      isMounted = false;
    };
  }, [requestId, router, supabase]);

  const renderStatus = (status: Avatar["status"]) => {
    const labels: Record<Avatar["status"], string> = {
      pending: "Queued for forging…",
      generating: "We’re crafting this avatar…",
      ready: "Ready",
      failed: "Failed",
    };
    return <span className={`pill ${status}`}>{labels[status]}</span>;
  };

  if (isLoading) {
    return (
      <div className="panel">
        <p className="page-lead">Loading your forged humans…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel">
        <h1 className="page-title">Welcome to Human Forge</h1>
        <p className="page-lead">
          Craft rich, lifelike digital humans for research, testing, and storytelling. The more detail you add, the sharper
          your insights will be.
        </p>
        <Link className="button" href="/avatars/new">
          Forge new human
        </Link>
      </div>

      {avatars.length === 0 ? (
        <div className="panel">
          <h2>No avatars yet</h2>
          <p className="page-lead">
            Start by forging your first digital human. The more detail you add, the sharper your insights will be.
          </p>
          <Link className="button" href="/avatars/new">
            Forge your first human
          </Link>
        </div>
      ) : (
        <div className="avatar-grid">
          {avatars.map((avatar) => (
            <Link key={avatar.id} href={`/avatars/${avatar.id}`} className="avatar-card">
              <header>
                <div className="avatar-thumb">
                  {imageMap[avatar.id] ? (
                    <Image src={imageMap[avatar.id]} alt={`${avatar.name} avatar`} width={64} height={64} />
                  ) : (
                    <span>{avatar.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <h3 className="page-title" style={{ margin: 0 }}>
                    {avatar.name}
                  </h3>
                  <p className="page-lead" style={{ margin: 0 }}>
                    {avatar.age} yrs · {avatar.job_title ?? "Role tbd"}
                  </p>
                </div>
              </header>
              {renderStatus(avatar.status)}
              <div className="avatar-traits">
                <span>{avatar.city ? `${avatar.city}, ${avatar.country ?? ""}` : avatar.country ?? "Location tbd"}</span>
                {avatar.political_orientation ? <span>Orientation: {avatar.political_orientation}</span> : null}
                {avatar.hobbies ? <span>Hobbies: {avatar.hobbies}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
