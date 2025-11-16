"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import type { LeadFieldDefinition } from "@/types/lead";

interface LeadRow {
  id: number | string;
  name: string;
  company?: string | null;
  stage: string;
  customValues?: Record<string, any> | null;
}

export function LeadsClient() {
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [fieldDefs, leadsRes] = await Promise.all([
          getLeadFieldDefinitions(), // → fetches from /api/lead-fields (DB)
          fetch("/api/leads").then((r) => r.json() as Promise<LeadRow[]>),
        ]);

        if (cancelled) return;

        setFields(fieldDefs);
        setLeads(leadsRes);
      } catch (err) {
        console.error("Failed to load leads", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseColumns = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "stage", label: "Stage" },
  ] as const;

  const allColumns = [
    ...baseColumns.map((c) => ({ ...c, isCustom: false })),
    ...fields.map((f) => ({ key: f.key, label: f.label, isCustom: true })),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <Link
          href="/leads/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          + Add lead
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading leads…</p>
      ) : leads.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          <p>No leads yet.</p>
          <p className="mt-1">
            Click <span className="font-semibold">+ Add lead</span> to create
            your first one.
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-md bg-white text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              {allColumns.map((col) => (
                <th key={col.key} className="border-b p-2 font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50">
                {allColumns.map((col) => {
                  let value: unknown = "";

                  if (col.isCustom) {
                    value = lead.customValues?.[col.key] ?? "";
                  } else {
                    switch (col.key) {
                      case "name":
                        value = lead.name;
                        break;
                      case "company":
                        value = lead.company ?? "";
                        break;
                      case "stage":
                        value = lead.stage;
                        break;
                      default:
                        value = "";
                    }
                  }

                  return (
                    <td key={col.key} className="border-b p-2 align-top">
                      {value !== null && value !== undefined
                        ? String(value)
                        : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
