import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { DashboardApp } from "@/components/dashboard-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mon espace — SANTÉ+", description: "Votre espace santé personnel SANTÉ+." };

export default async function SpacePage() {
  // Protection serveur : aucune donnée n'est rendue sans session valide.
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return <DashboardApp />;
}
