"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AyabaPanel } from "@/components/ayaba-assistant";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Raccourcis permanents du site public : AYABA et le choix du thème.
 *
 * Un visiteur qui hésite à créer un compte doit pouvoir poser sa question avant
 * de s'inscrire, et lire le site dans le thème de son choix. Les deux commandes
 * flottent donc au-dessus de toutes les pages publiques, comme dans l'espace
 * connecté où elles sont intégrées à la barre supérieure.
 *
 * AYABA répond sans compte à partir de la base de connaissances commune ;
 * les réponses propres à un rôle nécessitent une session.
 */
/**
 * Point d'entrée monté par le layout racine. L'espace connecté possède déjà ses
 * propres commandes dans la barre supérieure : on évite donc un doublon.
 */
export function SiteShortcuts() {
  const pathname = usePathname();
  if (pathname.startsWith("/espace")) return null;
  return <PublicShortcuts />;
}

export function PublicShortcuts() {
  const [ayabaOpen, setAyabaOpen] = useState(false);

  return (
    <>
      <div className="public-shortcuts">
        <ThemeToggle compact />
      </div>

      <button
        type="button"
        className="ayaba-launcher"
        onClick={() => setAyabaOpen(true)}
        aria-label="Ouvrir AYABA, assistante SANTÉ+"
      >
        AYABA
      </button>

      <AyabaPanel open={ayabaOpen} onClose={() => setAyabaOpen(false)} visitor />
    </>
  );
}
