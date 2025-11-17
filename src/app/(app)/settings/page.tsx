// src/app/(app)/settings/page.tsx
import type { Metadata } from "next";
import SettingsPageClient from "./SettingsPageClient";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Configure your FaigataCRM workspace, manage lead fields, and update your personal profile and account settings.",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
