export interface ConversionMetricStageRef {
  id: string;
  name: string;
}

export interface ConversionMetricDefinition {
  id?: string;
  label: string;
  fromStageId: string;
  toStageId: string;
  fromStageName?: string;
  toStageName?: string;
  position: number;
  targetRate?: number | null;
}

export interface OnboardingPipelineStageDraft {
  clientId: string;
  name: string;
}

export interface OnboardingConversionMetricDraft {
  label: string;
  fromStageClientId: string;
  toStageClientId: string;
}

export function buildConversionMetricLabel(
  fromStageName?: string | null,
  toStageName?: string | null,
) {
  const from = String(fromStageName ?? "").trim();
  const to = String(toStageName ?? "").trim();

  if (from && to) return `${from} -> ${to}`;
  if (from) return `${from} ->`;
  if (to) return `-> ${to}`;
  return "";
}

export function findStageNameById(
  stages: Array<ConversionMetricStageRef>,
  stageId: string,
) {
  return (
    stages.find((stage) => String(stage.id) === String(stageId))?.name ?? ""
  );
}

export function createOnboardingStageDraft(name: string, index: number) {
  return {
    clientId: `stage-${index + 1}`,
    name,
  } satisfies OnboardingPipelineStageDraft;
}
