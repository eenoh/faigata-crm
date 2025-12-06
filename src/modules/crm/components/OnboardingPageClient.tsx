// src/app/onboarding/OnboardingPageClient.tsx
"use client";

import { useState, type DragEvent, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

const ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type Role = (typeof ROLES)[number];

interface InviteRow {
  email: string;
  role: Role;
}

interface CustomFieldRow {
  label: string;
  key: string;
  type: "text" | "number" | "select" | "boolean" | "url";
  options?: string;
}


interface ConversionMetricRow {
  label: string;
  fromStage: string;
  toStage: string;
}

export function OnboardingPageClient() {
  const steps = [
    "Team setup",
    "Invite teammates",
    "Customize lead data",
    "Import existing leads",
    "Customize pipeline",
    "Conversion metrics",
    "Finish",
  ] as const;

  const [stepIndex, setStepIndex] = useState(0);

  // Step 1: team
  const [companyName, setCompanyName] = useState("");
  const [teamName, setTeamName] = useState("Sales Team");
  const [timezone, setTimezone] = useState("Europe/Berlin");

  // Step 2: invites
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "Setter" },
  ]);

  // Step 3: custom fields
  const [fields, setFields] = useState<CustomFieldRow[]>([
    { label: "Industry", key: "industry", type: "text" },
    {
      label: "Region",
      key: "region",
      type: "select",
      options: "DACH, US, UK, EU, Other",
    },
  ]);

  // Step 4: import file preview
  const [importFileName, setImportFileName] = useState<string | null>(null);

  // Step 5: pipeline
  const [pipelineStages, setPipelineStages] = useState<string[]>([
    "New",
    "Contacted",
    "Replied",
    "Qualified",
    "Booked call",
    "Showed up",
    "Offer",
    "Closed",
  ]);

  // Step 6: conversion metrics
  const [conversionMetrics, setConversionMetrics] = useState<
    ConversionMetricRow[]
  >([]);

  const isLastStep = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function next() {
    if (!isLastStep) setStepIndex((i) => i + 1);
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  async function handleFinish() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        alert("You need to be logged in to finish onboarding.");
        return;
      }

      const meta = (data.user.user_metadata ?? {}) as any;
      const firstName = meta.first_name ?? "";
      const lastName = meta.last_name ?? "";

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          firstName,
          lastName,
          companyName,
          teamName,
          timezone,
          invites,
          fields,
          pipelineStages,
          conversionMetrics,
          importFileName,
        }),
      });

      const payload = await res.json().catch(() => null);
      console.log("Onboarding response", res.status, payload);

      if (!res.ok || !payload?.ok) {
        console.error("Failed to save onboarding", payload);
        alert("Saving your setup failed. Please try again.");
        return;
      }

      const orgId = payload.organizationId as string | undefined;
      const teamId = payload.teamId as string | undefined;

      if (orgId && teamId) {
        window.location.href = `/dashboard?org=${orgId}&team=${teamId}`;
      } else if (orgId) {
        window.location.href = `/dashboard?org=${orgId}`;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error("Failed to save onboarding", err);
      alert("Something went wrong. Please try again.");
    }
  }




  // Helpers
  function updateInvite(index: number, patch: Partial<InviteRow>) {
    setInvites((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function updateField(index: number, patch: Partial<CustomFieldRow>) {
    setFields((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function updateStage(index: number, value: string) {
    setPipelineStages((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-4xl bg-white border border-slate-100 rounded-3xl shadow-xl p-8 md:p-10 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Welcome to FaigataCRM
            </h1>
            <p className="text-sm text-slate-500">
              Step {stepIndex + 1} of {steps.length} · {steps[stepIndex]}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold">
              ✨
            </span>
            <span>We’ll get you fully set up in a minute.</span>
          </div>
        </header>

        {/* Progress bar */}
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step content */}
        <section className="mt-2">
          {stepIndex === 0 && (
            <StepTeamSetup
              companyName={companyName}
              setCompanyName={setCompanyName}
              teamName={teamName}
              setTeamName={setTeamName}
              timezone={timezone}
              setTimezone={setTimezone}
            />
          )}

          {stepIndex === 1 && (
            <StepInvites
              invites={invites}
              setInvites={setInvites}
              updateInvite={updateInvite}
            />
          )}

          {stepIndex === 2 && (
            <StepCustomFields
              fields={fields}
              updateField={updateField}
              setFields={setFields}
            />
          )}

          {stepIndex === 3 && (
            <StepImportLeads
              importFileName={importFileName}
              setImportFileName={setImportFileName}
            />
          )}

          {stepIndex === 4 && (
            <StepPipeline
              stages={pipelineStages}
              updateStage={updateStage}
              setStages={setPipelineStages}
            />
          )}

          {stepIndex === 5 && (
            <StepConversionMetrics
              stages={pipelineStages}
              metrics={conversionMetrics}
              setMetrics={setConversionMetrics}
            />
          )}

          {stepIndex === 6 && (
            <StepFinish
              companyName={companyName}
              teamName={teamName}
              invites={invites}
              fields={fields}
              stages={pipelineStages}
              metrics={conversionMetrics}
            />
          )}
        </section>

        {/* Navigation buttons */}
        <footer className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={back}
            disabled={stepIndex === 0}
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
          >
            ← Back
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={next}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
            >
              Go to dashboard 🎉
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}

/* ---------- Step components (same UI as before) ---------- */

function StepTeamSetup(props: {
  companyName: string;
  setCompanyName: (v: string) => void;
  teamName: string;
  setTeamName: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Company name
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={props.companyName}
            onChange={(e) => props.setCompanyName(e.target.value)}
            placeholder="e.g. Faigata GmbH"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Your first team
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={props.teamName}
            onChange={(e) => props.setTeamName(e.target.value)}
            placeholder="e.g. Outbound Sales"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Timezone
          </label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={props.timezone}
            onChange={(e) => props.setTimezone(e.target.value)}
          >
            <option>Europe/Berlin</option>
            <option>Europe/London</option>
            <option>America/New_York</option>
            <option>America/Los_Angeles</option>
          </select>
        </div>
      </div>

      <div className="bg-indigo-50 rounded-2xl p-4 text-sm text-slate-700 flex flex-col gap-2">
        <span className="text-lg">💡</span>
        <p>
          Your <span className="font-medium">first user</span> will be the{" "}
          <span className="font-semibold text-indigo-700">Admin</span> of this
          workspace. Later you can add more teams like “SDR Team”, “Closers”, or
          “CSM”.
        </p>
      </div>
    </div>
  );
}

function StepInvites(props: {
  invites: InviteRow[];
  setInvites: (rows: InviteRow[]) => void;
  updateInvite: (index: number, patch: Partial<InviteRow>) => void;
}) {
  const { invites, setInvites, updateInvite } = props;

  function addRow() {
    setInvites([...invites, { email: "", role: "Setter" }]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Invite the people who will use FaigataCRM with you. You can always add
        more later.
      </p>

      <div className="space-y-3">
        {invites.map((row, index) => (
          <div
            key={index}
            className="flex flex-col md:flex-row gap-2 md:items-center bg-slate-50 border border-slate-100 rounded-xl px-3 py-2"
          >
            <input
              type="email"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="teammate@company.com"
              value={row.email}
              onChange={(e) => updateInvite(index, { email: e.target.value })}
            />
            <select
              className="w-full md:w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={row.role}
              onChange={(e) =>
                updateInvite(index, { role: e.target.value as Role })
              }
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-sm text-indigo-600 font-medium mt-1 hover:underline"
      >
        + Add another teammate
      </button>
    </div>
  );
}

function StepCustomFields(props: {
  fields: CustomFieldRow[];
  setFields: (rows: CustomFieldRow[]) => void;
  updateField: (index: number, patch: Partial<CustomFieldRow>) => void;
}) {
  const { fields, setFields, updateField } = props;

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function addField() {
    setFields([
      ...fields,
      {
        label: "New field",
        key: `field_${fields.length + 1}`,
        type: "text",
      },
    ]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const updated = [...fields];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setFields(updated);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Choose the data you want to track on every lead or prospect. Drag fields
        to reorder them.
      </p>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 cursor-move ${
              dragIndex === index ? "ring-2 ring-indigo-200" : ""
            }`}
          >
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="Field label (e.g. Industry)"
              />
              <select
                className="w-full md:w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={field.type}
                onChange={(e) =>
                  updateField(index, {
                    type: e.target.value as CustomFieldRow["type"],
                  })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Dropdown</option>
                <option value="boolean">Checkbox</option>
                <option value="url">URL</option>
              </select>

              <button
                type="button"
                onClick={() => removeField(index)}
                className="text-xs text-slate-500 hover:text-red-500 self-start"
              >
                Remove
              </button>
            </div>

            {field.type === "select" && (
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={field.options ?? ""}
                onChange={(e) =>
                  updateField(index, { options: e.target.value })
                }
                placeholder="Options (comma separated, e.g. SaaS, E-commerce, Agency)"
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className="text-sm text-indigo-600 font-medium mt-1 hover:underline"
      >
        + Add another field
      </button>
    </div>
  );
}

function StepImportLeads(props: {
  importFileName: string | null;
  setImportFileName: (v: string | null) => void;
}) {
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) props.setImportFileName(file.name);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Already have leads or prospects in a spreadsheet? Import them now so
          your team can start where they left off.
        </p>

        <label className="border-2 border-dashed border-slate-300 rounded-2xl px-4 py-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition">
          <span className="text-sm font-medium text-slate-700">
            Click to upload CSV / Excel
          </span>
          <span className="text-xs text-slate-500 mt-1">
            We’ll guide you through mapping the columns later.
          </span>
          <input type="file" className="hidden" onChange={handleFileChange} />
        </label>

        {props.importFileName && (
          <p className="text-xs text-slate-600">
            Selected file:{" "}
            <span className="font-medium">{props.importFileName}</span>
          </p>
        )}

        <button
          type="button"
          className="text-xs text-indigo-600 font-medium hover:underline"
        >
          Download sample template
        </button>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 space-y-2">
        <p className="font-medium text-slate-700 mb-1">Recommended columns</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Name, Email, Company</li>
          <li>Stage (New / Contacted / Replied / Qualified / …)</li>
          <li>Owner (Prospector / Setter / Closer)</li>
          <li>Any custom fields you just defined</li>
        </ul>
      </div>
    </div>
  );
}

function StepPipeline(props: {
  stages: string[];
  updateStage: (index: number, value: string) => void;
  setStages: (stages: string[]) => void;
}) {
  const { stages, updateStage, setStages } = props;

  function addStage() {
    setStages([...stages, "New stage"]);
  }

  function removeStage(index: number) {
    setStages(stages.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        This is your default pipeline. You can keep our recommended one or
        rename stages to match your process.
      </p>

      <div className="space-y-2">
        {stages.map((stage, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={stage}
              onChange={(e) => updateStage(index, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeStage(index)}
              className="text-xs text-slate-500 hover:text-red-500"
              disabled={stages.length <= 2}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addStage}
        className="text-sm text-indigo-600 font-medium mt-1 hover:underline"
      >
        + Add stage
      </button>
    </div>
  );
}

function StepConversionMetrics(props: {
  stages: string[];
  metrics: ConversionMetricRow[];
  setMetrics: (rows: ConversionMetricRow[]) => void;
}) {
  const { stages, metrics, setMetrics } = props;

  function addMetric() {
    if (stages.length < 2) return;
    setMetrics([
      ...metrics,
      {
        label: "New metric",
        fromStage: stages[0],
        toStage: stages[1],
      },
    ]);
  }

  function updateMetric(index: number, patch: Partial<ConversionMetricRow>) {
    if (!metrics[index]) return;

    const updated = metrics.map((metric, i) =>
      i === index ? { ...metric, ...patch } : metric
    );
    setMetrics(updated);
  }

  function removeMetric(index: number) {
    setMetrics(metrics.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Give names to the conversion rates you care about. Each metric compares
        how many leads move from one stage of the pipeline to another (e.g.
        “New → Contacted” or “Qualified → Booked call”).
      </p>

      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2"
          >
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={metric.label}
                onChange={(e) =>
                  updateMetric(index, { label: e.target.value })
                }
                placeholder="Metric name (e.g. Reply rate, Booking rate)"
              />

              <select
                className="w-full md:w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={metric.fromStage}
                onChange={(e) =>
                  updateMetric(index, { fromStage: e.target.value })
                }
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    From: {s}
                  </option>
                ))}
              </select>

              <select
                className="w-full md:w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={metric.toStage}
                onChange={(e) =>
                  updateMetric(index, { toStage: e.target.value })
                }
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    To: {s}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeMetric(index)}
                className="text-xs text-slate-500 hover:text-red-500 self-start"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addMetric}
        className="text-sm text-indigo-600 font-medium mt-1 hover:underline"
      >
        + Add conversion metric
      </button>
    </div>
  );
}

function StepFinish(props: {
  companyName: string;
  teamName: string;
  invites: InviteRow[];
  fields: CustomFieldRow[];
  stages: string[];
  metrics: ConversionMetricRow[];
}) {
  const activeInvites = props.invites.filter((i) => i.email.trim() !== "");

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <div className="space-y-3">
        <p className="text-lg font-semibold text-slate-900">
          You’re ready to roll 🎉
        </p>
        <p className="text-sm text-slate-600">
          We’ll create{" "}
          <span className="font-medium">
            {props.teamName || "your sales team"}
          </span>{" "}
          inside{" "}
          <span className="font-medium">
            {props.companyName || "your company"}
          </span>
          , pre-load your custom fields and pipeline, and send invites to your
          teammates.
        </p>

        <ul className="mt-2 text-sm text-slate-600 space-y-1">
          <li>• {activeInvites.length || "No"} teammate invites</li>
          <li>• {props.fields.length} custom lead fields</li>
          <li>• {props.stages.length} pipeline stages</li>
          <li>• {props.metrics.length || "No"} conversion metrics</li>
        </ul>
      </div>

      <div className="bg-indigo-50 rounded-2xl p-4 text-sm text-slate-700 space-y-2">
        <p className="font-medium mb-1">Next up in FaigataCRM</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Track setters’ outreach and replies in real time</li>
          <li>Auto-assign high potential leads to your best performers</li>
          <li>Give managers a clear view of pipeline health</li>
        </ul>
      </div>
    </div>
  );
}
