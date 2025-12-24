// src/app/b/[slug]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import PublicBookingPage from "@/modules/crm/components/PublicBookingPage";

export const runtime = "nodejs";

type BookingLink = {
  id: string;
  team_id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  description: string | null;
  primary_color: string | null;
  booking_type: "one_on_one" | "group" | "round_robin";
  duration_minutes: number | null;
  min_notice_hours: number | null;
  max_notice_days: number | null;
};

type OrgInfo = {
  name: string | null;
  logo_url: string | null; // REAL URL (public or signed)
  primary_color: string | null;
};

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function unwrapParams<T>(p: T | Promise<T>): Promise<T> {
  return p && typeof (p as any).then === "function" ? await (p as any) : (p as any);
}

function isHttpUrl(s?: string | null) {
  return !!s && (s.startsWith("http://") || s.startsWith("https://"));
}

function normalizeLogoPath(raw: string) {
  let v = (raw || "").trim().replace(/^\/+/, "");

  // "org-logos/xyz.png"
  if (v.startsWith("org-logos/")) v = v.slice("org-logos/".length);

  // "public/org-logos/xyz.png"
  if (v.startsWith("public/org-logos/")) v = v.slice("public/org-logos/".length);

  // if somebody stored "org-logos//x.png"
  v = v.replace(/^\/+/, "");

  return v;
}

async function resolveOrgLogoUrl(admin: ReturnType<typeof supabaseAdmin>, raw: string | null) {
  const r = (raw || "").trim();
  if (!r) return null;

  // already a full URL
  if (isHttpUrl(r)) return r;

  // otherwise interpret as a path inside the org-logos bucket
  const path = normalizeLogoPath(r);
  if (!path) return null;

  // Create a signed URL (works for public OR private buckets)
  const signed = await admin.storage.from("org-logos").createSignedUrl(path, 60 * 60);
  if (signed.data?.signedUrl) return signed.data.signedUrl;

  // fallback to public URL (only works if bucket is public)
  const publicUrl = admin.storage.from("org-logos").getPublicUrl(path).data.publicUrl;
  return publicUrl || null;
}

export default async function BookingSlugPage({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const p = await unwrapParams(params);
  const slug = String(p?.slug ?? "").trim();
  if (!slug) return notFound();

  const admin = supabaseAdmin();

  // 1) booking link
  const { data: link, error: linkErr } = await admin
    .from("booking_links")
    .select(
      "id, team_id, owner_user_id, name, slug, description, primary_color, booking_type, duration_minutes, min_notice_hours, max_notice_days"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (linkErr || !link) return notFound();

  // 2) Resolve organization id via profiles.company_id
  // Prefer the booking link owner profile (most reliable)
  let companyId: string | null = null;

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", link.owner_user_id)
    .maybeSingle();

  if (ownerProfile?.company_id) companyId = String(ownerProfile.company_id);

  // Fallback: any profile in that team with company_id
  if (!companyId) {
    const { data: anyTeamProfile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("team_id", link.team_id)
      .not("company_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (anyTeamProfile?.company_id) companyId = String(anyTeamProfile.company_id);
  }

  // 3) Fetch org by organizations.id = companyId
  let org: OrgInfo | null = null;

  if (companyId) {
    const { data: orgRow } = await admin
      .from("organizations")
      .select("name, logo_url, primary_color")
      .eq("id", companyId)
      .maybeSingle();

    if (orgRow) {
      org = {
        name: orgRow.name ?? null,
        primary_color: orgRow.primary_color ?? null,
        logo_url: await resolveOrgLogoUrl(admin, orgRow.logo_url ?? null),
      };
    }
  }

  return <PublicBookingPage link={link as BookingLink} org={org} />;
}
