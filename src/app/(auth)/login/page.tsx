// src/app/login/page.tsx
import type { Metadata } from "next";
import { LoginPageClient } from "../../../components/LoginPageClient";

export const metadata: Metadata = {
  title: "Login",
};

export default function LoginPage() {
  return <LoginPageClient />;
}
