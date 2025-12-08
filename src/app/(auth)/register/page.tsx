// src/app/register/page.tsx
import type { Metadata } from "next";
import { RegisterPageClient } from "../../../components/RegisterPageClient";

export const metadata: Metadata = {
  title: "Register",
};

export default function RegisterPage() {
  // This is a Server Component that just renders the client one
  return <RegisterPageClient />;
}
