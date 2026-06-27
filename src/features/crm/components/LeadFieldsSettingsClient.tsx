"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getLeadFieldDefinitions,
  saveLeadFieldDefinitions,
} from "@/features/crm/data/leadFields";
import type {
  LeadFieldDefinition,
  CustomFieldType,
} from "@/features/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useTranslations } from "next-intl";

type SaveState = "idle" | "saving" | "saved" | "error";

type SystemField = {
  label: string;
  required: boolean;
  note?: string;
};

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
    const uuid = globalThis.crypto?.randomUUID?.();
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

function SkeletonBlock({
  className = "",
  isDark,
}: {
  className?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={[
        "animate-pulse rounded-lg",
        isDark ? "bg-slate-800/70" : "bg-slate-100",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

function LoadingSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const soft = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <SkeletonBlock isDark={isDark} className="h-6 w-40" />
        <SkeletonBlock isDark={isDark} className="mt-3 h-4 w-3/4" />
      </div>

      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`rounded-xl border px-3 py-3 ${soft}`}>
              <SkeletonBlock isDark={isDark} className="h-4 w-32" />
              <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeadFieldsSettingsClient() {
  const t = useTranslations("LeadFieldsSettingsPage");
  const common = useTranslations("Common");

  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const FIELD_TYPES: { value: CustomFieldType; label: string }[] = useMemo(
    () => [
      { value: "text", label: t("fieldTypes.text") },
      { value: "number", label: t("fieldTypes.number") },
      { value: "select", label: t("fieldTypes.select") },
      { value: "boolean", label: t("fieldTypes.boolean") },
      { value: "link", label: t("fieldTypes.link") },
    ],
    [t],
  );

  const REQUIRED_SYSTEM_FIELDS: SystemField[] = useMemo(
    () => [
      {
        label: t("systemFields.leadName.label"),
        required: true,
        note: t("systemFields.leadName.note"),
      },
      {
        label: t("systemFields.nicheIndustry.label"),
        required: true,
        note: t("systemFields.nicheIndustry.note"),
      },
      {
        label: t("systemFields.leadType.label"),
        required: true,
        note: t("systemFields.leadType.note"),
      },
      {
        label: t("systemFields.gender.label"),
        required: true,
        note: t("systemFields.gender.note"),
      },
      {
        label: t("systemFields.country.label"),
        required: true,
        note: t("systemFields.country.note"),
      },
      {
        label: t("systemFields.region.label"),
        required: true,
        note: t("systemFields.region.note"),
      },
      {
        label: t("systemFields.city.label"),
        required: true,
        note: t("systemFields.city.note"),
      },
      {
        label: t("systemFields.postalCode.label"),
        required: false,
        note: t("systemFields.postalCode.note"),
      },
      {
        label: t("systemFields.primaryContactType.label"),
        required: true,
        note: t("systemFields.primaryContactType.note"),
      },
      {
        label: t("systemFields.primaryContactValue.label"),
        required: true,
        note: t("systemFields.primaryContactValue.note"),
      },
      {
        label: t("systemFields.sourceCategory.label"),
        required: true,
        note: t("systemFields.sourceCategory.note"),
      },
      {
        label: t("systemFields.sourceName.label"),
        required: true,
        note: t("systemFields.sourceName.note"),
      },
    ],
    [t],
  );

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const soft = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";

  const pageTitle = isDark ? "text-slate-100" : "text-slate-900";
  const pageSub = isDark ? "text-slate-400" : "text-slate-600";

  const labelText = isDark ? "text-slate-200" : "text-slate-900";
  const helperText = isDark ? "text-slate-400" : "text-slate-500";

  const input =
    "rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  const inputTheme = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  const selectTheme = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100"
    : "border-slate-200 bg-white text-slate-800";

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
          setErrorMessage(t("errors.loadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading, t]);

  function addField() {
    if (!teamId) return;

    setFields((prev) => [
      ...prev,
      {
        id: makeTempId(),
        team_id: teamId,
        key: nextFieldKey(prev),
        label: t("customFields.newFieldLabel"),
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
      setErrorMessage(t("errors.missingTeam"));
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
            label: String(f.label ?? "").trim() || t("customFields.untitled"),
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
          throw new Error(t("errors.reservedKey", { key: k }));
        }
        if (seen.has(k)) {
          throw new Error(t("errors.duplicateKey", { key: k }));
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
      setErrorMessage(err?.message || t("errors.saveFailed"));
    }
  }

  if (!teamId && !workspaceLoading) {
    return (
      <div
        className={[
          "max-w-xl rounded-2xl border px-4 py-3 text-sm shadow-sm",
          isDark
            ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
            : "border-rose-100 bg-rose-50 text-rose-700",
        ].join(" ")}
      >
        <p className="font-medium">{t("empty.noTeam.title")}</p>
        <p className="mt-1">{t("empty.noTeam.description")}</p>
      </div>
    );
  }

  if (workspaceLoading || loading) {
    return <LoadingSkeleton isDark={isDark} />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold md:text-2xl ${pageTitle}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${pageSub}`}>{t("page.description")}</p>
      </div>

      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-sm font-semibold ${labelText}`}>
              {t("systemSection.title")}
            </h2>
            <p className={`mt-1 text-sm ${pageSub}`}>
              {t("systemSection.description")}
            </p>
          </div>
          <span
            className={[
              "rounded-full px-2 py-1 text-[11px]",
              isDark
                ? "bg-slate-900 text-slate-300"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {t("systemSection.locked")}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REQUIRED_SYSTEM_FIELDS.map((f) => (
            <div
              key={f.label}
              className={`rounded-xl border px-3 py-2 ${soft}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className={`text-sm font-medium ${labelText}`}>
                  {f.label}
                </div>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px]",
                    f.required
                      ? isDark
                        ? "border border-indigo-500/20 bg-indigo-500/10 text-indigo-200"
                        : "border border-indigo-100 bg-indigo-50 text-indigo-700"
                      : isDark
                        ? "bg-slate-900 text-slate-300"
                        : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {f.required ? t("badges.required") : t("badges.optional")}
                </span>
              </div>
              {f.note && (
                <div className={`mt-1 text-[11px] ${helperText}`}>{f.note}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(errorMessage || saveState === "saved") && (
        <div className="space-y-2">
          {errorMessage && (
            <div
              className={[
                "rounded-xl border px-4 py-2 text-xs shadow-sm",
                isDark
                  ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                  : "border-rose-100 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {errorMessage}
            </div>
          )}
          {saveState === "saved" && !errorMessage && (
            <div
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                isDark
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700",
              ].join(" ")}
            >
              ✅ {t("states.saved")}
            </div>
          )}
        </div>
      )}

      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div>
          <h2 className={`text-sm font-semibold ${labelText}`}>
            {t("customFields.title")}
          </h2>
          <p className={`mt-1 text-sm ${pageSub}`}>
            {t("customFields.description")}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {fields.length === 0 && (
            <div
              className={[
                "rounded-2xl border border-dashed px-4 py-6 text-sm",
                isDark
                  ? "border-slate-800 bg-slate-950 text-slate-400"
                  : "border-slate-200 bg-slate-50 text-slate-500",
              ].join(" ")}
            >
              <p
                className={`font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}
              >
                {t("customFields.empty.title")}
              </p>
              <p className="mt-1">{t("customFields.empty.description")}</p>
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
                className={`rounded-2xl border px-4 py-3 shadow-sm ${card}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={`flex-1 ${input} ${inputTheme}`}
                    value={field.label ?? ""}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    placeholder={t("placeholders.fieldLabel")}
                  />

                  <select
                    className={[
                      "w-full sm:w-44 cursor-pointer",
                      input,
                      selectTheme,
                    ].join(" ")}
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, {
                        type: e.target.value as CustomFieldType,
                        options: [],
                      } as any)
                    }
                  >
                    {FIELD_TYPES.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>
                        {typeOption.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className={[
                      "text-left text-[11px] font-semibold transition",
                      isDark
                        ? "text-slate-400 hover:text-rose-300"
                        : "text-slate-400 hover:text-rose-600",
                    ].join(" ")}
                  >
                    {t("actions.remove")}
                  </button>
                </div>

                {field.type === "select" && (
                  <div className="mt-3 space-y-2">
                    <label
                      className={[
                        "block text-xs font-medium uppercase tracking-wide",
                        isDark ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}
                    >
                      {t("customFields.dropdownOptions")}
                    </label>

                    <input
                      type="text"
                      className={`w-full ${input} ${inputTheme}`}
                      value={optionsCsv}
                      onChange={(e) =>
                        updateField(index, {
                          options: parseCsvOptions(e.target.value),
                        } as Partial<LeadFieldDefinition>)
                      }
                      placeholder={t("placeholders.dropdownOptions")}
                    />

                    {options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {options.map((opt) => (
                          <span
                            key={opt}
                            className={[
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                              isDark
                                ? "bg-indigo-500/10 text-indigo-200"
                                : "bg-indigo-50 text-indigo-700",
                            ].join(" ")}
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
          className={[
            "inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition",
            isDark
              ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/30"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
          ].join(" ")}
        >
          {t("actions.addField")}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveState === "saving"
            ? common("actions.saving")
            : t("actions.saveChanges")}
        </button>

        {saveState === "idle" && (
          <span
            className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
          >
            {t("states.rememberToSave")}
          </span>
        )}
      </div>
    </div>
  );
}
