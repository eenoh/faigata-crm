// src/app/invite/accept/page.tsx
import type { Metadata } from "next";
import AcceptInviteClient from "../../../modules/crm/components/AcceptInviteClient";

export const metadata: Metadata = {
  title: "Accept your Invitation",
  description:
    "Join your Faigata team, create your account, and start working with your team.",
};

export default function Page() {
  return <AcceptInviteClient />;
}
