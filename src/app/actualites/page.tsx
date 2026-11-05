import type { Metadata } from "next";
import { NewsPageClient } from "@/components/news-page";

export const metadata: Metadata = {
  title: "Actualités & Prévention Santé — SANTÉ+",
  description:
    "Suivez les actualités médicales, les campagnes de santé publique et les conseils de prévention au Bénin avec SANTÉ+.",
};

export default function ActualitesPage() {
  return <NewsPageClient />;
}
