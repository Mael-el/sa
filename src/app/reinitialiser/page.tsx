import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Réinitialiser le mot de passe — SANTÉ+", description: "Réinitialisez votre mot de passe SANTÉ+ avec un code à usage unique." };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
