import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envoi d'emails transactionnels.
 *
 * Le transport est entièrement optionnel : sans `SMTP_HOST`, l'application
 * fonctionne exactement comme avant et l'administration remet les codes de vive
 * voix. Aucun envoi n'échoue donc à cause d'une configuration absente — mais
 * aucun envoi non plus n'est simulé : on ne prétend jamais avoir écrit à
 * quelqu'un.
 *
 * Aucun contenu de santé ne transite par email : uniquement des codes à usage
 * unique, des invitations de compte et des alertes de sécurité. Un email se
 * lit en clair chez un intermédiaire, et ne doit jamais révéler un diagnostic.
 */

type TransportState = { transporter: Transporter; from: string } | null;

let cached: TransportState | undefined;

function transport(): TransportState {
  if (cached !== undefined) return cached;

  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) { cached = null; return cached; }

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  cached = {
    transporter: nodemailer.createTransport({
      host,
      port,
      // 465 suppose TLS dès la connexion, 587 une montée via STARTTLS.
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
      // Un serveur SMTP lent ne doit pas bloquer une requête utilisateur.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    }),
    from,
  };
  return cached;
}

export function mailEnabled() {
  return transport() !== null;
}

export type MailResult = { sent: boolean; reason?: string };

/**
 * Envoie un message. Ne lève jamais : l'appelant décide de la suite, et une
 * panne SMTP ne doit pas empêcher un patient de réinitialiser son mot de passe
 * par un autre canal.
 */
export async function sendMail(options: { to: string | null | undefined; subject: string; text: string; html?: string }): Promise<MailResult> {
  const state = transport();
  if (!state) return { sent: false, reason: "SMTP non configuré" };
  if (!options.to) return { sent: false, reason: "Destinataire absent" };

  try {
    await state.transporter.sendMail({
      from: state.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { sent: true };
  } catch (error) {
    // Le détail part dans les logs serveur ; l'appelant ne reçoit qu'un constat.
    console.error("Échec d'envoi d'email", error);
    return { sent: false, reason: "Échec du transport SMTP" };
  }
}

/** Gabarit commun : sobre, lisible en texte brut, sans image ni pixel de suivi. */
function layout(title: string, body: string) {
  return {
    text: `${title}\n\n${body}\n\n— SANTÉ+ Bénin\nLa santé connectée\n\nCe message est automatique. Ne répondez pas à cet email. Si vous n'êtes pas à l'origine de cette demande, ignorez-le et contactez l'administration.`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f2a43">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="background:#0f2a43;border-radius:12px 12px 0 0;padding:22px 26px;color:#ffffff">
    <strong style="font-size:19px;letter-spacing:-.4px">SANTÉ<span style="color:#60a5fa">+</span></strong>
    <div style="font-size:10px;letter-spacing:2px;color:#8fb0d4;margin-top:4px">LA SANTÉ CONNECTÉE</div>
  </div>
  <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px 26px;border:1px solid #e3eaf3;border-top:0">
    <h1 style="margin:0 0 14px;font-size:18px;color:#0f2a43">${title}</h1>
    <div style="font-size:14px;line-height:1.65;color:#334155">${body}</div>
  </div>
  <p style="font-size:11px;line-height:1.6;color:#94a3b8;margin:18px 0 0">Ce message est automatique, ne répondez pas. Si vous n'êtes pas à l'origine de cette demande, ignorez-le et contactez l'administration.</p>
</div></body></html>`,
  };
}

export async function sendPasswordResetCode(options: { to: string | null; fullName: string; code: string; minutes: number }): Promise<MailResult> {
  const { text, html } = layout(
    "Réinitialisation de votre mot de passe",
    `Bonjour ${escapeHtml(options.fullName)},<br><br>Un code de réinitialisation a été émis pour votre compte SANTÉ+.<br><br>
<div style="font-size:26px;font-weight:700;letter-spacing:4px;color:#0f2a43;background:#f1f5f9;border-radius:10px;padding:16px;text-align:center;margin:6px 0 16px">${options.code}</div>
Ce code est à usage unique et expire dans <strong>${options.minutes} minutes</strong>. Il révoquera vos autres sessions actives.`,
  );
  return sendMail({ to: options.to, subject: "SANTÉ+ · Code de réinitialisation", text, html });
}

export async function sendAccountInvitation(options: { to: string | null; fullName: string; temporaryPassword: string; supportEmail?: string }): Promise<MailResult> {
  const { text, html } = layout(
    "Votre compte professionnel est créé",
    `Bonjour ${escapeHtml(options.fullName)},<br><br>Un compte vous a été ouvert sur SANTÉ+.<br><br>
<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:6px 0 16px">
  <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Identifiant</div>
  <div style="font-size:14px;font-weight:600;margin-bottom:10px">${escapeHtml(options.to || "")}</div>
  <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Mot de passe temporaire</div>
  <div style="font-size:15px;font-weight:600;font-family:ui-monospace,monospace">${escapeHtml(options.temporaryPassword)}</div>
</div>
Vous devrez choisir un mot de passe définitif à la première connexion.${options.supportEmail ? `<br><br>En cas de difficulté : ${escapeHtml(options.supportEmail)}` : ""}`,
  );
  return sendMail({ to: options.to, subject: "SANTÉ+ · Votre compte professionnel", text, html });
}

export async function sendSecurityAlert(options: { to: string | null; fullName: string; message: string }): Promise<MailResult> {
  const { text, html } = layout(
    "Alerte de sécurité",
    `Bonjour ${escapeHtml(options.fullName)},<br><br>${options.message}<br><br>Si vous n'êtes pas à l'origine de cette action, changez votre mot de passe et prévenez l'administration.`,
  );
  return sendMail({ to: options.to, subject: "SANTÉ+ · Alerte de sécurité", text, html });
}

/** Les noms saisis par les utilisateurs ne doivent pas injecter de balisage. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] as string));
}
