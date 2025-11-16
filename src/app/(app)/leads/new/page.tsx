import type { Metadata } from "next";
import { NewLeadClient } from "./NewLeadClient";

export const metadata: Metadata = {
  title: "Add lead",
};

export default function NewLeadPage() {
  return <NewLeadClient />;
}
