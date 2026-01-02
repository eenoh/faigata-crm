import type { Metadata } from "next";
import ProductFormClient from "@/modules/billing/components/ProductFormClient";

export const metadata: Metadata = {
  title: "Edit Product",
  description: "Update product name/description and sync to Stripe.",
};

export default function EditProductPage({ params }: { params: { id: string } }) {
  return <ProductFormClient mode="edit" productId={params.id} />;
}
