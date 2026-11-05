"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, Phone, ShieldCheck } from "lucide-react";
import { passwordProblem } from "@/lib/passwords";

const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

async function authRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Une erreur est survenue. Réessayez.");
  return result;
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return <div className="auth-page">
    <aside className="auth-aside">
      <Link href="/" className="auth-aside-brand"><span className="brand-mark"><HeartPulse size={20} strokeWidth={2.6} /></span><strong>SANTÉ<span>+</span></strong></Link>
      <div className="auth-aside-body">
        <h1>Votre dossier médical, entre vos mains.</h1>
        <p>Un espace personnel sécurisé pour suivre vos soins, vos rendez-vous et vos documents de santé au Bénin.</p>
        <ul>
          <li><ShieldCheck size={17} />Consentement de soins révocable</li>
          <li><LockKeyhole size={17} />Sessions chiffrées et accès audités</li>
          <li><HeartPulse size={17} />Identifiant Santé+ et QR code personnels</li>
        </ul>
      </div>
      <p className="auth-aside-foot">Phase pilote · Données de santé protégées</p>
    </aside>
    <main className="auth-main">
      <div className="auth-card">
        <Link href="/" className="auth-back"><ArrowLeft size={15} />Retour à l’accueil</Link>
        <h2>{title}</h2>
        <p className="auth-lead">{subtitle}</p>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </main>
  </div>;
}

function FieldError({ message }: { message: string }) {
  return message ? <div className="form-error" role="alert">{message}</div> : null;
}

/* ------------------------------------------------------------------ */
/* Connexion                                                           */
/* ------------------------------------------------------------------ */

type Pending = { stage: "2fa"; challenge: string } | { stage: "2fa-setup"; challenge: string; secret: string; otpauth: string } | { stage: "password-change"; challenge: string } | null;

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const finish = () => { router.replace("/espace"); router.refresh(); };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      const result = await authRequest({ action: "login", identifier: identifier.trim(), password });
      if (result.needs2FASetup) { setPending({ stage: "2fa-setup", challenge: result.challenge, secret: result.setupSecret, otpauth: result.otpauthUrl }); return; }
      if (result.needs2FA) { setPending({ stage: "2fa", challenge: result.challenge }); return; }
      if (result.needsPasswordChange) { setPending({ stage: "password-change", challenge: result.challenge }); return; }
      finish();
    } catch (err) { setError(err instanceof Error ? err.message : "Connexion impossible."); }
    finally { setLoading(false); }
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      if (!pending) return;
      const result = await authRequest({ action: "verify2fa", challenge: pending.challenge, code: otp });
      if (result.needsPasswordChange) { setPending({ stage: "password-change", challenge: result.challenge }); return; }
      finish();
    } catch (err) { setError(err instanceof Error ? err.message : "Code refusé."); }
    finally { setLoading(false); }
  };

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    const weakness = passwordProblem(newPassword, { email: identifier });
    if (weakness) { setError(weakness); return; }
    setLoading(true);
    try {
      if (!pending) return;
      await authRequest({ action: "completePasswordChange", challenge: pending.challenge, newPassword, confirmPassword, privacyConsent: true });
      finish();
    } catch (err) { setError(err instanceof Error ? err.message : "Changement impossible."); }
    finally { setLoading(false); }
  };

  if (pending?.stage === "2fa-setup") return <AuthShell title="Configurez la double authentification" subtitle="Obligatoire pour les comptes professionnels et administrateurs." footer={null}>
    <form className="form-stack" onSubmit={submitOtp}>
      <div className="totp-qr"><QRCodeSVG value={pending.otpauth} size={168} /></div>
      <label className="field"><span>Clé de configuration manuelle</span><code className="totp-secret">{pending.secret}</code></label>
      <label className="field"><span>Code à 6 chiffres</span><input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required /></label>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading || otp.length !== 6}>{loading ? "Vérification..." : "Activer la 2FA"}<ShieldCheck size={17} /></button>
    </form>
  </AuthShell>;

  if (pending?.stage === "2fa") return <AuthShell title="Vérification en deux étapes" subtitle="Saisissez le code généré par votre application d’authentification.">
    <form className="form-stack" onSubmit={submitOtp}>
      <label className="field"><span>Code de vérification</span><input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required /></label>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading || otp.length !== 6}>{loading ? "Vérification..." : "Valider"}<LockKeyhole size={17} /></button>
    </form>
  </AuthShell>;

  if (pending?.stage === "password-change") return <AuthShell title="Activer votre compte" subtitle="Remplacez le mot de passe temporaire par un mot de passe personnel.">
    <form className="form-stack" onSubmit={submitPasswordChange}>
      <label className="field"><span>Nouveau mot de passe</span><input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12 caractères minimum" autoComplete="new-password" required /></label>
      <label className="field"><span>Confirmer le mot de passe</span><input type="password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Répétez le mot de passe" autoComplete="new-password" required /></label>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Enregistrement..." : "Activer mon compte"}<ArrowRight size={17} /></button>
    </form>
  </AuthShell>;

  return <AuthShell title="Connexion" subtitle="Accédez à votre espace santé avec vos identifiants." footer={<><span>Pas encore de compte ?</span> <Link href="/inscription">Créer un compte patient</Link></>}>
    <form className="form-stack" onSubmit={submitLogin}>
      <label className="field"><span>Email ou téléphone</span>
        <div className="input-icon"><Mail size={17} /><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="vous@exemple.bj" autoComplete="username" required /></div>
      </label>
      <label className="field"><span>Mot de passe</span>
        <div className="input-icon"><LockKeyhole size={17} /><input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Votre mot de passe" autoComplete="current-password" required /><button type="button" className="input-trailing" onClick={() => setVisible(!visible)} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      </label>
      <div className="auth-row"><Link href="/mot-de-passe-oublie" className="text-link">Mot de passe oublié ?</Link></div>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}<ArrowRight size={17} /></button>
    </form>
  </AuthShell>;
}

