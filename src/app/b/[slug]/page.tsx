// src/app/b/[slug]/page.tsx

/**
 * Simplifications made:
 * • Centralized env validation and Supabase admin client creation (no non-null assertions)
 * • Collapsed slug parsing into a single safe step with early notFound()
 * • Extracted “find companyId” into a small helper to reduce repeated query boilerplate
 * • Simplified logo URL resolution by normalizing path once and using a single return path
 * • Reduced nesting/branching while keeping identical query behavior and fallbacks
 */

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const isHttpUrl = (s?: string | null) =>
  typeof s === "string" &&
  (s.startsWith("http://") || s.startsWith("https://"));

function normalizeLogoPath(raw: string) {
  let v = (raw || "").trim().replace(/^\/+/, "");

  // allow a few common stored prefixes
  v = v.replace(/^public\/org-logos\//, "");
  v = v.replace(/^org-logos\//, "");

  // if somebody stored extra slashes
  v = v.replace(/^\/+/, "");

  return v;
}

async function resolveOrgLogoUrl(
  admin: ReturnType<typeof supabaseAdmin>,
  raw: string | null,
) {
  const r = (raw || "").trim();
  if (!r) return null;
  if (isHttpUrl(r)) return r;

  const path = normalizeLogoPath(r);
  if (!path) return null;

  // signed URL works for public OR private buckets
  const signed = await admin.storage
    .from("org-logos")
    .createSignedUrl(path, 60 * 60);

  if (signed.data?.signedUrl) return signed.data.signedUrl;

  // fallback to public URL (only works if bucket is public)
  return (
    admin.storage.from("org-logos").getPublicUrl(path).data.publicUrl || null
  );
}

async function findCompanyId(
  admin: ReturnType<typeof supabaseAdmin>,
  ownerUserId: string,
  teamId: string,
): Promise<string | null> {
  // Prefer the booking link owner profile
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", ownerUserId)
    .maybeSingle();

  if (ownerProfile?.company_id) return String(ownerProfile.company_id);

  // Fallback: any profile in that team with company_id
  const { data: anyTeamProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("team_id", teamId)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();

  return anyTeamProfile?.company_id ? String(anyTeamProfile.company_id) : null;
}

export default async function BookingSlugPage({
  params,
}: {
  // ✅ Next.js 16 expects Promise-based params
  params: Promise<{ slug: string }>;
}) {
  const { slug: slugParam } = await params;
  const slug = String(slugParam ?? "").trim();
  if (!slug) return notFound();

  const admin = supabaseAdmin();

  // 1) booking link
  const { data: link, error: linkErr } = await admin
    .from("booking_links")
    .select(
      "id, team_id, owner_user_id, name, slug, description, primary_color, booking_type, duration_minutes, min_notice_hours, max_notice_days",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (linkErr || !link) return notFound();

  // 2) Resolve organization id via profiles.company_id (owner first, then team fallback)
  const companyId = await findCompanyId(
    admin,
    link.owner_user_id,
    link.team_id,
  );

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
