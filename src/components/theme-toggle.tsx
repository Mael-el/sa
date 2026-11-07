"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Thème d'affichage : clair, sombre, ou celui du système.
 *
 * Le choix est enregistré dans le navigateur, pas sur le compte : il suit
 * l'appareil. Un patient qui consulte son dossier le soir sur son téléphone et
 * le lendemain sur l'ordinateur d'un proche n'a pas à retrouver un thème imposé.
 *
 * Le thème est appliqué par l'attribut `data-theme` sur `<html>`, et le script
 * inline du layout le pose avant le premier rendu : sans cela, un flash blanc
 * apparaît à chaque chargement.
 */

export type ThemeChoice = "light" | "dark" | "system";
const STORAGE_KEY = "sante_theme";

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

/** Script injecté avant le rendu : évite le clignotement au chargement. */
export const themeBootstrapScript = `
(function(){try{
  var stored = localStorage.getItem('${STORAGE_KEY}');
  var choice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
  var resolved = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : choice;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}catch(e){}})();
`;

/* ---- Petite réserve d'état partagée par tous les sélecteurs de la page ---- */

const listeners = new Set<() => void>();
let cached: ThemeChoice | null = null;

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
}

function getSnapshot(): ThemeChoice {
  if (cached === null) cached = readChoice();
  return cached;
}

function getServerSnapshot(): ThemeChoice {
  return "light";
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    cached = readChoice();
    applyTheme(cached);
    emit();
  };
  // Le thème « système » doit suivre le réglage de l'OS en direct.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if (getSnapshot() === "system") applyTheme("system");
  };

  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSchemeChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSchemeChange);
  };
}

export function useThemeChoice() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setThemeChoice(choice: ThemeChoice) {
  cached = choice;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* navigation privée : le thème reste valable pour l'onglet courant */
  }
  applyTheme(choice);
  emit();
}

const OPTIONS: { value: ThemeChoice; label: string; short: string; icon: typeof Sun }[] = [
  { value: "light", label: "Thème clair", short: "Clair", icon: Sun },
  { value: "dark", label: "Thème sombre", short: "Sombre", icon: Moon },
  { value: "system", label: "Thème du système", short: "Système", icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const choice = useThemeChoice();

  return (
    <div className={`theme-toggle ${compact ? "theme-toggle-compact" : ""}`} role="group" aria-label="Choix du thème">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            className={choice === option.value ? "active" : ""}
            onClick={() => setThemeChoice(option.value)}
            aria-label={option.label}
            aria-pressed={choice === option.value}
            title={option.label}
          >
            <Icon size={15} />
            {!compact && <span>{option.short}</span>}
          </button>
        );
      })}
    </div>
  );
}
