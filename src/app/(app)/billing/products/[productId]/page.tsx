// src/app/(app)/billing/products/[productId]/page.tsx
import type { Metadata } from "next";
import ProductDetailClient from "@/modules/billing/components/ProductDetailClient";

export const metadata: Metadata = {
  title: "Product",
  description: "View product details, prices, and activity timeline.",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductDetailClient productId={productId} />;
}
