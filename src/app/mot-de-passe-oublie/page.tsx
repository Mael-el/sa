import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mot de passe oublié — SANTÉ+", description: "Demandez la réinitialisation de votre mot de passe SANTÉ+." };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
