import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Créer un compte patient — SANTÉ+", description: "Ouvrez votre espace patient SANTÉ+ en quelques minutes." };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/espace");
  const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, "registrations_open")).limit(1);
  return <RegisterForm registrationsOpen={setting?.value === "true"} />;
}
