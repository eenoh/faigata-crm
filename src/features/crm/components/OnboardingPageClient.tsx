"use client";

import { useEffect, useState, type DragEvent, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";
import { localeFetch } from "@/lib/http/request";
import {
  createOnboardingStageDraft,
  type OnboardingConversionMetricDraft,
  type OnboardingPipelineStageDraft,
} from "@/features/crm/utils/conversionMetrics";

const ROLES = ["prospector", "setter", "closer", "manager", "admin"] as const;
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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function OnboardingPageClient() {
  const t = useTranslations("OnboardingPage");
  const common = useTranslations("Common");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const steps = [
    t("steps.teamSetup"),
    t("steps.inviteTeammates"),
    t("steps.customizeLeadData"),
    t("steps.importExistingLeads"),
    t("steps.customizePipeline"),
    t("steps.conversionMetrics"),
    t("steps.finish"),
  ];

  const [stepIndex, setStepIndex] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [teamName, setTeamName] = useState(() => t("teamSetup.defaults.teamName"));
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "setter" },
  ]);
  const [fields, setFields] = useState<CustomFieldRow[]>([
    {
      label: t("customFields.defaults.industryLabel"),
      key: "industry",
      type: "text",
    },
    {
      label: t("customFields.defaults.regionLabel"),
      key: "region",
      type: "select",
      options: t("customFields.defaults.regionOptions"),
    },
  ]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<
    OnboardingPipelineStageDraft[]
  >(
    [
      t("pipeline.defaults.new"),
      t("pipeline.defaults.contacted"),
      t("pipeline.defaults.replied"),
      t("pipeline.defaults.qualified"),
      t("pipeline.defaults.bookedCall"),
      t("pipeline.defaults.showedUp"),
      t("pipeline.defaults.offer"),
      t("pipeline.defaults.closed"),
    ].map(createOnboardingStageDraft),
  );
  const [conversionMetrics, setConversionMetrics] = useState<
    OnboardingConversionMetricDraft[]
  >([]);

  useEffect(() => {
    const validStageIds = new Set(
      pipelineStages.map((stage) => stage.clientId),
    );
    setConversionMetrics((prev) =>
      prev.filter(
        (metric) =>
          validStageIds.has(metric.fromStageClientId) &&
          validStageIds.has(metric.toStageClientId),
      ),
    );
  }, [pipelineStages]);

  const isLastStep = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function next() {
    if (!isLastStep) setStepIndex((index) => index + 1);
  }

  function back() {
    if (stepIndex > 0) setStepIndex((index) => index - 1);
  }

  async function handleFinish() {
    try {
      const { data: sessionRes } = await supabase.auth.getSession();

      if (!sessionRes.session) {
        await supabase.auth.refreshSession();
      }

      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        window.alert(t("alerts.loginRequired"));
        window.location.href = "/login";
        return;
      }

      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const firstName =
        typeof meta.first_name === "string" ? meta.first_name : "";
      const lastName =
        typeof meta.last_name === "string" ? meta.last_name : "";

      const res = await localeFetch("/api/crm/onboarding", {
        locale,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
        window.alert(t("alerts.saveFailed"));
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
    } catch (error) {
      console.error("Failed to save onboarding", error);
      window.alert(t("alerts.unexpected"));
    }
  }

  function updateInvite(index: number, patch: Partial<InviteRow>) {
    setInvites((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function updateField(index: number, patch: Partial<CustomFieldRow>) {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function updateStage(index: number, value: string) {
    setPipelineStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value };
      return next;
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
    <main className={cn("min-h-screen flex items-center justify-center px-4", pageBg)}>
      <div
        className={cn(
          "w-full max-w-4xl rounded-3xl border shadow-xl p-8 md:p-10 flex flex-col gap-6",
          shell,
        )}
      >
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-2xl font-semibold", headerTitle)}>
              {t("page.title")}
            </h1>
            <p className={cn("text-sm", headerSub)}>
              {t("page.progress", {
                current: stepIndex + 1,
                total: steps.length,
                step: steps[stepIndex],
              })}
            </p>
          </div>

          <div className={cn("flex items-center gap-2 text-xs", headerSub)}>
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                isDark
                  ? "bg-indigo-950/60 text-indigo-200"
                  : "bg-indigo-100 text-indigo-600",
              )}
            >
              *
            </span>
            <span>{t("page.setupHint")}</span>
          </div>
        </header>

        <div className={cn("h-2 w-full overflow-hidden rounded-full", progressTrack)}>
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

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

        <footer className={cn("flex items-center justify-between border-t pt-4", divider)}>
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
            {t("actions.back")}
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 cursor-pointer"
            >
              {common("actions.continue")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 cursor-pointer"
            >
              {t("actions.goToDashboard")}
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}

function StepTeamSetup(props: {
  isDark: boolean;
  companyName: string;
  setCompanyName: (value: string) => void;
  teamName: string;
  setTeamName: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
}) {
  const t = useTranslations("OnboardingPage");
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
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label className={label}>{t("teamSetup.fields.companyName")}</label>
          <input
            className={input}
            value={props.companyName}
            onChange={(event) => props.setCompanyName(event.target.value)}
            placeholder={t("teamSetup.placeholders.companyName")}
          />
        </div>

        <div>
          <label className={label}>{t("teamSetup.fields.teamName")}</label>
          <input
            className={input}
            value={props.teamName}
            onChange={(event) => props.setTeamName(event.target.value)}
            placeholder={t("teamSetup.placeholders.teamName")}
          />
        </div>

        <div>
          <label className={label}>{t("teamSetup.fields.timezone")}</label>
          <select
            className={cn(input, "cursor-pointer")}
            value={props.timezone}
            onChange={(event) => props.setTimezone(event.target.value)}
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
        <span className="text-lg">i</span>
        <p>{t("teamSetup.info")}</p>
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
  const t = useTranslations("OnboardingPage");
  const common = useTranslations("Common");
  const { invites, setInvites, updateInvite, isDark } = props;

  function addRow() {
    setInvites([...invites, { email: "", role: "setter" }]);
  }

  function getRoleLabel(role: Role) {
    switch (role) {
      case "admin":
        return common("roles.admin");
      case "manager":
        return common("roles.manager");
      case "prospector":
        return common("roles.prospector");
      case "setter":
        return common("roles.setter");
      case "closer":
        return common("roles.closer");
      default:
        return common("roles.member");
    }
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
      <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
        {t("invites.description")}
      </p>

      <div className="space-y-3">
        {invites.map((row, index) => (
          <div key={index} className={rowWrap}>
            <input
              type="email"
              className={input}
              placeholder={t("invites.emailPlaceholder")}
              value={row.email}
              onChange={(event) =>
                updateInvite(index, { email: event.target.value })
              }
            />
            <select
              className={cn(
                "w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 cursor-pointer",
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-100 focus:ring-indigo-400"
                  : "border-slate-200 bg-white text-slate-900 focus:ring-indigo-500",
              )}
              value={row.role}
              onChange={(event) =>
                updateInvite(index, { role: event.target.value as Role })
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
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
        {t("actions.addAnotherTeammate")}
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
  const t = useTranslations("OnboardingPage");
  const { fields, setFields, updateField, isDark } = props;
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function addField() {
    setFields([
      ...fields,
      {
        label: t("customFields.defaults.newFieldLabel"),
        key: `field_${fields.length + 1}`,
        type: "text",
      },
    ]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, fieldIndex) => fieldIndex !== index));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
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
      <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
        {t("customFields.description")}
      </p>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(event) => handleDragOver(event, index)}
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
                onChange={(event) =>
                  updateField(index, { label: event.target.value })
                }
                placeholder={t("customFields.placeholders.fieldLabel")}
              />
              <select
                className={cn(input, "w-full md:w-40 cursor-pointer text-sm")}
                value={field.type}
                onChange={(event) =>
                  updateField(index, {
                    type: event.target.value as CustomFieldRow["type"],
                  })
                }
              >
                <option value="text">{t("customFields.fieldTypes.text")}</option>
                <option value="number">
                  {t("customFields.fieldTypes.number")}
                </option>
                <option value="select">
                  {t("customFields.fieldTypes.select")}
                </option>
                <option value="boolean">
                  {t("customFields.fieldTypes.boolean")}
                </option>
                <option value="url">{t("customFields.fieldTypes.url")}</option>
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
                {t("actions.remove")}
              </button>
            </div>

            {field.type === "select" && (
              <input
                className={cn(input, "text-xs")}
                value={field.options ?? ""}
                onChange={(event) =>
                  updateField(index, { options: event.target.value })
                }
                placeholder={t("customFields.placeholders.selectOptions")}
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
        {t("actions.addAnotherField")}
      </button>
    </div>
  );
}

function StepImportLeads(props: {
  isDark: boolean;
  importFileName: string | null;
  setImportFileName: (value: string | null) => void;
}) {
  const t = useTranslations("OnboardingPage");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) props.setImportFileName(file.name);
  }

  return (
    <div className="grid gap-6 items-start md:grid-cols-2">
      <div className="space-y-4">
        <p
          className={cn(
            "text-sm",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          {t("importLeads.description")}
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
            {t("importLeads.uploadTitle")}
          </span>
          <span
            className={cn(
              "text-xs mt-1",
              props.isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {t("importLeads.uploadSubtitle")}
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
            {t("importLeads.selectedFile", { fileName: props.importFileName })}
          </p>
        )}

        <button
          type="button"
          className={cn(
            "text-xs font-medium hover:underline cursor-pointer",
            props.isDark ? "text-indigo-300" : "text-indigo-600",
          )}
        >
          {t("actions.downloadSampleTemplate")}
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
          {t("importLeads.recommendedColumns.title")}
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("importLeads.recommendedColumns.nameEmailCompany")}</li>
          <li>{t("importLeads.recommendedColumns.stage")}</li>
          <li>{t("importLeads.recommendedColumns.owner")}</li>
          <li>{t("importLeads.recommendedColumns.customFields")}</li>
        </ul>
      </div>
    </div>
  );
}

function StepPipeline(props: {
  isDark: boolean;
  stages: OnboardingPipelineStageDraft[];
  updateStage: (index: number, value: string) => void;
  setStages: (stages: OnboardingPipelineStageDraft[]) => void;
}) {
  const t = useTranslations("OnboardingPage");
  const { stages, updateStage, setStages, isDark } = props;

  function addStage() {
    setStages([
      ...stages,
      createOnboardingStageDraft(
        t("pipeline.defaults.newStage"),
        stages.length,
      ),
    ]);
  }

  function removeStage(index: number) {
    setStages(stages.filter((_, stageIndex) => stageIndex !== index));
  }

  const input = cn(
    "flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  return (
    <div className="space-y-4">
      <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
        {t("pipeline.description")}
      </p>

      <div className="space-y-2">
        {stages.map((stage, index) => (
          <div key={stage.clientId} className="flex items-center gap-2">
            <input
              className={input}
              value={stage.name}
              onChange={(event) => updateStage(index, event.target.value)}
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
              {t("actions.remove")}
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
        {t("actions.addStage")}
      </button>
    </div>
  );
}

function StepConversionMetrics(props: {
  isDark: boolean;
  stages: OnboardingPipelineStageDraft[];
  metrics: OnboardingConversionMetricDraft[];
  setMetrics: (rows: OnboardingConversionMetricDraft[]) => void;
}) {
  const t = useTranslations("OnboardingPage");
  const { stages, metrics, setMetrics, isDark } = props;

  function addMetric() {
    if (stages.length < 2) return;

    setMetrics([
      ...metrics,
      {
        label: t("conversionMetrics.defaults.newMetric"),
        fromStageClientId: stages[0].clientId,
        toStageClientId: stages[1].clientId,
      },
    ]);
  }

  function updateMetric(
    index: number,
    patch: Partial<OnboardingConversionMetricDraft>,
  ) {
    if (!metrics[index]) return;

    setMetrics(
      metrics.map((metric, metricIndex) =>
        metricIndex === index ? { ...metric, ...patch } : metric,
      ),
    );
  }

  function removeMetric(index: number) {
    setMetrics(metrics.filter((_, metricIndex) => metricIndex !== index));
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
      <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
        {t("conversionMetrics.description")}
      </p>

      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <div key={index} className={card}>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className={cn(input, "flex-1")}
                value={metric.label}
                onChange={(event) =>
                  updateMetric(index, { label: event.target.value })
                }
                placeholder={t("conversionMetrics.placeholders.metricName")}
              />

              <select
                className={cn(input, "w-full md:w-40 cursor-pointer")}
                value={metric.fromStageClientId}
                onChange={(event) =>
                  updateMetric(index, { fromStageClientId: event.target.value })
                }
              >
                {stages.map((stage) => (
                  <option key={stage.clientId} value={stage.clientId}>
                    {t("conversionMetrics.fromStage", { stage: stage.name })}
                  </option>
                ))}
              </select>

              <select
                className={cn(input, "w-full md:w-40 cursor-pointer")}
                value={metric.toStageClientId}
                onChange={(event) =>
                  updateMetric(index, { toStageClientId: event.target.value })
                }
              >
                {stages.map((stage) => (
                  <option key={stage.clientId} value={stage.clientId}>
                    {t("conversionMetrics.toStage", { stage: stage.name })}
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
                {t("actions.remove")}
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
        {t("actions.addConversionMetric")}
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
  stages: OnboardingPipelineStageDraft[];
  metrics: OnboardingConversionMetricDraft[];
}) {
  const t = useTranslations("OnboardingPage");
  const activeInvites = props.invites.filter((invite) => invite.email.trim() !== "");

  return (
    <div className="grid gap-6 items-start md:grid-cols-2">
      <div className="space-y-3">
        <p
          className={cn(
            "text-lg font-semibold",
            props.isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          {t("finish.readyTitle")}
        </p>
        <p
          className={cn(
            "text-sm",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          {t("finish.description", {
            teamName: props.teamName || t("finish.fallbacks.teamName"),
            companyName: props.companyName || t("finish.fallbacks.companyName"),
          })}
        </p>

        <ul
          className={cn(
            "mt-2 text-sm space-y-1",
            props.isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          <li>{t("finish.summary.invites", { count: activeInvites.length })}</li>
          <li>{t("finish.summary.fields", { count: props.fields.length })}</li>
          <li>{t("finish.summary.stages", { count: props.stages.length })}</li>
          <li>{t("finish.summary.metrics", { count: props.metrics.length })}</li>
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
          {t("finish.nextTitle")}
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>{t("finish.nextItems.outreach")}</li>
          <li>{t("finish.nextItems.assignment")}</li>
          <li>{t("finish.nextItems.pipelineHealth")}</li>
        </ul>
      </div>
    </div>
  );
}
