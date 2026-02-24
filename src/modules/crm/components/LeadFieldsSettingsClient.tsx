"use client";

import { useEffect, useState } from "react";
import {
  getLeadFieldDefinitions,
  saveLeadFieldDefinitions,
} from "@/modules/crm/data/leadFields";
import type {
  LeadFieldDefinition,
  CustomFieldType,
} from "@/modules/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "boolean", label: "Checkbox" },
  { value: "link", label: "Link (URL)" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

type SystemField = {
  label: string;
  required: boolean;
  note?: string;
};

const REQUIRED_SYSTEM_FIELDS: SystemField[] = [
  { label: "Lead Name", required: true, note: "Required on every lead." },
  {
    label: "Niche / Industry",
    required: true,
    note: "Helps you segment and route leads.",
  },
  {
    label: "Lead Type",
    required: true,
    note: "Choose whether this lead is an Individual or a Business.",
  },
  {
    label: "Gender",
    required: true,
    note: "Only required when Lead Type is Individual.",
  },
  {
    label: "Country",
    required: true,
    note: "Supports territory assignment, reporting, and location-based filtering.",
  },
  {
    label: "State / Region",
    required: true,
    note: "Improves routing accuracy and makes filtering more precise.",
  },
  {
    label: "City",
    required: true,
    note: "Useful for local targeting, territory views, and cleaner lists.",
  },
  {
    label: "ZIP / Postal Code",
    required: false,
    note: "Optional—helpful for service areas and hyper-local targeting.",
  },
  {
    label: "Primary Contact Type",
    required: true,
    note: "How you’ll reach them (email, phone, or a social profile).",
  },
  {
    label: "Primary Contact Value",
    required: true,
    note: "The actual email, phone number, or profile link.",
  },
  {
    label: "Source Category",
    required: true,
    note: "How the lead came in (Inbound, Outbound, Referral, Partner, Purchased).",
  },
  {
    label: "Source Name",
    required: true,
    note: "Where it came from (Instagram, Facebook, Reddit, Twitter/X, etc.).",
  },
];

/**
 * IMPORTANT:
 * These are system/core keys that must NEVER appear in lead_fields.custom key space
 */
const RESERVED_SYSTEM_KEYS = new Set<string>([
  "id",
  "team_id",
  "stage",
  "custom_values",
  "created_at",
  "updated_at",
  "prospector_id",
  "setter_id",
  "closer_id",
  "score",
  "score_updated_at",
  "notes",
  "niche",
  "lead_type",
  "gender",
  "country",
  "region",
  "city",
  "postal_code",
  "primary_contact_type",
  "primary_contact_value",
  "source_category",
  "source_name",
  "__score",
  "__stage",
  "__lead_name",
  "__location",
]);

function normalizeKeyCandidate(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function nextFieldKey(existing: LeadFieldDefinition[]) {
  let max = 0;
  for (const f of existing) {
    const m = /^field_(\d+)$/.exec(String(f.key ?? ""));
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return `field_${max + 1}`;
}

function makeTempId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (uuid) return `tmp_${uuid}`;
  } catch {
    // ignore
  }
  return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function parseCsvOptions(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LeadFieldsSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const markDirty = () => {
    setSaveState("idle");
    setErrorMessage(null);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) return;

      if (!teamId) {
        setLoading(false);
        return;
      }

      try {
        const stored = await getLeadFieldDefinitions(teamId);

        const safe = (stored ?? []).filter((f) => {
          const k = normalizeKeyCandidate(f.key);
          return k && !RESERVED_SYSTEM_KEYS.has(k);
        });

        if (!cancelled) setFields(safe as LeadFieldDefinition[]);
      } catch (err) {
        console.error("[LeadFields] load failed", err);
        if (!cancelled) {
          setFields([]);
          setErrorMessage(
            "We couldn’t load your field configuration. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading]);

  function addField() {
    if (!teamId) return;

    setFields((prev) => [
      ...prev,
      {
        id: makeTempId(),
        team_id: teamId,
        key: nextFieldKey(prev),
        label: "New field",
        type: "text",
      } as LeadFieldDefinition,
    ]);

    markDirty();
  }

  function updateField(index: number, patch: Partial<LeadFieldDefinition>) {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
    markDirty();
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  async function handleSave() {
    if (!teamId) {
      setErrorMessage(
        "Missing team. This page must be opened from within your workspace.",
      );
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      const normalized = fields
        .map((f) => {
          const key = normalizeKeyCandidate(f.key);
          return {
            ...f,
            team_id: f.team_id ?? teamId,
            key,
            label: String(f.label ?? "").trim() || "Untitled",
            options:
              f.type === "select"
                ? Array.isArray((f as any).options)
                  ? (f as any).options
                  : []
                : undefined,
          };
        })
        .filter((f) => Boolean(f.key));

      const seen = new Set<string>();
      for (const f of normalized) {
        const k = String(f.key);

        if (RESERVED_SYSTEM_KEYS.has(k)) {
          throw new Error(
            `Field key "${k}" conflicts with a system field. Please regenerate it.`,
          );
        }
        if (seen.has(k)) {
          throw new Error(`Duplicate field key "${k}". Keys must be unique.`);
        }
        seen.add(k);
      }

      await saveLeadFieldDefinitions(
        teamId,
        normalized as LeadFieldDefinition[],
      );
      setFields(normalized as LeadFieldDefinition[]);
      setSaveState("saved");
    } catch (err: any) {
      console.error("[LeadFields] save failed", err);
      setSaveState("error");
      setErrorMessage(
        err?.message || "Saving your fields failed. Please try again.",
      );
    }
  }

  if (!teamId && !workspaceLoading) {
    return (
      <div className="max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from within
          your workspace or contact support.
        </p>
      </div>
    );
  }

  if (workspaceLoading || loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
          <div className="h-6 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="mt-3 h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
                <div className="mt-2 h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
          Lead Fields
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Core fields are required for every lead. Add extra fields below if you
          want your team to capture more context.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Required system fields
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              These core fields keep your leads consistent and make filtering
              reliable across your workspace.
            </p>
          </div>
          <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
            Locked
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REQUIRED_SYSTEM_FIELDS.map((f) => (
            <div
              key={f.label}
              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">
                  {f.label}
                </div>
                <span
                  className={`text-[10px] rounded-full px-2 py-0.5 ${
                    f.required
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {f.required ? "Required" : "Optional"}
                </span>
              </div>
              {f.note && (
                <div className="mt-1 text-[11px] text-slate-500">{f.note}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(errorMessage || saveState === "saved") && (
        <div className="space-y-2">
          {errorMessage && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}
          {saveState === "saved" && !errorMessage && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              ✅ Changes saved
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Custom fields
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Add optional fields your team wants to track.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {fields.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              <p className="font-medium text-slate-700">
                No custom fields yet.
              </p>
              <p className="mt-1">
                Add fields like{" "}
                <span className="font-semibold">
                  Budget, Timeline, Deal size
                </span>
                , etc.
              </p>
            </div>
          )}

          {fields.map((field, index) => {
            const options = Array.isArray((field as any).options)
              ? ((field as any).options as string[])
              : [];
            const optionsCsv = options.join(", ");

            return (
              <div
                key={field.id ?? `${field.key}_${index}`}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={field.label ?? ""}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    placeholder="Label (e.g. Budget)"
                  />

                  <select
                    className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, {
                        type: e.target.value as CustomFieldType,
                        options: [],
                      } as any)
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="text-[11px] text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>

                {field.type === "select" && (
                  <div className="mt-1 space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Dropdown options
                    </label>

                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={optionsCsv}
                      onChange={(e) =>
                        updateField(index, {
                          options: parseCsvOptions(e.target.value),
                        } as Partial<LeadFieldDefinition>)
                      }
                      placeholder="e.g. Small, Medium, Enterprise"
                    />

                    {options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {options.map((opt) => (
                          <span
                            key={opt}
                            className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          + Add Field
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {saveState === "saving" ? "Saving…" : "Save Changes"}
        </button>

        {saveState === "idle" && (
          <span className="text-xs text-slate-400">
            Don’t forget to save your changes.
          </span>
        )}
      </div>
    </div>
  );
}
