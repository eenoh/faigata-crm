import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

type BookingType = "one_on_one" | "group" | "round_robin";
type AvailabilityMode = "business_hours" | "twenty_four_seven";

type SchedulePagePreviewProps = {
  isDark: boolean;
  cardBaseClass: string;
  previewHours: string;
  orgLogoSignedUrl: string | null;
  orgName: string;
  orgInitial: string;
  bookingType: BookingType;
  durationMinutes: number;
  name: string;
  description: string;
  gradientA: string;
  gradientB: string;
  previewSlots: number[];
  availabilityMode: AvailabilityMode;
  enabledDaysLabel: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHoursValue: number;
  maxNoticeDaysValue: number;
};

export function SchedulePagePreview(props: SchedulePagePreviewProps) {
  const t = useTranslations("CreateSchedulePage.previewCard");

  const {
    isDark,
    cardBaseClass,
    previewHours,
    orgLogoSignedUrl,
    orgName,
    orgInitial,
    bookingType,
    durationMinutes,
    name,
    description,
    gradientA,
    gradientB,
    previewSlots,
    availabilityMode,
    enabledDaysLabel,
    minNoticeHoursValue,
    maxNoticeDaysValue,
  } = props;

  const bookingTypeLabel =
    bookingType === "one_on_one"
      ? t("bookingType.oneOnOne")
      : bookingType === "group"
        ? t("bookingType.group")
        : t("bookingType.roundRobin");

  const availabilityText =
    availabilityMode === "twenty_four_seven"
      ? t("body.availabilityAlways")
      : t("body.availabilityWindow", {
          days: enabledDaysLabel,
          hours: previewHours,
        });

  return (
    <div className="space-y-3">
      <div className={cn(cardBaseClass, "p-4")}>
        <h2
          className={cn(
            "text-sm font-semibold",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          {t("header.title")}
        </h2>
        <p
          className={cn(
            "mt-1 text-xs",
            isDark ? "text-slate-300" : "text-slate-500",
          )}
        >
          {t.rich("header.description", {
            hours: () => <span className="font-semibold">{previewHours}</span>,
          })}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-lg">
        <div
          className="px-6 py-5 text-white"
          style={{ backgroundImage: gradientA }}
        >
          <div className="flex items-center gap-3">
            {orgLogoSignedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogoSignedUrl}
                alt={orgName}
                className="h-10 w-10 rounded-2xl border border-white/20 bg-white/10 object-cover"
                style={{ boxShadow: "0 14px 45px rgba(0,0,0,0.35)" }}
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xs font-semibold uppercase"
                style={{ boxShadow: "0 14px 45px rgba(0,0,0,0.35)" }}
              >
                {orgInitial}
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-white/75">
                {t("meta.bookingWith", {
                  orgName,
                  bookingType: bookingTypeLabel,
                  duration: durationMinutes,
                })}
              </p>
              <h3 className="mt-0.5 truncate text-lg font-semibold">
                {name || t("defaults.meetingName")}
              </h3>
            </div>

            <span className="ml-auto hidden rounded-full px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15 sm:inline-flex bg-white/10">
              {t("meta.secureScheduling")}
            </span>
          </div>

          <p className="mt-3 max-w-md text-xs text-white/85">
            {description || t("defaults.description")}
          </p>

          <p className="mt-2 text-[11px] text-white/75">
            {t("body.noticeWindow")}{" "}
            <span className="font-semibold text-white/90">
              {t("body.noticeWindowValue", {
                minNoticeHours: minNoticeHoursValue,
                maxNoticeDays: maxNoticeDaysValue,
              })}
            </span>
          </p>

          <p className="mt-1 text-[11px] text-white/75">
            <span className="font-semibold text-white/90">
              {availabilityText}
            </span>
          </p>
        </div>

        <div className="grid gap-0 border-t border-white/10 bg-slate-950/95 text-slate-100 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="border-b border-white/10 px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
              {t("body.yourDetails")}
            </p>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-400">
                {t("body.firstName")}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-400">
                {t("body.email")}
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
              {t("body.pickTime")}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {previewSlots.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-2 text-[11px] font-semibold text-white shadow-sm"
                  style={{
                    backgroundImage: gradientB,
                    backgroundSize: "200% 200%",
                    backgroundPosition: "0% 50%",
                  }}
                >
                  {String(hour).padStart(2, "0")}:00
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-300/70">
          {t.rich("footer.poweredBy", {
            strong: (chunks) => (
              <span className="font-semibold text-white/90">{chunks}</span>
            ),
          })}
        </div>
      </div>

      <p
        className={cn(
          "text-[11px]",
          isDark ? "text-slate-400" : "text-slate-500",
        )}
      >
        {t("footer.note")}
      </p>
    </div>
  );
}
