"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

/**
 * Écran d'erreur applicatif.
 *
 * Sans ce fichier, une exception de rendu côté client laissait une page blanche :
 * impossible de distinguer un problème de session d'un plantage d'interface.
 * Ici l'erreur est rendue lisible et l'utilisateur peut relancer le rendu.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur d'interface", error);
  }, [error]);

  return (
    <div className="loading-screen">
      <div className="loading-brand">
        <span className="brand-mark"><AlertCircle size={24} strokeWidth={3} /></span>
        <span>SANTÉ<span>+</span></span>
      </div>
      <p style={{ maxWidth: 460, textAlign: "center", lineHeight: 1.6 }}>
        Une erreur inattendue a interrompu l’affichage de votre espace.
        Vos données n’ont pas été modifiées.
      </p>
      {error.digest && <p className="form-help">Référence technique : {error.digest}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" onClick={reset}><RotateCcw size={16} />Réessayer</button>
        <a className="btn btn-outline" href="/connexion">Se reconnecter</a>
      </div>
    </div>
  );
}
