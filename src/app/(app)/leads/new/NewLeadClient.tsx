"use client";

import { useEffect, useState } from "react";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import type { LeadFieldDefinition } from "@/types/lead";

export function NewLeadClient() {
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [stage] = useState("new");
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const defs = await getLeadFieldDefinitions();
      if (!cancelled) setFields(defs);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCustomChange(key: string, value: any) {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        company,
        stage,
        customValues,
        campaignId: 1, // later dynamic
      }),
    });

    window.location.href = "/leads";
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Add lead</h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            className="border rounded px-2 py-1 w-full text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Company</label>
          <input
            className="border rounded px-2 py-1 w-full text-sm"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        {fields.length > 0 && (
          <div className="border-t pt-4 mt-2">
            <h2 className="text-sm font-semibold mb-2">Custom fields</h2>
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm mb-1">{field.label}</label>

                  {field.type === "text" && (
                    <input
                      className="border rounded px-2 py-1 w-full text-sm"
                      onChange={(e) =>
                        handleCustomChange(field.key, e.target.value)
                      }
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-full text-sm"
                      onChange={(e) =>
                        handleCustomChange(field.key, Number(e.target.value))
                      }
                    />
                  )}

                  {field.type === "boolean" && (
                    <input
                      type="checkbox"
                      onChange={(e) =>
                        handleCustomChange(field.key, e.target.checked)
                      }
                    />
                  )}

                  {field.type === "select" && (
                    <select
                      className="border rounded px-2 py-1 w-full text-sm"
                      onChange={(e) =>
                        handleCustomChange(field.key, e.target.value)
                      }
                    >
                      <option value="">Select...</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm"
        >
          Create lead
        </button>
      </form>
    </div>
  );
}
