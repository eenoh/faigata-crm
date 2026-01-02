import type { Metadata } from "next";
import ProductFormClient from "@/modules/billing/components/ProductFormClient";

export const metadata: Metadata = {
  title: "New Product",
  description: "Create a new product in Stripe and sync it to your catalog.",
};

export default function NewProductPage() {
  return <ProductFormClient mode="create" />;
}
