"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { triggerAvatarGeneration } from "@/lib/n8n";
import { logger, safeSummary } from "@/lib/logger";
import { getRequestId } from "@/lib/request-id";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createAvatar } from "@/lib/supabase/avatars";
import type { Avatar } from "@/lib/types/avatars";

const ageRangeOptions = [
  { label: "Baby", value: "baby", numericAge: 1 },
  { label: "Toddler", value: "toddler", numericAge: 3 },
  { label: "Child", value: "child", numericAge: 8 },
  { label: "Teenager", value: "teenager", numericAge: 16 },
  { label: "Young adult", value: "young-adult", numericAge: 24 },
  { label: "Adult", value: "adult", numericAge: 34 },
  { label: "Middle aged", value: "middle-aged", numericAge: 48 },
  { label: "Older adult", value: "older-adult", numericAge: 64 },
  { label: "Senior", value: "senior", numericAge: 74 },
];

const skinToneOptions = [
  "Very fair",
  "Fair",
  "Medium",
  "Olive",
  "Brown",
  "Dark",
  "Prefer not to say",
];

const ethnicityOptions = [
  "Black or African descent",
  "East Asian",
  "Hispanic/Latino",
  "Indigenous",
  "Middle Eastern/North African",
  "South Asian",
  "Southeast Asian",
  "White",
  "Mixed/Other",
  "Prefer not to say",
];

export default function NewAvatarPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [form, setForm] = useState({
    ageRange: "young-adult",
    skinTone: "",
    ethnicity: "",
    energyLevel: 3,
    extroversion: 3,
    misc: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    const requestId = getRequestId();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn({
        scope: "http.avatar.create",
        msg: "User not authenticated for avatar creation",
        requestId,
      });
      router.push("/login");
      return;
    }

    const ageSelection = ageRangeOptions.find((option) => option.value === form.ageRange);

    if (!ageSelection) {
      setStatus("Please choose an age range to forge an avatar.");
      setIsSubmitting(false);
      logger.warn({
        scope: "http.avatar.create",
        msg: "Avatar creation blocked due to missing age range",
        requestId,
        userId: user.id,
      });
      return;
    }

    const generatedName = `New avatar (${ageSelection.label})`;

    const payload: Partial<Avatar> = {
      user_id: user.id,
      name: generatedName,
      age: ageSelection.numericAge,
      skin_tone: form.skinTone || null,
      other_traits: form.misc || null,
      persona_summary: null,
      profile_image_path: null,
      status: "generating",
      extra_attributes: {
        age_range: ageSelection.label,
        ethnicity: form.ethnicity || null,
        skin_tone_choice: form.skinTone || null,
        energy_level: form.energyLevel,
        extroversion: form.extroversion,
      },
    };

    const { data: created, error } = await createAvatar(supabase, payload as Avatar);

    if (error || !created) {
      setStatus(error?.message ?? "Could not forge this avatar. Try again.");
      setIsSubmitting(false);
      logger.error({
        scope: "http.avatar.create",
        msg: "Failed to create avatar record",
        requestId,
        userId: user.id,
        err: error ?? new Error("Avatar creation returned empty response"),
      });
      return;
    }

    logger.info({
      scope: "http.avatar.create",
      msg: "Avatar record created",
      requestId,
      userId: user.id,
      avatarId: created.id,
      payloadSummary: {
        name: created.name,
        jobTitle: created.job_title,
        city: created.city,
        hasPersonaSummary: Boolean(created.persona_summary),
      },
    });

    try {
      await triggerAvatarGeneration(created as Avatar, requestId);
      setStatus("We’re crafting this avatar’s story and face…");
      router.push(`/avatars/${created.id}`);
    } catch (hookError) {
      logger.error({
        scope: "webhook.error",
        msg: "Failed to trigger avatar generation webhook",
        requestId,
        userId: user.id,
        avatarId: created.id,
        err: hookError,
        payloadSummary: safeSummary({ avatarId: created.id }),
      });
      setStatus("Avatar saved, but we couldn’t reach the generator. You can retry from the detail page.");
      router.push(`/avatars/${created.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel">
      <h1 className="page-title">Forge a new avatar</h1>
      <p className="page-lead">
        Start with a few quick sliders and dropdowns. We’ll fill in names, backstories, and extra details automatically.
      </p>

      <form className="form-card" onSubmit={handleSubmit}>
        <section className="space-y-2">
          <h2>Quick basics</h2>
          <label className="field">
            <span className="label">Age range</span>
            <select
              className="input"
              value={form.ageRange}
              onChange={(event) => setForm({ ...form, ageRange: event.target.value })}
            >
              {ageRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Ethnicity</span>
            <select
              className="input"
              value={form.ethnicity}
              onChange={(event) => setForm({ ...form, ethnicity: event.target.value })}
            >
              <option value="">Choose an option</option>
              {ethnicityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-2">
          <h2>Appearance</h2>
          <label className="field">
            <span className="label">Skin tone</span>
            <select
              className="input"
              value={form.skinTone}
              onChange={(event) => setForm({ ...form, skinTone: event.target.value })}
            >
              <option value="">Choose an option</option>
              {skinToneOptions.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-2">
          <h2>Personality vibes</h2>
          <label className="field">
            <span className="label">Energy level</span>
            <input
              className="input"
              type="range"
              min={1}
              max={5}
              value={form.energyLevel}
              onChange={(event) => setForm({ ...form, energyLevel: Number(event.target.value) })}
            />
            <small className="page-lead">1 = calm and measured, 5 = high-energy go-getter</small>
          </label>
          <label className="field">
            <span className="label">Social comfort</span>
            <input
              className="input"
              type="range"
              min={1}
              max={5}
              value={form.extroversion}
              onChange={(event) => setForm({ ...form, extroversion: Number(event.target.value) })}
            />
            <small className="page-lead">1 = reserved observer, 5 = outgoing extrovert</small>
          </label>
        </section>

        <section className="space-y-2">
          <h2>MISC input</h2>
          <p className="page-lead" style={{ margin: 0 }}>
            Add anything unique: “long beard”, “blue-eyed and blonde”, “loves vintage motorcycles”, or any quirks you want.
          </p>
          <textarea
            className="textarea"
            value={form.misc}
            onChange={(event) => setForm({ ...form, misc: event.target.value })}
          />
        </section>

        {status ? <p className="message">{status}</p> : null}

        <button className="button" type="submit" disabled={isSubmitting} title="We’ll send this profile to our generators to create a rich persona and a profile image.">
          {isSubmitting ? "Forging…" : "Forge avatar"}
        </button>
      </form>
    </div>
  );
}
