import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

type BookingType = "one_on_one" | "group" | "round_robin";

type CloserUser = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type HostSelectionSectionProps = {
  bookingType: BookingType;
  closers: CloserUser[];
  loadingClosers: boolean;
  isDark: boolean;
  labelClass: string;
  inputClass: string;
  helpText: string;
  selectedCloserId: string | null;
  setSelectedCloserId: Dispatch<SetStateAction<string | null>>;
  primaryCloserId: string | null;
  setPrimaryCloserId: Dispatch<SetStateAction<string | null>>;
  selectedGroupCloserIds: string[];
  setSelectedGroupCloserIds: Dispatch<SetStateAction<string[]>>;
  selectedRoundRobinCloserIds: string[];
  setSelectedRoundRobinCloserIds: Dispatch<SetStateAction<string[]>>;
};

function renderCloserName(closer: CloserUser, fallback: string) {
  return (
    `${closer.first_name ?? ""} ${closer.last_name ?? ""}`.trim() || fallback
  );
}

function EmptyClosersNotice({ isDark }: { isDark: boolean }) {
  const t = useTranslations("CreateSchedulePage.hostSelection");

  return (
    <p
      className={cn(
        "mt-1 rounded-lg border px-3 py-2 text-[11px]",
        isDark
          ? "border-amber-900/40 bg-amber-950/30 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      {t.rich("emptyClosers", {
        strong: (chunks) => <span className="font-semibold">{chunks}</span>,
      })}
    </p>
  );
}

export function HostSelectionSection(props: HostSelectionSectionProps) {
  const t = useTranslations("CreateSchedulePage.hostSelection");

  const {
    bookingType,
    closers,
    loadingClosers,
    isDark,
    labelClass,
    inputClass,
    helpText,
    selectedCloserId,
    setSelectedCloserId,
    primaryCloserId,
    setPrimaryCloserId,
    selectedGroupCloserIds,
    setSelectedGroupCloserIds,
    selectedRoundRobinCloserIds,
    setSelectedRoundRobinCloserIds,
  } = props;

  if (bookingType === "one_on_one") {
    return (
      <div>
        <label className={labelClass}>{t("oneOnOne.label")}</label>
        {closers.length === 0 ? (
          <EmptyClosersNotice isDark={isDark} />
        ) : (
          <>
            <select
              value={selectedCloserId ?? ""}
              onChange={(event) =>
                setSelectedCloserId(event.target.value || null)
              }
              disabled={loadingClosers}
              className={cn(inputClass, "cursor-pointer")}
            >
              {closers.map((closer) => (
                <option key={closer.user_id} value={closer.user_id}>
                  {renderCloserName(closer, t("unnamedUser"))}
                </option>
              ))}
            </select>
            <p className={helpText}>{t("oneOnOne.help")}</p>
          </>
        )}
      </div>
    );
  }

  if (bookingType === "group") {
    return (
      <div className="space-y-2">
        <label className={labelClass}>{t("group.label")}</label>

        {closers.length === 0 ? (
          <EmptyClosersNotice isDark={isDark} />
        ) : (
          <>
            <div>
              <div
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  isDark ? "text-slate-400" : "text-slate-500",
                )}
              >
                {t("group.primaryCloser")}
              </div>
              <select
                value={primaryCloserId ?? ""}
                onChange={(event) => {
                  const value = event.target.value || null;
                  setPrimaryCloserId(value);
                  if (value && !selectedGroupCloserIds.includes(value)) {
                    setSelectedGroupCloserIds((previous) => [
                      value,
                      ...previous,
                    ]);
                  }
                }}
                disabled={loadingClosers}
                className={cn(inputClass, "cursor-pointer")}
              >
                {closers.map((closer) => (
                  <option key={closer.user_id} value={closer.user_id}>
                    {renderCloserName(closer, t("unnamedUser"))}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={cn(
                "rounded-xl border p-3",
                isDark
                  ? "border-slate-800 bg-slate-900/40"
                  : "border-slate-200 bg-slate-50",
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  isDark ? "text-slate-400" : "text-slate-500",
                )}
              >
                {t("group.selectAttendees")}
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {closers.map((closer) => {
                  const id = closer.user_id;
                  const checked = selectedGroupCloserIds.includes(id);
                  const isPrimary = primaryCloserId === id;

                  return (
                    <label
                      key={id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer",
                        isDark
                          ? "border-slate-800 bg-slate-950"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked || isPrimary}
                        disabled={isPrimary}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? Array.from(
                                new Set([...selectedGroupCloserIds, id]),
                              )
                            : selectedGroupCloserIds.filter(
                                (value) => value !== id,
                              );

                          const ensured = primaryCloserId
                            ? next.includes(primaryCloserId)
                              ? next
                              : [primaryCloserId, ...next]
                            : next;

                          setSelectedGroupCloserIds(ensured);
                        }}
                      />
                      <span
                        className={cn(
                          "font-medium",
                          isDark ? "text-slate-100" : "text-slate-900",
                        )}
                      >
                        {renderCloserName(closer, t("unnamedUser"))}
                      </span>
                      {isPrimary && (
                        <span className="ml-auto text-[11px] font-semibold text-indigo-500">
                          {t("group.primaryBadge")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              <p
                className={cn(
                  "mt-2 text-[11px]",
                  isDark ? "text-slate-400" : "text-slate-500",
                )}
              >
                {t("group.help")}
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className={labelClass}>{t("roundRobin.label")}</label>

      {closers.length === 0 ? (
        <EmptyClosersNotice isDark={isDark} />
      ) : (
        <div
          className={cn(
            "rounded-xl border p-3",
            isDark
              ? "border-slate-800 bg-slate-900/40"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <div
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {t("roundRobin.selectPool")}
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {closers.map((closer) => {
              const id = closer.user_id;
              const checked = selectedRoundRobinCloserIds.includes(id);

              return (
                <label
                  key={id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer",
                    isDark
                      ? "border-slate-800 bg-slate-950"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedRoundRobinCloserIds((previous) => {
                        if (event.target.checked) {
                          return Array.from(new Set([...previous, id]));
                        }
                        return previous.filter((value) => value !== id);
                      });
                    }}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      isDark ? "text-slate-100" : "text-slate-900",
                    )}
                  >
                    {renderCloserName(closer, t("unnamedUser"))}
                  </span>
                </label>
              );
            })}
          </div>

          <p
            className={cn(
              "mt-2 text-[11px]",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {t.rich("roundRobin.help", {
              strong: (chunks) => (
                <span className="font-semibold">{chunks}</span>
              ),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
