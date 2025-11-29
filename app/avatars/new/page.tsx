"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { triggerAvatarGeneration } from "@/lib/n8n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createAvatar } from "@/lib/supabase/avatars";
import type { Avatar } from "@/lib/types/avatars";

const skinToneOptions = [
  "Caucasian",
  "Black",
  "Hispanic/Latino",
  "East Asian",
  "South Asian",
  "Middle Eastern/North African",
  "Mixed/Other",
  "Prefer not to say",
];

const maritalOptions = ["Single", "In a relationship", "Married", "Divorced", "Widowed", "Prefer not to say"];

const politicalOptions = ["Left", "Center", "Right", "Apolitical", "Prefer not to say"];

export default function NewAvatarPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    age: 25,
    height_cm: "",
    skin_tone: "",
    hair_color: "",
    marital_status: "",
    job_title: "",
    industry: "",
    address_line: "",
    city: "",
    region: "",
    country: "",
    hobbies: "",
    political_orientation: "",
    other_traits: "",
    persona_summary: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    if (!form.name || !form.job_title) {
      setStatus("Name and job title are required to forge an avatar.");
      setIsSubmitting(false);
      return;
    }

    const payload: Partial<Avatar> = {
      user_id: user.id,
      name: form.name,
      age: Number(form.age),
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      skin_tone: form.skin_tone || null,
      hair_color: form.hair_color || null,
      marital_status: form.marital_status || null,
      job_title: form.job_title,
      industry: form.industry || null,
      address_line: form.address_line || null,
      city: form.city || null,
      region: form.region || null,
      country: form.country || null,
      hobbies: form.hobbies ? form.hobbies.split(",").map((hobby) => hobby.trim()).filter(Boolean) : null,
      political_orientation: form.political_orientation || null,
      other_traits: form.other_traits || null,
      persona_summary: null,
      profile_image_path: null,
      status: "generating",
    };

    const { data: created, error } = await createAvatar(supabase, payload as Avatar);

    if (error || !created) {
      setStatus(error?.message ?? "Could not forge this avatar. Try again.");
      setIsSubmitting(false);
      return;
    }

    try {
      await triggerAvatarGeneration(created as Avatar);
      setStatus("We’re crafting this avatar’s story and face…");
      router.push(`/avatars/${created.id}`);
    } catch (hookError) {
      console.error(hookError);
      setStatus("Avatar saved, but we couldn’t reach the generator. You can retry from the detail page.");
      router.push(`/avatars/${created.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel">
      <h1 className="page-title">Forge a new avatar</h1>
      <p className="page-lead">Describe who this person is. The more detail you provide, the more realistic your avatar becomes.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        <section className="space-y-2">
          <h2>Core identity</h2>
          <label className="field">
            <span className="label">Name</span>
            <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="field">
            <span className="label">Age</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.age}
              onChange={(event) => setForm({ ...form, age: Number(event.target.value) })}
              required
            />
          </label>
          <label className="field">
            <span className="label">Height (cm)</span>
            <input
              className="input"
              type="number"
              value={form.height_cm}
              onChange={(event) => setForm({ ...form, height_cm: event.target.value })}
              placeholder="Optional"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h2>Appearance</h2>
          <label className="field">
            <span className="label">Skin tone</span>
            <select
              className="input"
              value={form.skin_tone}
              onChange={(event) => setForm({ ...form, skin_tone: event.target.value })}
            >
              <option value="">Select skin tone</option>
              {skinToneOptions.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Hair color</span>
            <input
              className="input"
              value={form.hair_color}
              onChange={(event) => setForm({ ...form, hair_color: event.target.value })}
              placeholder="Blonde, brown, black, red, gray…"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h2>Life &amp; work</h2>
          <label className="field">
            <span className="label">Job title</span>
            <input
              className="input"
              value={form.job_title}
              onChange={(event) => setForm({ ...form, job_title: event.target.value })}
              placeholder="Software engineer, bartender, hairdresser…"
              required
            />
          </label>
          <label className="field">
            <span className="label">Industry</span>
            <input
              className="input"
              value={form.industry}
              onChange={(event) => setForm({ ...form, industry: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span className="label">Marital status</span>
            <select
              className="input"
              value={form.marital_status}
              onChange={(event) => setForm({ ...form, marital_status: event.target.value })}
            >
              <option value="">Select status</option>
              {maritalOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Address line</span>
            <input className="input" value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} />
          </label>
          <label className="field">
            <span className="label">City</span>
            <input className="input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label className="field">
            <span className="label">Region / State</span>
            <input className="input" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
          </label>
          <label className="field">
            <span className="label">Country</span>
            <input className="input" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
          </label>
        </section>

        <section className="space-y-2">
          <h2>Mindset &amp; lifestyle</h2>
          <label className="field">
            <span className="label">Hobbies</span>
            <input
              className="input"
              value={form.hobbies}
              onChange={(event) => setForm({ ...form, hobbies: event.target.value })}
              placeholder="Comma separated: running, cooking, gaming"
            />
          </label>
          <label className="field">
            <span className="label">Political orientation</span>
            <select
              className="input"
              value={form.political_orientation}
              onChange={(event) => setForm({ ...form, political_orientation: event.target.value })}
            >
              <option value="">Select orientation</option>
              {politicalOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Short about</span>
            <textarea
              className="textarea"
              value={form.persona_summary}
              onChange={(event) => setForm({ ...form, persona_summary: event.target.value })}
              placeholder="How would you describe this person in 2–3 sentences?"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h2>Other traits &amp; quirks</h2>
          <p className="page-lead" style={{ margin: 0 }}>
            Go wild: “long blonde hair”, “full beard”, “sleeve tattoo”, “always wears a leather jacket” — any detail that makes
            this avatar feel real.
          </p>
          <textarea
            className="textarea"
            value={form.other_traits}
            onChange={(event) => setForm({ ...form, other_traits: event.target.value })}
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
