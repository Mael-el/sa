import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
// Polices auto-hébergées : aucun appel à fonts.googleapis.com, qui laissait le site
// s'afficher en police système lorsque le CDN était bloqué.
import "@fontsource-variable/figtree";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { themeBootstrapScript } from "@/components/theme-toggle";
import { SiteShortcuts } from "@/components/public-shortcuts";

export const metadata: Metadata = {
  title: "SANTÉ+ — Votre santé, connectée",
  description: "La plateforme de santé numérique béninoise qui relie patients, médecins et établissements autour d'un dossier médical unique.",
  applicationName: "SANTÉ+ Bénin",
  keywords: ["SANTÉ+", "santé numérique", "Bénin", "dossier médical", "rendez-vous médical"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Applique le thème avant le premier rendu : sans ce script, un flash
            blanc apparaît à chaque chargement en thème sombre. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrapScript}
        </Script>
        {children}
        {/* AYABA et le choix du thème restent accessibles partout, y compris
            avant la création d'un compte. */}
        <SiteShortcuts />
      </body>
    </html>
  );
}
