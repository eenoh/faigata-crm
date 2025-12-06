import type { Metadata } from "next";
import { DeleteLeadClient } from "../../../../../modules/crm/components/DeleteLeadClient";

export const metadata: Metadata = {
  title: "Delete Lead",
  description:
    "Delete the Lead",
};

export default function DeleteLeadPage() {
  return <DeleteLeadClient />;
}
