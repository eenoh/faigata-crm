import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CallOutcomeClient from "@/features/crm/components/CallOutcomeClient";

type PageProps = {
  params: Promise<{ id: string; bookingId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CallOutcomePage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function CallOutcomePage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const id = String(resolved?.id ?? "").trim();
  const bookingId = String(resolved?.bookingId ?? "").trim();

  return (
    <div className="p-6">
      <CallOutcomeClient leadId={id} bookingId={bookingId} />
    </div>
  );
}
