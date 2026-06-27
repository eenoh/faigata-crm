import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CallDetailClient from "@/features/crm/components/CallDetailClient";

type PageParams = { id: string; bookingId: string };
type PageProps = { params: Promise<PageParams> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params);
  const leadId = String(resolved?.id ?? "").trim();

  const t = await getTranslations("CallDetailPage.metadata");

  return {
    title: t("title"),
    description: t("description", { id: leadId }),
  };
}

export default async function CallDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const id = String(resolved?.id ?? "").trim();
  const bookingId = String(resolved?.bookingId ?? "").trim();

  return (
    <div className="p-6">
      <CallDetailClient leadId={id} bookingId={bookingId} />
    </div>
  );
}
