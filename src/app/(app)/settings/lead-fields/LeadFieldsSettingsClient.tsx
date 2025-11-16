"use client";

import { useEffect, useState } from "react";
import {
  getLeadFieldDefinitions,
  saveLeadFieldDefinitions,
} from "@/data/leadFields";
import type { LeadFieldDefinition, CustomFieldType } from "@/types/lead";

const fieldTypes: CustomFieldType[] = ["text", "number", "select", "boolean"];

export function LeadFieldsSettingsClient() {
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user-defined fields on mount (async)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getLeadFieldDefinitions();
        if (!cancelled) {
          setFields(stored ?? []);
        }
      } catch (err) {
        console.error("Failed to load lead fields", err);
        if (!cancelled) setFields([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    // normalize keys (lowercase, underscore) so they're safe to use in DB
    const normalized = fields.map((f) => ({
      ...f,
      key: (f.key || f.label).toLowerCase().trim().replace(/\s+/g, "_"),
    }));

    await saveLeadFieldDefinitions(normalized);
    alert("Saved lead fields.");
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500">
        Loading your lead field configuration…
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Lead Fields</h1>
      <p className="text-sm text-slate-600 mb-4">
        Choose exactly which fields you want to track for your leads. No
        defaults – everything here is yours.
      </p>

      <div className="space-y-4 mb-6">
        {fields.map((field, index) => (
          <div
            key={field.key ?? index}
            className="border rounded-md p-3 bg-white flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <input
                className="border rounded px-2 py-1 text-sm flex-1"
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="Label (e.g. Industry)"
              />
              <select
                className="border rounded px-2 py-1 text-sm"
                value={field.type}
                onChange={(e) =>
                  updateField(index, {
                    type: e.target.value as CustomFieldType,
                  })
                }
              >
                {fieldTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeField(index)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            {field.type === "select" && (
              <input
                className="border rounded px-2 py-1 text-xs"
                value={(field.options ?? []).join(",")}
                onChange={(e) =>
                  updateField(index, {
                    options: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Options (comma separated, e.g. SaaS, E-commerce, Agency)"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={addField}
          className="px-3 py-2 rounded-md bg-slate-200 text-sm"
        >
          + Add field
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
