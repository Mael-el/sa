import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connexion — SANTÉ+", description: "Connectez-vous à votre espace santé SANTÉ+." };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/espace");
  return <LoginForm />;
}
