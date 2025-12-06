import type { Metadata } from "next";
import { EditLeadClient } from "../../../../../modules/crm/components/EditLeadClient";


export const metadata: Metadata = {
  title: "Edit Lead",
  description:
    "Change the Data associated with that Lead",
};


export default function EditLeadPage() {
  return <EditLeadClient />;
}
