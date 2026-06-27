import { describe, expect, it } from "vitest";
import {
  fmtMessageTimestamp,
  getCallAttendanceChange,
  getTimelineMessageDescriptor,
  getTimelineEventType,
  iconForAttendance,
} from "@/features/crm/components/lead-detail/timeline";
import type { LeadMessage } from "@/features/crm/components/lead-detail/types";

function buildMessage(overrides: Partial<LeadMessage> = {}): LeadMessage {
  return {
    id: "msg-1",
    direction: "outbound",
    channel: "pipeline",
    body: "CALL_ATTENDANCE|booking-1|unknown|attended",
    sent_at: "2026-04-11T10:00:00.000Z",
    sender_profile_id: null,
    ...overrides,
  };
}

describe("lead timeline call attendance descriptors", () => {
  it("reads call status states from camelCase structured event data", () => {
    const message = buildMessage({
      event_type: "call_status_updated",
      event_data: {
        previousStatus: "unknown",
        nextStatus: "no_show",
      },
    });

    expect(getTimelineEventType(message)).toBe("call_attendance_updated");
    expect(getCallAttendanceChange(message)).toEqual({
      previousStatus: "unknown",
      nextStatus: "no_show",
    });
    expect(getTimelineMessageDescriptor({
      message,
      leadLabel: "Acme",
      oldSetterNameForRejectedLead: "Old Setter",
      newSetterNameForRejectedLead: "New Setter",
      productTitle: null,
      viewerTz: "Europe/Vienna",
      stageLabelsById: {},
    })).toMatchObject({
      key: "crm.leadTimeline.callAttendanceUpdated",
      values: {
        previousStatus: "unknown",
        nextStatus: "no_show",
      },
    });
  });

  it("parses displayed call status update bodies when event data is absent", () => {
    const message = buildMessage({
      body: "Call status updated: Unknown -> No-show",
    });

    expect(getTimelineEventType(message)).toBe("call_attendance_updated");
    expect(getCallAttendanceChange(message)).toEqual({
      previousStatus: "unknown",
      nextStatus: "no_show",
    });
    expect(iconForAttendance("No-show")).toBe("/icons/call-no-show.svg");
  });

  it("formats timestamps with the selected app locale", () => {
    const iso = "2026-04-11T10:00:00.000Z";

    expect(fmtMessageTimestamp(iso, "Europe/Vienna", "de")).not.toBe(
      fmtMessageTimestamp(iso, "Europe/Vienna", "en"),
    );
  });
});
