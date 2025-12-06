import type { Metadata } from "next";
import { NewLeadClient } from "../../../../modules/crm/components/NewLeadClient";

export const metadata: Metadata = {
  title: "Add lead",
};

export default function NewLeadPage() {
  return <NewLeadClient />;
}
