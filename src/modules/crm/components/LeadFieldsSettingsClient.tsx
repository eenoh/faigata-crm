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
import { useWorkspace } from "@/context/WorkspaceContext"; // 👈 NEW

const fieldTypes: CustomFieldType[] = ["text", "number", "select", "boolean", "link"];

type SaveState = "idle" | "saving" | "saved" | "error";

export function LeadFieldsSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace(); // 👈
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectInputs, setSelectInputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load user-defined fields on mount (async)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // wait until workspace context has finished loading
      if (workspaceLoading) return;

      if (!teamId) {
        console.warn(
          "No teamId from workspace context, cannot load lead fields"
        );
        setLoading(false);
        return;
      }

      try {
        const stored = await getLeadFieldDefinitions(teamId);
        if (!cancelled) {
          setFields(stored ?? []);
        }
      } catch (err) {
        console.error("Failed to load lead fields", err);
        if (!cancelled) setFields([]);
        if (!cancelled)
          setErrorMessage(
            "We couldn’t load your field configuration. Please try again."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading]);

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        key: `field_${prev.length + 1}`,
        label: "New field",
        type: "text",
      },
    ]);
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
      setErrorMessage(
        "Missing team. This page must be opened from within your workspace."
      );
      return;
    }

    if (fields.length === 0) {
      setErrorMessage("Add at least one field before saving.");
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      // normalize keys (lowercase, underscore) so they're safe to use in DB
      const normalized: LeadFieldDefinition[] = fields.map((f) => ({
        ...f,
        key: (f.key || f.label)
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, ""),
      }));

      await saveLeadFieldDefinitions(teamId, normalized);
      setFields(normalized);
      setSaveState("saved");
    } catch (err) {
      console.error("Error while saving lead fields", err);
      setSaveState("error");
      setErrorMessage(
        "Saving your fields failed. Please check your connection and try again."
      );
    }
  }

  /* ---------- States for loading / missing team ---------- */

  if (!teamId) {
    return (
      <div className="max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from your
          workspace or contact support.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-xl rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        Loading your lead field configuration…
      </div>
    );
  }

  /* ---------- Main UI ---------- */

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Lead Fields
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define exactly which data points your team tracks on every lead.
            These fields drive your lead forms and list views.
          </p>
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

      {/* Fields list */}
      <div className="space-y-3">
        {fields.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            <p className="font-medium text-slate-700">
              No lead fields yet for this team.
            </p>
            <p className="mt-1">
              Add fields like{" "}
              <span className="font-semibold">Industry, Region, Source</span>,
              or anything else that matters to your workflow.
            </p>
          </div>
        )}

        {fields.map((field, index) => (
          <div
            key={field.key ?? index}
            className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm flex flex-col gap-2"
          >
            <div className="flex items-start gap-2">
              {/* Left: label + type */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={field.label}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    placeholder="Label (e.g. Industry)"
                  />
                  <select
                    className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, {
                        type: e.target.value as CustomFieldType,
                      })
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
                </div>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeField(index)}
                className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline mt-1"
              >
                Remove
              </button>
            </div>

            {/* Options for select type */}
            {field.type === "select" && (
              <div className="mt-1 space-y-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dropdown options
                </label>

                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  // use local input state so the user can freely type commas & spaces
                  value={
                    selectInputs[field.key ?? String(index)] ??
                    (field.options ?? []).join(", ")
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const fieldKey = field.key ?? String(index);

                    // update the visible input text
                    setSelectInputs((prev) => ({
                      ...prev,
                      [fieldKey]: raw,
                    }));

                    // parse into options for chips & saving
                    const parsed = raw
                      .split(",") // split by commas
                      .map((s) => s.trim()) // allow spaces around
                      .filter(Boolean); // drop empty items

                    updateField(index, { options: parsed });
                  }}
                  placeholder="e.g. SaaS, Agency, Enterprise"
                />

                {/* Preview chips – updates live as you type */}
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

                <p className="text-[11px] text-slate-400">
                  Tip: Type your options separated by commas, e.g.{" "}
                  <span className="font-semibold">SaaS, Agency, Enterprise</span>.
                </p>
              </div>
            )}
          </div>
        ))}
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

        {saveState === "idle" && fields.length > 0 && (
          <span className="text-xs text-slate-400">
            Don’t forget to save your changes.
          </span>
        )}
      </div>
    </div>
  );
}
