import { NextResponse } from "next/server";
import {
  applyEntityTranslations,
  deleteEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getCrmAdminClient } from "@/features/crm/server/supabase";

export const runtime = "nodejs";

type BookingLinkRow = {
  id: string;
  team_id?: string | null;
  owner_user_id?: string | null;
  name: string;
  slug: string;
  description: string | null;
  confirmation_heading?: string | null;
  confirmation_subheading?: string | null;
  primary_color?: string | null;
  booking_type?: "one_on_one" | "group" | "round_robin";
  created_at?: string | null;
  deleted_at?: string | null;
};

function jsonError(
  error: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function jsonUnexpected(error: unknown, context: "read" | "create" | "delete") {
  const message = String((error as any)?.message ?? error);
  return NextResponse.json(
    {
      ok: false,
      error:
        context === "create"
          ? "unexpected_booking_link_create_error"
          : context === "delete"
            ? "unexpected_booking_link_delete_error"
          : "unexpected_booking_link_error",
      message,
    },
    { status: 500 },
  );
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeNumber(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function translateBookingLinks(
  admin: ReturnType<typeof getCrmAdminClient>,
  locale: string,
  rows: BookingLinkRow[],
  teamId?: string | null,
) {
  if (!rows.length) return;

  try {
    await applyEntityTranslations({
      admin,
      teamId,
      entityTable: "booking_links",
      rows,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
        {
          fieldKey: "description",
          sourceText: (row) => row.description ?? "",
          assign: (row, value) => {
            row.description = value || null;
          },
        },
        {
          fieldKey: "confirmation_heading",
          sourceText: (row) => row.confirmation_heading ?? "",
          assign: (row, value) => {
            row.confirmation_heading = value || null;
          },
        },
        {
          fieldKey: "confirmation_subheading",
          sourceText: (row) => row.confirmation_subheading ?? "",
          assign: (row, value) => {
            row.confirmation_subheading = value || null;
          },
        },
      ],
    });
  } catch (error) {
    console.error("[crm-booking-link] translation failed (non-fatal):", error);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = normalizeString(searchParams.get("id"));
    const slug = normalizeString(searchParams.get("slug"));
    const teamId = normalizeString(searchParams.get("teamId"));
    const ownerUserId = normalizeString(searchParams.get("ownerUserId"));
    const locale = await resolveRequestLocale({ request: req });

    const admin = getCrmAdminClient();

    if (slug) {
      const { data, error } = await admin
        .from("booking_links")
        .select(
          "id, team_id, slug, name, description, confirmation_heading, confirmation_subheading, duration_minutes",
        )
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        console.error("[crm-booking-link] query error:", error);
        return jsonError("booking_link_query_failed", 500);
      }

      if (!data) {
        return jsonError("booking_link_not_found", 404);
      }

      const row = data as BookingLinkRow;
      await translateBookingLinks(admin, locale, [row], row.team_id ?? null);

      return NextResponse.json({ ok: true, link: row });
    }

    if (id) {
      if (!teamId || !ownerUserId) {
        return jsonError("missing_team_or_owner", 400);
      }

      const { data, error } = await admin
        .from("booking_links")
        .select(
          "id, team_id, owner_user_id, name, slug, description, confirmation_heading, confirmation_subheading, primary_color, booking_type, created_at, deleted_at",
        )
        .eq("id", id)
        .eq("team_id", teamId)
        .eq("owner_user_id", ownerUserId)
        .maybeSingle();

      if (error) {
        console.error("[crm-booking-link] single query error:", error);
        return jsonError("booking_link_query_failed", 500);
      }

      if (!data) {
        return jsonError("booking_link_not_found", 404);
      }

      const row = data as BookingLinkRow;
      await translateBookingLinks(admin, locale, [row], row.team_id ?? teamId);

      return NextResponse.json({ ok: true, link: row });
    }

    if (!teamId || !ownerUserId) {
      return jsonError("missing_team_or_owner", 400);
    }

    const { data, error } = await admin
      .from("booking_links")
      .select(
        "id, team_id, owner_user_id, name, slug, description, confirmation_heading, confirmation_subheading, primary_color, booking_type, created_at, deleted_at",
      )
      .eq("team_id", teamId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[crm-booking-link] list query error:", error);
      return jsonError("booking_link_query_failed", 500);
    }

    const rows = (Array.isArray(data) ? data : []) as BookingLinkRow[];
    await translateBookingLinks(admin, locale, rows, teamId);

    return NextResponse.json({ ok: true, links: rows });
  } catch (error: unknown) {
    console.error("[crm-booking-link] unexpected:", error);
    return jsonUnexpected(error, "read");
  }
}

export async function POST(req: Request) {
  const admin = getCrmAdminClient();

  try {
    const body = (await req.json().catch(() => null)) as
      | (Record<string, unknown> & { host_user_ids?: string[] })
      | null;

    const locale = await resolveRequestLocale({ request: req });

    const payload = {
      team_id: normalizeString(body?.team_id),
      owner_user_id: normalizeString(body?.owner_user_id),
      name: normalizeString(body?.name),
      slug: normalizeString(body?.slug),
      description: normalizeNullableString(body?.description),
      primary_color: normalizeNullableString(body?.primary_color),
      booking_type: normalizeString(body?.booking_type) || "one_on_one",
      duration_minutes: normalizeNumber(body?.duration_minutes, 30),
      buffer_before_minutes: normalizeNumber(body?.buffer_before_minutes, 0),
      buffer_after_minutes: normalizeNumber(body?.buffer_after_minutes, 0),
      min_notice_hours: normalizeNumber(body?.min_notice_hours, 0),
      max_notice_days: normalizeNumber(body?.max_notice_days, 30),
      timezone_mode: normalizeString(body?.timezone_mode) || "invitee",
      post_booking_behavior:
        normalizeString(body?.post_booking_behavior) || "default",
      post_booking_redirect_url: normalizeNullableString(
        body?.post_booking_redirect_url,
      ),
      confirmation_heading: normalizeNullableString(body?.confirmation_heading),
      confirmation_subheading: normalizeNullableString(
        body?.confirmation_subheading,
      ),
      availability_mode:
        normalizeString(body?.availability_mode) || "business_hours",
      work_start_minute: normalizeNumber(body?.work_start_minute, 0),
      work_end_minute: normalizeNumber(body?.work_end_minute, 0),
      work_days: normalizeStringArray(body?.work_days),
    };

    if (
      !payload.team_id ||
      !payload.owner_user_id ||
      !payload.name ||
      !payload.slug
    ) {
      return jsonError("invalid_payload", 400);
    }

    const hostUserIds = Array.isArray(body?.host_user_ids)
      ? Array.from(
          new Set(
            body.host_user_ids
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
          ),
        )
      : [];

    const { data, error } = await admin
      .from("booking_links")
      .insert(payload as any)
      .select(
        "id, team_id, owner_user_id, name, slug, description, confirmation_heading, confirmation_subheading",
      )
      .single();

    if (error || !data) {
      console.error("[crm-booking-link] create error:", error);
      return jsonError("booking_link_create_failed", 500);
    }

    const bookingLink = data as BookingLinkRow;

    if (hostUserIds.length) {
      const { error: hostError } = await admin
        .from("booking_link_hosts")
        .insert(
          hostUserIds.map((userId) => ({
            booking_link_id: bookingLink.id,
            user_id: userId,
          })),
        );

      if (hostError) {
        console.error("[crm-booking-link] host create error:", hostError);

        const { error: rollbackError } = await admin
          .from("booking_links")
          .delete()
          .eq("id", bookingLink.id);

        if (rollbackError) {
          console.error(
            "[crm-booking-link] rollback failed after host create error:",
            rollbackError,
          );
        }

        return jsonError("booking_link_hosts_create_failed", 500);
      }
    }

    try {
      await syncEntityTranslationSources({
        admin,
        teamId: bookingLink.team_id ?? payload.team_id,
        entityTable: "booking_links",
        rows: [bookingLink],
        fields: [
          { fieldKey: "name", sourceText: (row) => row.name },
          {
            fieldKey: "description",
            sourceText: (row) => row.description ?? "",
          },
          {
            fieldKey: "confirmation_heading",
            sourceText: (row) => row.confirmation_heading ?? "",
          },
          {
            fieldKey: "confirmation_subheading",
            sourceText: (row) => row.confirmation_subheading ?? "",
          },
        ],
        sourceLocale: locale,
      });
    } catch (translationSyncError) {
      console.error(
        "[crm-booking-link] translation source sync failed (non-fatal):",
        translationSyncError,
      );
    }

    return NextResponse.json({ ok: true, link: bookingLink }, { status: 201 });
  } catch (error: unknown) {
    console.error("[crm-booking-link] unexpected create:", error);
    return jsonUnexpected(error, "create");
  }
}

export async function DELETE(req: Request) {
  const admin = getCrmAdminClient();

  try {
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    const id = normalizeString(body?.id);
    const teamId = normalizeString(body?.team_id);
    const ownerUserId = normalizeString(body?.owner_user_id);

    if (!id || !teamId || !ownerUserId) {
      return jsonError("invalid_payload", 400);
    }

    const deletedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("booking_links")
      .update({ deleted_at: deletedAt } as any)
      .eq("id", id)
      .eq("team_id", teamId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-link] delete error:", error);
      return jsonError("booking_link_delete_failed", 500);
    }

    if (!data) {
      const { data: existing, error: existingError } = await admin
        .from("booking_links")
        .select("id, deleted_at")
        .eq("id", id)
        .eq("team_id", teamId)
        .eq("owner_user_id", ownerUserId)
        .maybeSingle();

      if (existingError) {
        console.error(
          "[crm-booking-link] delete existence check failed:",
          existingError,
        );
        return jsonError("booking_link_delete_failed", 500);
      }

      if ((existing as { deleted_at?: string | null } | null)?.deleted_at) {
        return NextResponse.json({ ok: true, alreadyDeleted: true });
      }

      return jsonError("booking_link_not_found", 404);
    }

    try {
      await deleteEntityTranslations({
        admin,
        entityTable: "booking_links",
        entityIds: [id],
      });
    } catch (translationDeleteError) {
      console.error(
        "[crm-booking-link] translation cleanup failed after delete:",
        translationDeleteError,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[crm-booking-link] unexpected delete:", error);
    return jsonUnexpected(error, "delete");
  }
}
