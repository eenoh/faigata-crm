import type { Metadata } from "next";
import ProductSuitePageClient from "../../components/ProductSuitePageClient";

export const metadata: Metadata = {
  title: "Product Suite",
  description: "See all Faigata products and open your CRM teams.",
};

export default function ProductSuitePage() {
  return <ProductSuitePageClient />;
}
