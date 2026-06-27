import type { AppLocale } from "@/i18n/config";

type TranslateFn = (key: string) => string;

function normalizeCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeAttendanceStatus(
  value: unknown,
): "attended" | "no_show" | "cancelled" | "rescheduled" | "unknown" {
  switch (normalizeCode(value)) {
    case "attended":
      return "attended";
    case "no_show":
    case "noshow":
      return "no_show";
    case "cancelled":
      return "cancelled";
    case "rescheduled":
      return "rescheduled";
    case "unknown":
    case "":
      return "unknown";
    default:
      return "unknown";
  }
}

export function normalizePaymentStatus(value: unknown): string {
  switch (normalizeCode(value)) {
    case "succeeded":
    case "processing":
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "requires_capture":
    case "canceled":
    case "failed":
      return normalizeCode(value);
    case "":
      return "";
    default:
      return normalizeCode(value);
  }
}

export function normalizeInvoiceStatus(value: unknown): string {
  switch (normalizeCode(value)) {
    case "paid":
    case "open":
    case "draft":
    case "void":
    case "uncollectible":
      return normalizeCode(value);
    case "":
      return "";
    default:
      return normalizeCode(value);
  }
}

export function getAttendanceStatusTone(value: unknown, isDark: boolean) {
  switch (normalizeAttendanceStatus(value)) {
    case "attended":
      return isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
        : "bg-emerald-50/60 text-emerald-700 ring-emerald-200";
    case "no_show":
      return isDark
        ? "bg-rose-500/15 text-rose-200 ring-rose-400/30"
        : "bg-rose-50/60 text-rose-700 ring-rose-200";
    case "rescheduled":
      return isDark
        ? "bg-amber-500/15 text-amber-200 ring-amber-400/30"
        : "bg-amber-50/60 text-amber-800 ring-amber-200";
    case "cancelled":
    case "unknown":
    default:
      return isDark
        ? "bg-slate-500/15 text-slate-200 ring-slate-400/25"
        : "bg-slate-100/70 text-slate-700 ring-slate-200";
  }
}

export function getPaymentStatusTone(value: unknown, isDark: boolean) {
  switch (normalizePaymentStatus(value)) {
    case "succeeded":
      return isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700";
    case "processing":
      return isDark
        ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30"
        : "bg-indigo-50 text-indigo-700";
    case "requires_action":
    case "requires_confirmation":
    case "requires_capture":
      return isDark
        ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"
        : "bg-amber-50 text-amber-800";
    case "requires_payment_method":
    case "failed":
    case "canceled":
      return isDark
        ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
        : "bg-rose-50 text-rose-700";
    default:
      return isDark
        ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
        : "bg-slate-100 text-slate-600";
  }
}

export function getInvoiceStatusTone(value: unknown, isDark: boolean) {
  switch (normalizeInvoiceStatus(value)) {
    case "paid":
      return isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700";
    case "open":
      return isDark
        ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30"
        : "bg-indigo-50 text-indigo-700";
    case "uncollectible":
      return isDark
        ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"
        : "bg-amber-50 text-amber-800";
    case "void":
      return isDark
        ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
        : "bg-rose-50 text-rose-700";
    case "draft":
    default:
      return isDark
        ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
        : "bg-slate-100 text-slate-600";
  }
}

export function getEmptyLabel(t: TranslateFn, value: unknown) {
  return normalizeCode(value) ? String(value).trim() : t("fallbacks.empty");
}

