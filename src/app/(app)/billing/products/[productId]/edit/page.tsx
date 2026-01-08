// src/app/(app)/billing/products/[productId]/edit/page.tsx
import type { Metadata } from "next";
import ProductFormClient from "@/modules/billing/components/ProductFormClient";

export const metadata: Metadata = {
  title: "Edit Product",
  description: "Update product name/description and sync to Stripe.",
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;

  return <ProductFormClient mode="edit" productId={productId} />;
}
