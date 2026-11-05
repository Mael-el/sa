"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WelcomeScreen } from "@/components/welcome-screen";

/**
 * Page d'accueil publique : les appels à l'action ouvrent les pages dédiées
 * (/inscription, /connexion). La modale reste disponible pour la demande
 * d'accès professionnel, qui ne dispose pas encore de page dédiée.
 */
export function PublicLanding() {
  const router = useRouter();
  const [accessOpen, setAccessOpen] = useState(false);

  return (
    <WelcomeScreen
      authOpen={accessOpen}
      authStage="access"
      onAuthClose={() => setAccessOpen(false)}
      onAuthOpen={(stage) => {
        if (stage === "access") { setAccessOpen(true); return; }
        router.push(stage === "register" ? "/inscription" : "/connexion");
      }}
      onAuthenticated={async () => { router.replace("/espace"); router.refresh(); }}
      toast={() => {}}
    />
  );
}
