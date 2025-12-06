// src/app/(app)/settings/profile/page.tsx
import type { Metadata } from "next";
import ProfileSettingsClient from "../../../../modules/crm/components/ProfileSettingsClient";

export const metadata: Metadata = {
  title: "Profile Settings",
  description: "Manage your name, role, and profile picture in FaigataCRM.",
};

export default function ProfilePage() {
  return <ProfileSettingsClient />;
}
