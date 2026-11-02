import { DashboardApp } from "@/components/dashboard-app";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <DashboardApp demoEnabled={process.env.ENABLE_DEMO_MODE === "true"} />;
}
