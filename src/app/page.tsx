import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PublicLanding } from "@/components/public-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (await getSessionUser()) redirect("/espace");
  return <PublicLanding />;
}
