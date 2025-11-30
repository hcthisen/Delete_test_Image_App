"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-id";
import { triggerScenarioGeneration } from "@/lib/n8n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAvatarById, getAvatarImages, getSignedAvatarUrl, getSignedAvatarUrls } from "@/lib/supabase/avatars";
import type { Avatar, AvatarImage } from "@/lib/types/avatars";

const POLL_INTERVALS = [5000, 10000, 20000, 40000, 80000];

export default function AvatarDetailPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const requestId = useMemo(() => getRequestId(), []);
  const [user, setUser] = useState<User | null>(null);
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [images, setImages] = useState<AvatarImage[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scenarioPrompt, setScenarioPrompt] = useState("");
  const avatarId = params.id;

  useEffect(() => {
    let isMounted = true;

    const loadAvatar = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login");
        return;
      }

      if (!isMounted) return;
      setUser(currentUser);

      const { data: avatarRow, error } = await getAvatarById(supabase, avatarId, currentUser.id);

      if (!isMounted) return;
      if (error) {
        logger.error({
          scope: "http.avatar.detail",
          msg: "Failed to fetch avatar",
          requestId,
          userId: currentUser.id,
          avatarId,
          err: error,
        });
      }

      if (avatarRow) {
        setAvatar(avatarRow as Avatar);
        logger.info({
          scope: "http.avatar.detail",
          msg: "Avatar loaded",
          requestId,
          userId: currentUser.id,
          avatarId,
        });
        const signed = await getSignedAvatarUrl(supabase, (avatarRow as Avatar).profile_image_path);
        if (isMounted) setPrimaryImageUrl(signed);

        const { data: imageRows, error: imageError } = await getAvatarImages(supabase, avatarId, currentUser.id);
        if (imageError) {
          logger.error({
            scope: "http.avatar.detail",
            msg: "Failed to fetch avatar images",
            requestId,
            userId: currentUser.id,
            avatarId,
            err: imageError,
          });
        } else if (imageRows) {
          setImages(imageRows as AvatarImage[]);
          const signedMap = await getSignedAvatarUrls(supabase, imageRows as AvatarImage[]);
          if (isMounted) setImageUrls(signedMap);
        }
      }

      setIsLoading(false);
    };

    loadAvatar();

    return () => {
      isMounted = false;
    };
  }, [avatarId, requestId, router, supabase]);

  useEffect(() => {
    if (!avatar || !user) return;
    if (avatar.status === "ready" || avatar.status === "failed") return;

    let cancelled = false;

    const pollAvatar = async (attempt = 0): Promise<void> => {
      if (cancelled || attempt >= POLL_INTERVALS.length) return;

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVALS[attempt]));
      if (cancelled) return;

      const { data: latestAvatar, error } = await getAvatarById(supabase, avatarId, user.id);
      if (error) {
        logger.error({
          scope: "http.avatar.detail",
          msg: "Failed to refresh avatar",
          requestId,
          userId: user.id,
          avatarId,
          err: error,
          operation: "avatar.refresh",
        });
        return;
      }

      if (!cancelled && latestAvatar) {
        setAvatar(latestAvatar as Avatar);
        const signed = await getSignedAvatarUrl(supabase, (latestAvatar as Avatar).profile_image_path);
        if (!cancelled) setPrimaryImageUrl(signed);

        const { data: imageRows, error: imageError } = await getAvatarImages(supabase, avatarId, user.id);
        if (imageError) {
          logger.error({
            scope: "http.avatar.detail",
            msg: "Failed to refresh avatar images",
            requestId,
            userId: user.id,
            avatarId,
            err: imageError,
            operation: "avatar.refresh",
          });
        } else if (!cancelled && imageRows) {
          setImages(imageRows as AvatarImage[]);
          const signedMap = await getSignedAvatarUrls(supabase, imageRows as AvatarImage[]);
          if (!cancelled) setImageUrls(signedMap);
        }

        if (latestAvatar.status !== "ready" && latestAvatar.status !== "failed") {
          pollAvatar(attempt + 1);
        }
      }
    };

    pollAvatar();

    return () => {
      cancelled = true;
    };
  }, [avatar, avatarId, requestId, supabase, user]);

  const renderStatus = (status: Avatar["status"]) => {
    const labels: Record<Avatar["status"], string> = {
      pending: "Queued for forging…",
      generating: "We’re crafting this avatar…",
      ready: "Ready",
      failed: "Failed",
    };
    return <span className={`pill ${status}`}>{labels[status]}</span>;
  };

  const triggerSceneGeneration = async () => {
    if (!avatar || !user) return;
    setStatusMessage("Requesting new scenes…");
    try {
      await triggerScenarioGeneration(avatar, scenarioPrompt || undefined, requestId);
      logger.info({
        scope: "http.avatar.scenario",
        msg: "Scenario generation requested",
        requestId,
        userId: user.id,
        avatarId: avatar.id,
        payloadSummary: scenarioPrompt ? scenarioPrompt.slice(0, 64) : undefined,
      });
      setStatusMessage("Scenes requested. Check back in a moment as they render.");
    } catch (error) {
      logger.error({
        scope: "http.avatar.scenario",
        msg: "Scenario generation request failed",
        requestId,
        userId: user.id,
        avatarId: avatar.id,
        err: error,
      });
      setStatusMessage("Could not trigger scene generation. Please try again.");
    }
  };

  if (isLoading || !avatar) {
    return (
      <div className="panel">
        <p className="page-lead">Loading your avatar…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel detail-hero">
        <div className="detail-image">
          {primaryImageUrl ? (
            <Image src={primaryImageUrl} alt={`${avatar.name} primary`} width={800} height={800} style={{ width: "100%", height: "auto" }} />
          ) : (
            <div className="avatar-thumb" style={{ width: "100%", height: "100%", minHeight: "320px" }}>
              {avatar.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="space-y-2">
            <p className="page-lead" style={{ margin: 0 }}>Avatar overview</p>
            <h1 className="page-title">{avatar.name}</h1>
            <p className="page-lead" style={{ margin: 0 }}>
              {avatar.age} · {avatar.job_title} · {avatar.city ? `${avatar.city}, ${avatar.country ?? ""}` : avatar.country}
            </p>
            {renderStatus(avatar.status)}
          </div>
          <div className="space-y-2">
            <h3 className="page-title" style={{ margin: 0 }}>Narrative profile</h3>
            <p className="page-lead">
              {avatar.persona_summary || "We’re crafting this avatar’s story and face…"}
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="page-title" style={{ margin: 0 }}>Actions</h3>
            <div className="hero-actions">
              <button className="button" type="button" onClick={triggerSceneGeneration}>
                Generate more scenes
              </button>
              <input
                className="input"
                placeholder="Optional scenario prompt"
                value={scenarioPrompt}
                onChange={(event) => setScenarioPrompt(event.target.value)}
              />
            </div>
            {statusMessage ? <p className="message">{statusMessage}</p> : null}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="page-title">Profile fields</h2>
        <div className="traits-grid">
          <div className="field">
            <span className="label">Life &amp; work</span>
            <span className="page-lead">{avatar.job_title}</span>
            {avatar.industry ? <span className="page-lead">Industry: {avatar.industry}</span> : null}
          </div>
          <div className="field">
            <span className="label">Location</span>
            <span className="page-lead">{avatar.address_line}</span>
            <span className="page-lead">{avatar.city}</span>
            <span className="page-lead">{avatar.region}</span>
            <span className="page-lead">{avatar.country}</span>
          </div>
          <div className="field">
            <span className="label">Appearance</span>
            <span className="page-lead">Skin tone: {avatar.skin_tone ?? "-"}</span>
            <span className="page-lead">Hair color: {avatar.hair_color ?? "-"}</span>
            <span className="page-lead">Height: {avatar.height_cm ? `${avatar.height_cm} cm` : "-"}</span>
          </div>
          <div className="field">
            <span className="label">Lifestyle</span>
            <span className="page-lead">Marital status: {avatar.marital_status ?? "-"}</span>
            <span className="page-lead">Hobbies: {avatar.hobbies?.join(", ") || "-"}</span>
            <span className="page-lead">Orientation: {avatar.political_orientation ?? "-"}</span>
          </div>
          <div className="field">
            <span className="label">Other traits &amp; quirks</span>
            <span className="page-lead">{avatar.other_traits || "No extra traits yet."}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="hero-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="page-title" style={{ margin: 0 }}>
              Scenes &amp; moments
            </h2>
            <p className="page-lead" style={{ margin: 0 }}>
              Explore profile and scenario renders linked to this avatar.
            </p>
          </div>
        </div>
        {images.length === 0 ? (
          <p className="page-lead">No scenes yet. Generate more to see this avatar in action.</p>
        ) : (
          <div className="gallery-grid">
            {images.map((image) => (
              <div key={image.id} className="gallery-card">
                {imageUrls[image.id] ? (
                  <Image src={imageUrls[image.id]} alt={image.label ?? image.type} width={400} height={320} style={{ width: "100%", height: "auto" }} />
                ) : (
                  <div className="avatar-thumb" style={{ width: "100%", height: "160px" }}>
                    {avatar.name.slice(0, 1)}
                  </div>
                )}
                <div className="gallery-meta">
                  <strong>{image.label || image.type}</strong>
                  {image.description ? <p className="page-lead" style={{ margin: 0 }}>{image.description}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
