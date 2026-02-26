"use client";

import { useEffect, useState, type DragEvent, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function OnboardingPageClient() {
  // ✅ Standard theme logic (keep for future pages)
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

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
      // 1) Get session first (more reliable than getUser alone)
      const { data: sessionRes } = await supabase.auth.getSession();

      // 2) If there's no session, try refresh once (helps after redirects)
      if (!sessionRes.session) {
        await supabase.auth.refreshSession();
      }

      // 3) Now read user
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        alert("You need to be logged in to finish onboarding.");
        window.location.href = "/login";
        return;
      }

      const meta = (data.user.user_metadata ?? {}) as any;
      const firstName = meta.first_name ?? "";
      const lastName = meta.last_name ?? "";

      const res = await fetch("/api/crm/onboarding", {
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

  const pageBg = isDark
    ? "bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900"
    : "bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50";

  const shell = isDark
    ? "bg-slate-950 border-slate-800"
    : "bg-white border-slate-100";

  const headerTitle = isDark ? "text-slate-100" : "text-slate-900";
  const headerSub = isDark ? "text-slate-400" : "text-slate-500";

  const divider = isDark ? "border-slate-800" : "border-slate-100";
  const progressTrack = isDark ? "bg-slate-900" : "bg-slate-100";

  return (
    <main
      className={cn(
        "min-h-screen flex items-center justify-center px-4",
        pageBg,
      )}
    >
      <div
        className={cn(
          "w-full max-w-4xl rounded-3xl border shadow-xl p-8 md:p-10 flex flex-col gap-6",
          shell,
        )}
      >
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className={cn("text-2xl font-semibold", headerTitle)}>
              Welcome to Lumo
            </h1>
            <p className={cn("text-sm", headerSub)}>
              Step {stepIndex + 1} of {steps.length} · {steps[stepIndex]}
            </p>
          </div>

          <div className={cn("flex items-center gap-2 text-xs", headerSub)}>
            <span
              className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                isDark
                  ? "bg-indigo-950/60 text-indigo-200"
                  : "bg-indigo-100 text-indigo-600",
              )}
            >
              ✨
            </span>
            <span>We’ll get you fully set up in a minute.</span>
          </div>
        </header>

        {/* Progress bar */}
        <div
          className={cn(
            "h-2 w-full rounded-full overflow-hidden",
            progressTrack,
          )}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step content */}
        <section className="mt-2">
          {stepIndex === 0 && (
            <StepTeamSetup
              isDark={isDark}
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
              isDark={isDark}
              invites={invites}
              setInvites={setInvites}
              updateInvite={updateInvite}
            />
          )}

          {stepIndex === 2 && (
            <StepCustomFields
              isDark={isDark}
              fields={fields}
              updateField={updateField}
              setFields={setFields}
            />
          )}

          {stepIndex === 3 && (
            <StepImportLeads
              isDark={isDark}
              importFileName={importFileName}
              setImportFileName={setImportFileName}
            />
          )}

          {stepIndex === 4 && (
            <StepPipeline
              isDark={isDark}
              stages={pipelineStages}
              updateStage={updateStage}
              setStages={setPipelineStages}
            />
          )}

          {stepIndex === 5 && (
            <StepConversionMetrics
              isDark={isDark}
              stages={pipelineStages}
              metrics={conversionMetrics}
              setMetrics={setConversionMetrics}
            />
          )}

          {stepIndex === 6 && (
            <StepFinish
              isDark={isDark}
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
        <footer
          className={cn(
            "flex items-center justify-between pt-4 border-t",
            divider,
          )}
        >
          <button
            type="button"
            onClick={back}
            disabled={stepIndex === 0}
            className={cn(
              "text-sm hover:opacity-100",
              isDark
                ? "text-slate-400 hover:text-slate-200"
                : "text-slate-500 hover:text-slate-700",
              stepIndex === 0
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer",
            )}
          >
            ← Back
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={next}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition cursor-pointer"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition cursor-pointer"
            >
              Go to dashboard 🎉
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}

/* ---------- Step components ---------- */

function StepTeamSetup(props: {
  isDark: boolean;
  companyName: string;
  setCompanyName: (v: string) => void;
  teamName: string;
  setTeamName: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
}) {
  const input = cn(
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2",
    props.isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  const label = cn(
    "block text-sm font-medium mb-1",
    props.isDark ? "text-slate-300" : "text-slate-700",
  );

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <label className={label}>Company name</label>
          <input
            className={input}
            value={props.companyName}
            onChange={(e) => props.setCompanyName(e.target.value)}
            placeholder="e.g. Faigata GmbH"
          />
        </div>

        <div>
          <label className={label}>Your first team</label>
          <input
            className={input}
            value={props.teamName}
            onChange={(e) => props.setTeamName(e.target.value)}
            placeholder="e.g. Outbound Sales"
          />
        </div>

        <div>
          <label className={label}>Timezone</label>
          <select
            className={cn(input, "cursor-pointer")}
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

      <div
        className={cn(
          "rounded-2xl p-4 text-sm flex flex-col gap-2",
          props.isDark
            ? "bg-indigo-950/30 text-slate-200"
            : "bg-indigo-50 text-slate-700",
        )}
      >
        <span className="text-lg">💡</span>
        <p>
          Your <span className="font-medium">first user</span> will be the{" "}
          <span
            className={cn(
              "font-semibold",
              props.isDark ? "text-indigo-200" : "text-indigo-700",
            )}
          >
            Admin
          </span>{" "}
          of this workspace. Later you can add more teams like “SDR Team”,
          “Closers”, or “CSM”.
        </p>
      </div>
    </div>
  );
}

function StepInvites(props: {
  isDark: boolean;
  invites: InviteRow[];
  setInvites: (rows: InviteRow[]) => void;
  updateInvite: (index: number, patch: Partial<InviteRow>) => void;
}) {
  const { invites, setInvites, updateInvite, isDark } = props;

  function addRow() {
    setInvites([...invites, { email: "", role: "Setter" }]);
  }

  const rowWrap = cn(
    "flex flex-col md:flex-row gap-2 md:items-center rounded-xl px-3 py-2 border",
    isDark
      ? "bg-slate-900/40 border-slate-800"
      : "bg-slate-50 border-slate-100",
  );

  const input = cn(
    "flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  return (
    <div className="space-y-4">
      <p
        className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}
      >
        Invite the people who will use Lumo with you. You can always add more
        later.
      </p>

      <div className="space-y-3">
        {invites.map((row, index) => (
          <div key={index} className={rowWrap}>
            <input
              type="email"
              className={input}
              placeholder="teammate@company.com"
              value={row.email}
              onChange={(e) => updateInvite(index, { email: e.target.value })}
            />
            <select
              className={cn(
                "w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 cursor-pointer",
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-100 focus:ring-indigo-400"
                  : "border-slate-200 bg-white text-slate-900 focus:ring-indigo-500",
              )}
              value={row.role}
              onChange={(e) =>
                updateInvite(index, { role: e.target.value as Role })
              }
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className={cn(
          "text-sm font-medium mt-1 hover:underline cursor-pointer",
          isDark ? "text-indigo-300" : "text-indigo-600",
        )}
      >
        + Add another teammate
      </button>
    </div>
  );
}

function StepCustomFields(props: {
  isDark: boolean;
  fields: CustomFieldRow[];
  setFields: (rows: CustomFieldRow[]) => void;
  updateField: (index: number, patch: Partial<CustomFieldRow>) => void;
}) {
  const { fields, setFields, updateField, isDark } = props;

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

  const card = cn(
    "rounded-xl p-3 space-y-2 cursor-move border",
    isDark
      ? "bg-slate-900/40 border-slate-800"
      : "bg-slate-50 border-slate-100",
  );

  const input = cn(
    "w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  return (
    <div className="space-y-4">
      <p
        className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}
      >
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
            className={cn(
              card,
              dragIndex === index && "ring-2 ring-indigo-300/40",
            )}
          >
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className={cn(input, "flex-1")}
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="Field label (e.g. Industry)"
              />
              <select
                className={cn(input, "w-full md:w-40 cursor-pointer text-sm")}
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
                className={cn(
                  "text-xs self-start cursor-pointer",
                  isDark
                    ? "text-slate-400 hover:text-rose-300"
                    : "text-slate-500 hover:text-red-500",
                )}
              >
                Remove
              </button>
            </div>

            {field.type === "select" && (
              <input
                className={cn(input, "text-xs")}
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
        className={cn(
          "text-sm font-medium mt-1 hover:underline cursor-pointer",
          isDark ? "text-indigo-300" : "text-indigo-600",
        )}
      >
        + Add another field
      </button>
    </div>
  );
}

function StepImportLeads(props: {
  isDark: boolean;
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
        <p
          className={cn(
            "text-sm",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          Already have leads or prospects in a spreadsheet? Import them now so
          your team can start where they left off.
        </p>

        <label
          className={cn(
            "border-2 border-dashed rounded-2xl px-4 py-6 flex flex-col items-center justify-center cursor-pointer transition",
            props.isDark
              ? "border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-950/30"
              : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40",
          )}
        >
          <span
            className={cn(
              "text-sm font-medium",
              props.isDark ? "text-slate-200" : "text-slate-700",
            )}
          >
            Click to upload CSV / Excel
          </span>
          <span
            className={cn(
              "text-xs mt-1",
              props.isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            We’ll guide you through mapping the columns later.
          </span>
          <input type="file" className="hidden" onChange={handleFileChange} />
        </label>

        {props.importFileName && (
          <p
            className={cn(
              "text-xs",
              props.isDark ? "text-slate-300" : "text-slate-600",
            )}
          >
            Selected file:{" "}
            <span className="font-medium">{props.importFileName}</span>
          </p>
        )}

        <button
          type="button"
          className={cn(
            "text-xs font-medium hover:underline cursor-pointer",
            props.isDark ? "text-indigo-300" : "text-indigo-600",
          )}
        >
          Download sample template
        </button>
      </div>

      <div
        className={cn(
          "rounded-2xl p-4 text-xs space-y-2",
          props.isDark
            ? "bg-slate-900/40 text-slate-300"
            : "bg-slate-50 text-slate-600",
        )}
      >
        <p
          className={cn(
            "font-medium mb-1",
            props.isDark ? "text-slate-200" : "text-slate-700",
          )}
        >
          Recommended columns
        </p>
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
  isDark: boolean;
  stages: string[];
  updateStage: (index: number, value: string) => void;
  setStages: (stages: string[]) => void;
}) {
  const { stages, updateStage, setStages, isDark } = props;

  function addStage() {
    setStages([...stages, "New stage"]);
  }

  function removeStage(index: number) {
    setStages(stages.filter((_, i) => i !== index));
  }

  const input = cn(
    "flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  return (
    <div className="space-y-4">
      <p
        className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}
      >
        This is your default pipeline. You can keep our recommended one or
        rename stages to match your process.
      </p>

      <div className="space-y-2">
        {stages.map((stage, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className={input}
              value={stage}
              onChange={(e) => updateStage(index, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeStage(index)}
              className={cn(
                "text-xs",
                isDark
                  ? "text-slate-400 hover:text-rose-300"
                  : "text-slate-500 hover:text-red-500",
                stages.length <= 2
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer",
              )}
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
        className={cn(
          "text-sm font-medium mt-1 hover:underline cursor-pointer",
          isDark ? "text-indigo-300" : "text-indigo-600",
        )}
      >
        + Add stage
      </button>
    </div>
  );
}

function StepConversionMetrics(props: {
  isDark: boolean;
  stages: string[];
  metrics: ConversionMetricRow[];
  setMetrics: (rows: ConversionMetricRow[]) => void;
}) {
  const { stages, metrics, setMetrics, isDark } = props;

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
      i === index ? { ...metric, ...patch } : metric,
    );
    setMetrics(updated);
  }

  function removeMetric(index: number) {
    setMetrics(metrics.filter((_, i) => i !== index));
  }

  const card = cn(
    "rounded-xl p-3 space-y-2 border",
    isDark
      ? "bg-slate-900/40 border-slate-800"
      : "bg-slate-50 border-slate-100",
  );

  const input = cn(
    "w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  return (
    <div className="space-y-4">
      <p
        className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}
      >
        Give names to the conversion rates you care about. Each metric compares
        how many leads move from one stage of the pipeline to another (e.g. “New
        → Contacted” or “Qualified → Booked call”).
      </p>

      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <div key={index} className={card}>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className={cn(input, "flex-1")}
                value={metric.label}
                onChange={(e) => updateMetric(index, { label: e.target.value })}
                placeholder="Metric name (e.g. Reply rate, Booking rate)"
              />

              <select
                className={cn(input, "w-full md:w-40 cursor-pointer")}
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
                className={cn(input, "w-full md:w-40 cursor-pointer")}
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
                className={cn(
                  "text-xs self-start cursor-pointer",
                  isDark
                    ? "text-slate-400 hover:text-rose-300"
                    : "text-slate-500 hover:text-red-500",
                )}
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
        className={cn(
          "text-sm font-medium mt-1 hover:underline cursor-pointer",
          isDark ? "text-indigo-300" : "text-indigo-600",
        )}
      >
        + Add conversion metric
      </button>
    </div>
  );
}

function StepFinish(props: {
  isDark: boolean;
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
        <p
          className={cn(
            "text-lg font-semibold",
            props.isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          You’re ready to roll 🎉
        </p>
        <p
          className={cn(
            "text-sm",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
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

        <ul
          className={cn(
            "mt-2 text-sm space-y-1",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          <li>• {activeInvites.length || "No"} teammate invites</li>
          <li>• {props.fields.length} custom lead fields</li>
          <li>• {props.stages.length} pipeline stages</li>
          <li>• {props.metrics.length || "No"} conversion metrics</li>
        </ul>
      </div>

      <div
        className={cn(
          "rounded-2xl p-4 text-sm space-y-2",
          props.isDark
            ? "bg-indigo-950/30 text-slate-200"
            : "bg-indigo-50 text-slate-700",
        )}
      >
        <p
          className={cn(
            "font-medium mb-1",
            props.isDark ? "text-slate-100" : "text-slate-700",
          )}
        >
          Next up in Lumo
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Track setters’ outreach and replies in real time</li>
          <li>Auto-assign high potential leads to your best performers</li>
          <li>Give managers a clear view of pipeline health</li>
        </ul>
      </div>
    </div>
  );
}
