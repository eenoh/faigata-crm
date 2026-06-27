import { describe, expect, it } from "vitest";
import { getTimelineMessageDescriptor } from "@/features/crm/components/lead-detail/timeline";
import type { LeadMessage } from "@/features/crm/components/lead-detail/types";

function buildMessage(overrides: Partial<LeadMessage> = {}): LeadMessage {
  return {
    id: "msg-1",
    direction: "outbound",
    channel: "pipeline",
    body: "STAGE_CHANGED|New|Qualified",
    sent_at: "2026-04-11T10:00:00.000Z",
    sender_profile_id: null,
    ...overrides,
  };
}

describe("lead timeline stage change descriptors", () => {
  it("prefers locale-aware stage labels when stage ids are available", () => {
    const descriptor = getTimelineMessageDescriptor({
      message: buildMessage({
        event_type: "stage_changed",
        event_data: {
          from_stage_id: "stage-new",
          to_stage_id: "stage-qualified",
          from_stage: "New",
          to_stage: "Qualified",
        },
      }),
      leadLabel: "Acme",
      oldSetterNameForRejectedLead: "Old Setter",
      newSetterNameForRejectedLead: "New Setter",
      productTitle: null,
      viewerTz: "Europe/Vienna",
      stageLabelsById: {
        "stage-new": "Neu",
        "stage-qualified": "Qualifiziert",
      },
    });

    expect(descriptor).toEqual({
      key: "crm.leadTimeline.stageChanged",
      values: {
        fromStage: "Neu",
        toStage: "Qualifiziert",
      },
    });
  });

  it("can still parse legacy stage-change bodies when structured data is absent", () => {
    const descriptor = getTimelineMessageDescriptor({
      message: buildMessage({
        body: 'Phase wurde von "Neu" zu "Qualifiziert" geändert.',
      }),
      leadLabel: "Acme",
      oldSetterNameForRejectedLead: "Old Setter",
      newSetterNameForRejectedLead: "New Setter",
      productTitle: null,
      viewerTz: "Europe/Vienna",
      stageLabelsById: {},
    });

    expect(descriptor).toEqual({
      key: "crm.leadTimeline.stageChanged",
      values: {
        fromStage: "Neu",
        toStage: "Qualifiziert",
      },
    });
  });
});
