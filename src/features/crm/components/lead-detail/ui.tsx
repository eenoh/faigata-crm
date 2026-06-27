import type { ReactNode } from "react";

export function SkeletonLine({
  w = "w-full",
  isDark,
}: {
  w?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`h-3 ${w} rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}

export function SkeletonPill({
  w = "w-24",
  isDark,
}: {
  w?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`h-6 ${w} rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}

export function SkeletonButton({
  w = "w-24",
  isDark,
}: {
  w?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`h-8 ${w} rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}

export function LeadDetailPageSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const borderSoft = isDark ? "border-slate-900" : "border-slate-100";

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)] animate-pulse">
        <div className="space-y-6 pb-6">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div
                  className={`h-7 w-44 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                />
                <div className="mt-2 space-y-2">
                  <SkeletonLine isDark={isDark} w="w-72" />
                  <SkeletonLine isDark={isDark} w="w-56" />
                </div>
              </div>

              <div className="flex gap-2">
                <SkeletonButton isDark={isDark} w="w-28" />
                <SkeletonButton isDark={isDark} w="w-16" />
                <SkeletonButton isDark={isDark} w="w-16" />
              </div>
            </div>

            <div className="space-y-2">
              <div
                className={`h-16 rounded-2xl ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-24 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
              <div className="flex-1 space-y-2">
                <SkeletonLine isDark={isDark} w="w-44" />
                <SkeletonLine isDark={isDark} w="w-60" />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-28 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <SkeletonPill isDark={isDark} w="w-28" />
          </div>

          <div className={`rounded-2xl border px-4 py-4 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-32 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <SkeletonLine isDark={isDark} w="w-24" />
                  <SkeletonLine
                    isDark={isDark}
                    w={index % 2 === 0 ? "w-52" : "w-40"}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`flex h-full flex-col rounded-2xl border shadow-sm ${card}`}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${borderSoft}`}
          >
            <div className="min-w-0">
              <div
                className={`h-4 w-36 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
              <div className="mt-2 space-y-2">
                <SkeletonLine isDark={isDark} w="w-64" />
                <SkeletonLine isDark={isDark} w="w-48" />
              </div>
            </div>

            <div
              className={`h-7 w-7 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center">
                    <div
                      className={`h-8 w-8 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                    />
                  </div>

                  <div className="flex-1">
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        isDark
                          ? "border-slate-900 bg-slate-900/40"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <SkeletonLine
                            isDark={isDark}
                            w={index % 2 === 0 ? "w-56" : "w-44"}
                          />
                          <SkeletonLine
                            isDark={isDark}
                            w={index % 2 === 0 ? "w-36" : "w-52"}
                          />
                        </div>
                        <SkeletonLine isDark={isDark} w="w-24" />
                      </div>

                      <div className="space-y-2">
                        <SkeletonLine isDark={isDark} w="w-full" />
                        <SkeletonLine
                          isDark={isDark}
                          w={index % 3 === 0 ? "w-5/6" : "w-2/3"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineAlert({
  title,
  message,
  tone = "warning",
  onClose,
  isDark = false,
}: {
  title?: string;
  message: string;
  tone?: "warning" | "danger" | "info";
  onClose?: () => void;
  isDark?: boolean;
}) {
  const toneClasses = (() => {
    if (tone === "danger") {
      return isDark
        ? "border-rose-900/60 bg-rose-950/40 text-rose-200"
        : "border-rose-200 bg-rose-50 text-rose-800";
    }
    if (tone === "info") {
      return isDark
        ? "border-sky-900/60 bg-sky-950/40 text-sky-100"
        : "border-sky-200 bg-sky-50 text-sky-900";
    }

    return isDark
      ? "border-amber-900/60 bg-amber-950/35 text-amber-100"
      : "border-amber-200 bg-amber-50 text-amber-900";
  })();

  const icon = tone === "danger" ? "!" : tone === "info" ? "i" : "!";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={[
              "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold",
              isDark
                ? "border-white/10 bg-white/5"
                : "border-black/10 bg-white/60",
            ].join(" ")}
          >
            {icon}
          </div>
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold">{title}</div>}
            <div className="mt-0.5 text-xs leading-relaxed opacity-90">
              {message}
            </div>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
            title="Dismiss"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "warning",
  loading,
  onConfirm,
  onCancel,
  isDark = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "warning" | "danger" | "info";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDark?: boolean;
}) {
  if (!open) return null;

  const shell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const borderSoft = isDark ? "border-slate-900" : "border-slate-100";
  const footer = isDark ? "bg-slate-900/40" : "bg-slate-50";
  const titleCls = isDark ? "text-slate-100" : "text-slate-900";
  const msgCls = isDark ? "text-slate-300" : "text-slate-600";

  const toneBadge = (() => {
    if (tone === "danger") {
      return isDark
        ? "bg-rose-500/15 text-rose-200 ring-rose-900/40"
        : "bg-rose-50 text-rose-700 ring-rose-200";
    }
    if (tone === "info") {
      return isDark
        ? "bg-sky-500/15 text-sky-200 ring-sky-900/40"
        : "bg-sky-50 text-sky-700 ring-sky-200";
    }

    return isDark
      ? "bg-amber-500/15 text-amber-100 ring-amber-900/40"
      : "bg-amber-50 text-amber-800 ring-amber-200";
  })();

  const confirmBtn =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : tone === "info"
        ? "bg-sky-600 hover:bg-sky-700 text-white"
        : "bg-amber-600 hover:bg-amber-700 text-white";

  const cancelBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="absolute inset-0" onClick={onCancel} />

      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${shell}`}
      >
        <div
          className={`flex items-start gap-3 border-b px-5 py-4 ${borderSoft}`}
        >
          <span
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 text-xs font-bold",
              toneBadge,
            ].join(" ")}
          >
            {tone === "danger" ? "!" : tone === "info" ? "i" : "!"}
          </span>

          <div className="min-w-0">
            <div className={`text-sm font-semibold ${titleCls}`}>{title}</div>
            <div className={`mt-1 text-xs leading-relaxed ${msgCls}`}>
              {message}
            </div>
          </div>
        </div>

        <div
          className={`flex items-center justify-end gap-2 px-5 py-3 ${footer}`}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer",
              cancelBtn,
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              confirmBtn,
            ].join(" ")}
          >
            {loading ? "Working..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
