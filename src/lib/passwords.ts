const COMMON_PASSWORDS = new Set([
  "motdepasse123",
  "password1234",
  "azertyuiop12",
  "123456789012",
  "santeplus2026",
  "administrateur",
  "motdepasse2026",
  "qwertyuiop12",
  "iloveyou1234",
  "benin20262026",
]);

/**
 * Règles de robustesse des mots de passe utilisables côté client et côté serveur.
 * Fichier isolé sans dépendance à 'pg' ni à la base de données.
 */
export function passwordProblem(password: string, context: { email?: string; fullName?: string } = {}): string | null {
  if (typeof password !== "string" || password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (password.length > 128) return "Le mot de passe ne doit pas dépasser 128 caractères.";
  if (!/\p{L}/u.test(password)) return "Le mot de passe doit contenir au moins une lettre.";
  if (!/\d/.test(password)) return "Le mot de passe doit contenir au moins un chiffre.";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "Ce mot de passe est trop courant. Choisissez-en un autre.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Le mot de passe ne doit pas contenir votre adresse email.";
  const name = context.fullName?.toLowerCase().split(/\s+/).find((part) => part.length >= 4);
  if (name && lower.includes(name)) return "Le mot de passe ne doit pas contenir votre nom.";
  if (/(.)\1{5,}/.test(password)) return "Le mot de passe contient trop de caractères répétés.";
  return null;
}