/* ------------------------------------------------------------------ */
/* Inscription patient                                                 */
/* ------------------------------------------------------------------ */

export function RegisterForm({ registrationsOpen }: { registrationsOpen: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", city: "Cotonou", bloodGroup: "", birthDate: "", password: "", confirmPassword: "" });
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; npi: string | null } | null>(null);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) { setError("L’adresse email est invalide."); return; }
    if (!/^\+?[0-9 .()-]{8,40}$/.test(form.phone.trim())) { setError("Le numéro de téléphone est invalide (8 chiffres minimum)."); return; }
    if (form.password !== form.confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    const weakness = passwordProblem(form.password, { email: form.email, fullName: form.fullName });
    if (weakness) { setError(weakness); return; }
    if (!consent) { setError("Vous devez accepter la politique de confidentialité."); return; }
    setLoading(true);
    try {
      const result = await authRequest({
        action: "register",
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        bloodGroup: form.bloodGroup || undefined,
        birthDate: form.birthDate || undefined,
        password: form.password,
        privacyConsent: true,
      });
      setDone({ name: result.user?.fullName || form.fullName, npi: result.user?.npi ?? null });
      setTimeout(() => { router.replace("/espace"); router.refresh(); }, 1200);
    } catch (err) { setError(err instanceof Error ? err.message : "Inscription impossible."); }
    finally { setLoading(false); }
  };

  if (!registrationsOpen) return <AuthShell title="Inscriptions fermées" subtitle="La création de compte patient est momentanément désactivée.">
    <div className="form-warning">Les inscriptions publiques sont actuellement fermées. Contactez l’administration pour la création de votre compte.</div>
    <Link className="btn btn-primary btn-full" href="/">Retour à l’accueil</Link>
  </AuthShell>;

  if (done) return <AuthShell title="Compte créé" subtitle="Votre espace patient est prêt.">
    <div className="auth-success"><div className="auth-security-icon"><CheckCircle2 size={30} /></div>
      <h3>Bienvenue, {done.name}</h3>
      <p>Votre identifiant Santé+ est <strong>{done.npi || "en cours de génération"}</strong>. Vous allez être redirigé vers votre tableau de bord.</p>
      <Link className="btn btn-primary btn-full" href="/espace">Ouvrir mon espace patient<ArrowRight size={17} /></Link>
    </div>
  </AuthShell>;

  return <AuthShell title="Créer mon compte patient" subtitle="Quelques informations suffisent pour ouvrir votre espace santé." footer={<><span>Déjà inscrit ?</span> <Link href="/connexion">Se connecter</Link></>}>
    <form className="form-stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field"><span>Nom complet *</span><input value={form.fullName} onChange={set("fullName")} placeholder="Prénom et nom" autoComplete="name" minLength={2} maxLength={180} required /></label>
        <label className="field"><span>Téléphone *</span><div className="input-icon"><Phone size={16} /><input value={form.phone} onChange={set("phone")} placeholder="+229 97 00 00 00" inputMode="tel" autoComplete="tel" required /></div></label>
      </div>
      <label className="field"><span>Adresse email *</span><div className="input-icon"><Mail size={16} /><input type="email" value={form.email} onChange={set("email")} placeholder="vous@exemple.bj" autoComplete="email" required /></div></label>
      <div className="form-grid">
        <label className="field"><span>Ville</span><input value={form.city} onChange={set("city")} placeholder="Cotonou" autoComplete="address-level2" /></label>
        <label className="field"><span>Groupe sanguin</span><select value={form.bloodGroup} onChange={set("bloodGroup")}><option value="">Non renseigné</option>{BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
      </div>
      <label className="field"><span>Date de naissance</span><input type="date" value={form.birthDate} onChange={set("birthDate")} max={new Date().toISOString().slice(0, 10)} /></label>
      <div className="form-grid">
        <label className="field"><span>Mot de passe *</span><div className="input-icon"><LockKeyhole size={16} /><input type={visible ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="12 caractères minimum" autoComplete="new-password" required /><button type="button" className="input-trailing" onClick={() => setVisible(!visible)} aria-label={visible ? "Masquer les mots de passe" : "Afficher les mots de passe"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label className="field"><span>Confirmer *</span><div className="input-icon"><ShieldCheck size={16} /><input type={visible ? "text" : "password"} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Répétez" autoComplete="new-password" required /></div></label>
      </div>
      <p className="form-help">Au moins 12 caractères, avec des lettres et des chiffres. Évitez votre nom ou votre email.</p>
      <label className="privacy-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>J’ai lu et j’accepte la <a href="/confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a> et le traitement de mes données de santé pour ma prise en charge.</span></label>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Création du compte..." : "Créer mon compte"}<ArrowRight size={17} /></button>
    </form>
  </AuthShell>;
}

/* ------------------------------------------------------------------ */
/* Récupération de mot de passe                                        */
/* ------------------------------------------------------------------ */

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const result = await authRequest({ action: "requestPasswordReset", identifier: identifier.trim() });
      setMessage(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : "Demande impossible."); }
    finally { setLoading(false); }
  };

  return <AuthShell title="Mot de passe oublié" subtitle="Nous transmettons votre demande à l’administration." footer={<><span>Vous avez déjà un code ?</span> <Link href="/reinitialiser">Réinitialiser</Link></>}>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>Email ou téléphone</span><div className="input-icon"><Mail size={17} /><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="vous@exemple.bj" autoComplete="username" required /></div></label>
      {message ? <div className="form-info">{message}</div> : <p className="form-help">L’administration vérifie votre identité puis vous remet un code à usage unique valable 30 minutes.</p>}
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Envoi..." : "Envoyer la demande"}</button>
      <Link href="/connexion" className="text-link justify-center">Revenir à la connexion</Link>
    </form>
  </AuthShell>;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", code: "", password: "", confirmPassword: "" });
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (form.password !== form.confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    const weakness = passwordProblem(form.password, { email: form.identifier });
    if (weakness) { setError(weakness); return; }
    setLoading(true);
    try {
      await authRequest({ action: "resetPassword", identifier: form.identifier.trim(), code: form.code.trim(), newPassword: form.password, confirmPassword: form.confirmPassword });
      setDone(true);
      setTimeout(() => router.replace("/connexion"), 1500);
    } catch (err) { setError(err instanceof Error ? err.message : "Réinitialisation impossible."); }
    finally { setLoading(false); }
  };

  if (done) return <AuthShell title="Mot de passe réinitialisé" subtitle="Toutes vos sessions ont été fermées par sécurité.">
    <div className="form-info">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</div>
    <Link className="btn btn-primary btn-full" href="/connexion">Aller à la connexion<ArrowRight size={17} /></Link>
  </AuthShell>;

  return <AuthShell title="Réinitialiser le mot de passe" subtitle="Utilisez le code remis par l’administration." footer={<><span>Pas de code ?</span> <Link href="/mot-de-passe-oublie">Faire une demande</Link></>}>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>Email ou téléphone</span><div className="input-icon"><Mail size={16} /><input value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} placeholder="vous@exemple.bj" autoComplete="username" required /></div></label>
      <label className="field"><span>Code de réinitialisation</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="XXXX-XXXX-XXXX" autoComplete="one-time-code" className="otp-code" required /></label>
      <div className="form-grid">
        <label className="field"><span>Nouveau mot de passe</span><div className="input-icon"><LockKeyhole size={16} /><input type={visible ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="12 caractères minimum" autoComplete="new-password" required /><button type="button" className="input-trailing" onClick={() => setVisible(!visible)} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label className="field"><span>Confirmer</span><div className="input-icon"><ShieldCheck size={16} /><input type={visible ? "text" : "password"} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Répétez" autoComplete="new-password" required /></div></label>
      </div>
      <FieldError message={error} />
      <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Enregistrement..." : "Réinitialiser mon mot de passe"}</button>
    </form>
  </AuthShell>;
}
