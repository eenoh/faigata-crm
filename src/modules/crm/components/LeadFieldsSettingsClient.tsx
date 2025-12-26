"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getLeadFieldDefinitions,
  saveLeadFieldDefinitions,
} from "@/modules/crm/data/leadFields";
import type {
  LeadFieldDefinition,
  CustomFieldType,
} from "@/modules/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";

const fieldTypes: CustomFieldType[] = ["text", "number", "select", "boolean", "link"];

type SaveState = "idle" | "saving" | "saved" | "error";

type SystemField = {
  label: string;
  required: boolean;
  note?: string;
};

/**
 * IMPORTANT:
 * These are system/core keys that must NEVER appear in lead_fields.custom key space
 * because they are real columns on `leads` and used as table column keys in UI.
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

  // core fields / columns in your Leads table:
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

  // also block these to avoid common collisions:
  "__score",
  "__stage",
  "__lead_name",
  "__location",
]);

function normalizeKeyCandidate(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function nextFieldKey(existing: LeadFieldDefinition[]) {
  // pick the next integer after the max `field_N`
  let max = 0;
  for (const f of existing) {
    const k = String(f.key ?? "");
    const m = /^field_(\d+)$/.exec(k);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  }
  return `field_${max + 1}`;
}

export function LeadFieldsSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectInputs, setSelectInputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---- Locked system fields ----
  const REQUIRED_SYSTEM_FIELDS: SystemField[] = useMemo(
    () => [
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
    ],
    []
  );

  // Load user-defined fields on mount (async)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) return;

      if (!teamId) {
        console.warn("No teamId from workspace context, cannot load lead fields");
        setLoading(false);
        return;
      }

      try {
        const stored = await getLeadFieldDefinitions(teamId);

        // Safety: filter out any stored fields that collide with system keys
        const safe = (stored ?? []).filter((f) => {
          const k = normalizeKeyCandidate(String(f.key ?? ""));
          return k && !RESERVED_SYSTEM_KEYS.has(k);
        });

        if (!cancelled) setFields(safe);
      } catch (err) {
        console.error("Failed to load lead fields", err);
        if (!cancelled) setFields([]);
        if (!cancelled)
          setErrorMessage("We couldn’t load your field configuration. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading]);

  function addField() {
    setFields((prev) => {
      const key = nextFieldKey(prev);
      return [
        ...prev,
        {
          key,
          label: "New field",
          type: "text",
        },
      ];
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  function updateField(index: number, patch: Partial<LeadFieldDefinition>) {
    setFields((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (!teamId) {
      setErrorMessage("Missing team. This page must be opened from within your workspace.");
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      // ✅ normalize keys (but DO NOT derive them from labels)
      const normalized: LeadFieldDefinition[] = fields
        .map((f) => {
          const keyRaw = String(f.key ?? "").trim();
          const key = normalizeKeyCandidate(keyRaw);

          return {
            ...f,
            key,
            label: String(f.label ?? "").trim() || "Untitled",
          };
        })
        .filter((f) => Boolean(f.key));

      // ✅ validate collisions
      const seen = new Set<string>();
      const deduped: LeadFieldDefinition[] = [];

      for (const f of normalized) {
        const k = String(f.key);

        if (!k) continue;

        if (RESERVED_SYSTEM_KEYS.has(k)) {
          // hard fail so you don't accidentally save a broken config
          throw new Error(`Field key "${k}" conflicts with a system field. Please regenerate it.`);
        }

        if (seen.has(k)) {
          throw new Error(`Duplicate field key "${k}". Keys must be unique.`);
        }

        seen.add(k);
        deduped.push(f);
      }

      await saveLeadFieldDefinitions(teamId, deduped);
      setFields(deduped);
      setSaveState("saved");
    } catch (err: any) {
      console.error("Error while saving lead fields", err);
      setSaveState("error");
      setErrorMessage(err?.message || "Saving your fields failed. Please try again.");
    }
  }

  /* ---------- States for loading / missing team ---------- */

  if (!teamId && !workspaceLoading) {
    return (
      <div className="max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from within your workspace or
          contact support.
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
          <div className="flex items-center justify-between">
            <div className="h-4 w-48 rounded bg-slate-100 animate-pulse" />
            <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="mt-2 h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Main UI ---------- */

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Lead Fields</h1>
          <p className="mt-1 text-sm text-slate-600">
            Core fields are required for every lead. Add extra fields below if you want your team to
            capture more context—like budget, timeline, deal size, or anything specific to your
            workflow.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Keys are now generated as <span className="font-semibold">field_1, field_2, …</span> and
            never change (labels can change anytime).
          </p>
        </div>
      </div>

      {/* Required system fields */}
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Required system fields</h2>
            <p className="mt-1 text-sm text-slate-600">
              These core fields keep your leads consistent and make filtering reliable across your
              workspace. They’re always available and can’t be turned off.
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
                <div className="text-sm font-medium text-slate-900">{f.label}</div>
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

              {f.note && <div className="mt-1 text-[11px] text-slate-500">{f.note}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Errors / status */}
      {(errorMessage || saveState === "saved") && (
        <div className="space-y-2">
          {errorMessage && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}
          {saveState === "saved" && !errorMessage && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              <span>✅ Changes saved</span>
            </div>
          )}
        </div>
      )}

      {/* Custom fields */}
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Custom fields</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add optional fields your team wants to track.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {fields.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              <p className="font-medium text-slate-700">No custom fields yet.</p>
              <p className="mt-1">
                Add fields like{" "}
                <span className="font-semibold">Budget, Timeline, Lead Score</span>, etc.
              </p>
            </div>
          )}

          {fields.map((field, index) => (
            <div
              key={field.key ?? index}
              className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm flex flex-col gap-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Label (e.g. Budget)"
                    />

                    <select
                      className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={field.type}
                      onChange={(e) =>
                        updateField(index, { type: e.target.value as CustomFieldType })
                      }
                    >
                      {fieldTypes.map((t) => (
                        <option key={t} value={t}>
                          {t === "text"
                            ? "Text"
                            : t === "number"
                            ? "Number"
                            : t === "select"
                            ? "Dropdown"
                            : t === "boolean"
                            ? "Checkbox"
                            : "Link (URL)"}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </div>

                  {/* show key read-only */}
                  <div className="text-[11px] text-slate-500">
                    Key: <span className="font-mono text-slate-700">{field.key}</span>
                  </div>
                </div>
              </div>

              {field.type === "select" && (
                <div className="mt-1 space-y-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Dropdown options
                  </label>

                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={
                      selectInputs[field.key ?? String(index)] ??
                      (field.options ?? []).join(", ")
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const fieldKey = field.key ?? String(index);

                      setSelectInputs((prev) => ({ ...prev, [fieldKey]: raw }));

                      const parsed = raw
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);

                      updateField(index, { options: parsed });
                    }}
                    placeholder="e.g. Small, Medium, Enterprise"
                  />

                  {field.options && field.options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {field.options.map((opt) => (
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
          ))}
        </div>
      </div>

      {/* Actions */}
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
          <span className="text-xs text-slate-400">Don’t forget to save your changes.</span>
        )}
      </div>
    </div>
  );
}
