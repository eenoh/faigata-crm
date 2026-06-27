import { notFound } from "next/navigation";
import PublicBookingPage from "@/features/crm/components/PublicBookingPage";
import { getLocale } from "next-intl/server";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BookingLink = {
  id: string;
  team_id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  description: string | null;
  confirmation_heading: string | null;
  confirmation_subheading: string | null;
  primary_color: string | null;
  booking_type: "one_on_one" | "group" | "round_robin";
  duration_minutes: number | null;
  min_notice_hours: number | null;
  max_notice_days: number | null;
};

type OrgInfo = {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

const isHttpUrl = (s?: string | null) =>
  typeof s === "string" &&
  (s.startsWith("http://") || s.startsWith("https://"));

function normalizeLogoPath(raw: string) {
  let v = (raw || "").trim().replace(/^\/+/, "");

  v = v.replace(/^public\/org-logos\//, "");
  v = v.replace(/^org-logos\//, "");
  v = v.replace(/^\/+/, "");

  return v;
}

async function resolveOrgLogoUrl(raw: string | null) {
  const r = (raw || "").trim();
  if (!r) return null;
  if (isHttpUrl(r)) return r;

  const path = normalizeLogoPath(r);
  if (!path) return null;

  const admin = getSupabaseAdminClient();
  const signed = await admin.storage
    .from("org-logos")
    .createSignedUrl(path, 60 * 60);

  if (signed.data?.signedUrl) return signed.data.signedUrl;

  return (
    admin.storage.from("org-logos").getPublicUrl(path).data.publicUrl || null
  );
}

async function findCompanyId(
  ownerUserId: string,
  teamId: string,
): Promise<string | null> {
  const admin = getSupabaseAdminClient();

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", ownerUserId)
    .maybeSingle();

  if ((ownerProfile as { company_id?: string | null } | null)?.company_id) {
    return String((ownerProfile as { company_id?: string }).company_id);
  }

  const { data: anyTeamProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("team_id", teamId)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();

  return (
    (anyTeamProfile as { company_id?: string | null } | null)?.company_id ??
    null
  );
}

export default async function BookingSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: slugParam } = await params;
  const slug = String(slugParam ?? "").trim();
  if (!slug) return notFound();

  const admin = getSupabaseAdminClient();
  const locale = await getLocale();

  const { data: link, error: linkErr } = await admin
    .from("booking_links")
    .select(
      "id, team_id, owner_user_id, name, slug, description, confirmation_heading, confirmation_subheading, primary_color, booking_type, duration_minutes, min_notice_hours, max_notice_days",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (linkErr || !link) return notFound();

  const bookingLink = link as unknown as BookingLink;

  await applyEntityTranslations({
    admin,
    teamId: bookingLink.team_id,
    entityTable: "booking_links",
    rows: [bookingLink as any],
    requestedLocale: locale,
    fields: [
      {
        fieldKey: "name",
        sourceText: (row: any) => String(row.name ?? ""),
        assign: (row: any, value) => {
          row.name = value;
        },
      },
      {
        fieldKey: "description",
        sourceText: (row: any) => String(row.description ?? ""),
        assign: (row: any, value) => {
          row.description = value || null;
        },
      },
      {
        fieldKey: "confirmation_heading",
        sourceText: (row: any) => String(row.confirmation_heading ?? ""),
        assign: (row: any, value) => {
          row.confirmation_heading = value || null;
        },
      },
      {
        fieldKey: "confirmation_subheading",
        sourceText: (row: any) => String(row.confirmation_subheading ?? ""),
        assign: (row: any, value) => {
          row.confirmation_subheading = value || null;
        },
      },
    ],
  });

  const companyId = await findCompanyId(
    bookingLink.owner_user_id,
    bookingLink.team_id,
  );

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
        logo_url: await resolveOrgLogoUrl(orgRow.logo_url ?? null),
      };
    }
  }

  return <PublicBookingPage link={bookingLink} org={org} />;
}
