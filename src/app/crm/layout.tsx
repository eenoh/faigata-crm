import type { ReactNode } from "react";
import type { Metadata } from "next";
import ProductSuiteShellClient from "@/components/layout/ProductSuiteShellClient";

export const metadata: Metadata = {
  title: "Faigata • Product Suite",
  description:
    "Switch between your Faigata products and open the teams you work in.",
};

export default function ProductSuiteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProductSuiteShellClient>{children}</ProductSuiteShellClient>;
}