export function getLeadTypeLabel(t: TranslateFn, value: unknown) {
  switch (normalizeCode(value)) {
    case "individual":
      return t("crm.leadType.individual");
    case "business":
      return t("crm.leadType.business");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getLeadGenderLabel(t: TranslateFn, value: unknown) {
  switch (normalizeCode(value)) {
    case "male":
      return t("crm.gender.male");
    case "female":
      return t("crm.gender.female");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getLeadContactTypeLabel(t: TranslateFn, value: unknown) {
  switch (normalizeCode(value)) {
    case "email":
      return t("crm.contactType.email");
    case "phone":
      return t("crm.contactType.phone");
    case "linkedin":
      return t("crm.contactType.linkedin");
    case "instagram":
      return t("crm.contactType.instagram");
    case "facebook":
      return t("crm.contactType.facebook");
    case "reddit":
      return t("crm.contactType.reddit");
    case "twitter_x":
    case "twitterx":
      return t("crm.contactType.twitterX");
    case "whatsapp":
      return t("crm.contactType.whatsapp");
    case "telegram":
      return t("crm.contactType.telegram");
    case "tiktok":
      return t("crm.contactType.tiktok");
    case "youtube":
      return t("crm.contactType.youtube");
    case "snapchat":
      return t("crm.contactType.snapchat");
    case "discord":
      return t("crm.contactType.discord");
    case "slack":
      return t("crm.contactType.slack");
    case "wechat":
      return t("crm.contactType.wechat");
    case "line":
      return t("crm.contactType.line");
    case "signal":
      return t("crm.contactType.signal");
    case "other":
      return t("crm.contactType.other");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getLeadSourceCategoryLabel(t: TranslateFn, value: unknown) {
  switch (normalizeCode(value)) {
    case "inbound":
      return t("crm.sourceCategory.inbound");
    case "outbound":
      return t("crm.sourceCategory.outbound");
    case "referral":
      return t("crm.sourceCategory.referral");
    case "partner":
      return t("crm.sourceCategory.partner");
    case "purchased":
      return t("crm.sourceCategory.purchased");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getLeadSourceNameLabel(t: TranslateFn, value: unknown) {
  switch (normalizeCode(value)) {
    case "instagram":
    case "facebook":
    case "reddit":
    case "other":
      return getLeadContactTypeLabel(t, value);
    case "twitter_x":
    case "twitterx":
      return getLeadContactTypeLabel(t, "twitter_x");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getAttendanceStatusLabel(t: TranslateFn, value: unknown) {
  switch (normalizeAttendanceStatus(value)) {
    case "attended":
      return t("crm.attendance.attended");
    case "no_show":
      return t("crm.attendance.noShow");
    case "cancelled":
      return t("crm.attendance.cancelled");
    case "rescheduled":
      return t("crm.attendance.rescheduled");
    case "unknown":
      return t("crm.attendance.unknown");
    default:
      return t("fallbacks.unknown");
  }
}

export function getPaymentStatusLabel(t: TranslateFn, value: unknown) {
  switch (normalizePaymentStatus(value)) {
    case "succeeded":
      return t("billing.paymentStatus.succeeded");
    case "processing":
      return t("billing.paymentStatus.processing");
    case "requires_payment_method":
      return t("billing.paymentStatus.requiresPaymentMethod");
    case "requires_confirmation":
      return t("billing.paymentStatus.requiresConfirmation");
    case "requires_action":
      return t("billing.paymentStatus.requiresAction");
    case "requires_capture":
      return t("billing.paymentStatus.requiresCapture");
    case "canceled":
      return t("billing.paymentStatus.canceled");
    case "failed":
      return t("billing.paymentStatus.failed");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getInvoiceStatusLabel(t: TranslateFn, value: unknown) {
  switch (normalizeInvoiceStatus(value)) {
    case "paid":
      return t("billing.invoiceStatus.paid");
    case "open":
      return t("billing.invoiceStatus.open");
    case "draft":
      return t("billing.invoiceStatus.draft");
    case "void":
      return t("billing.invoiceStatus.void");
    case "uncollectible":
      return t("billing.invoiceStatus.uncollectible");
    case "":
      return t("fallbacks.empty");
    default:
      return t("fallbacks.unknown");
  }
}

export function getIntlLocale(locale: string | undefined): string | undefined {
  return locale as AppLocale | undefined;
}
