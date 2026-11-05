/**
 * Utilitaire de copie sécurisée dans le presse-papiers avec gestion
 * des restrictions de politique de permissions (iframe / permissions-policy).
 *
 * Tente d'abord l'API moderne navigator.clipboard.writeText.
 * En cas de rejet (ex: NotAllowedError sous iframe), bascule sur un repli
 * textarea + document.execCommand sans lever d'exception non interceptée.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  // 1. Tenter l'API moderne dans un bloc try/catch
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Rejeté par la politique de permissions (ex: iframe sans clipboard-write)
      // On continue vers le repli ci-dessous
    }
  }

  // 2. Repli classique via élément textarea masqué
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.style.opacity = "0";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return Boolean(success);
  } catch {
    return false;
  }
}
