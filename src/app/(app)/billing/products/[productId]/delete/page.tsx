// src/app/(app)/billing/products/[productId]/delete/page.tsx
import type { Metadata } from "next";
import ProductArchiveClient from "@/modules/billing/components/ProductArchiveClient";

export const metadata: Metadata = {
  title: "Archive Product",
  description: "Archive a product in Stripe (sets active=false).",
};

export default async function ArchiveProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductArchiveClient productId={productId} />;
}
