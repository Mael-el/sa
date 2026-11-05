import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SANTÉ+ — Votre santé, connectée",
  description: "La plateforme de santé numérique béninoise qui relie patients, médecins et établissements autour d'un dossier médical unique.",
  applicationName: "SANTÉ+ Bénin",
  keywords: ["SANTÉ+", "santé numérique", "Bénin", "dossier médical", "rendez-vous médical"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
