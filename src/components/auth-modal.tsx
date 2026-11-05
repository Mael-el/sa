"use client";

import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, HeartPulse, LockKeyhole, Mail, ShieldCheck, Stethoscope } from "lucide-react";
import { Modal } from "@/components/shared";

type Stage = "login" | "register" | "access" | "2fa" | "2fa-setup" | "password-change";

export function AuthModal({ open, onClose, onAuthenticated, toast, initialStage = "login" }: { open: boolean; onClose: () => void; onAuthenticated: () => Promise<void>; toast: (message: string, type?: "success" | "error") => void; initialStage?: "login" | "register" | "access" }) {
  const [stage, setStage] = useState<Stage>(initialStage);
  const [prevOpen, setPrevOpen] = useState(open);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [otp, setOtp] = useState("");
  const [role, setRole] = useState("patient");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [register, setRegister] = useState({ fullName: "", email: "", phone: "", password: "", bloodGroup: "", city: "Cotonou", privacyConsent: false });
  const [registerConfirm, setRegisterConfirm] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setStage(initialStage); setError(""); setChallenge(""); setSuccess(false); setOtp(""); setSetupSecret(""); setOtpauth(""); setRegisterConfirm(""); }
  }
  const [access, setAccess] = useState({ role: "doctor", applicantName: "", email: "", phone: "", organization: "", specialty: "", licenseNumber: "" });

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "config" }) })
      .then((response) => response.json())
      .then((result) => { if (active) setCanRegister(Boolean(result.registrationsOpen)); })
      .catch(() => { if (active) setCanRegister(false); });
    return () => { active = false; };
  }, [open]);

  const switchTab = (value: Stage) => { setStage(value); setError(""); setChallenge(""); setSuccess(false); setOtp(""); setSetupSecret(""); setOtpauth(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (stage === "register" && register.password !== registerConfirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    if (stage === "register" && register.password.length < 12) { setError("Le mot de passe doit contenir au moins 12 caractères."); return; }
    setLoading(true);
    const body = stage === "2fa" || stage === "2fa-setup" ? { action: "verify2fa", challenge, code: otp }
      : stage === "password-change" ? { action: "completePasswordChange", challenge, newPassword, confirmPassword, privacyConsent }
      : stage === "login" ? { action: "login", ...login }
      : stage === "register" ? { action: "register", ...register }
      : { action: "requestAccess", ...access };
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
      if (result.needs2FASetup) { setChallenge(result.challenge); setSetupSecret(result.setupSecret || ""); setOtpauth(result.otpauthUrl || ""); setOtp(""); setStage("2fa-setup"); return; }
      if (result.needs2FA) { setChallenge(result.challenge); setOtp(""); setStage("2fa"); return; }
      if (result.needsPasswordChange) { setChallenge(result.challenge); setRole(result.role || "patient"); setNewPassword(""); setConfirmPassword(""); setPrivacyConsent(false); setStage("password-change"); return; }
      if (stage === "access") { setSuccess(true); toast(result.message || "Demande envoyée."); return; }
      await onAuthenticated();
      toast(result.message || "Connexion réussie.");
      onClose();
      switchTab("login");
      setLogin({ identifier: "", password: "" });
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); }
  };

  const title = stage === "2fa-setup" ? "Configurer la double authentification" : stage === "2fa" ? "Vérification en deux étapes" : stage === "password-change" ? "Activer votre compte" : stage === "login" ? "Bienvenue sur SANTÉ+" : stage === "register" ? "Créer mon compte patient" : "Demander un accès";
  const subtitle = stage === "2fa-setup" ? "Scannez ce QR code avec votre application d’authentification, puis saisissez le code généré." : stage === "2fa" ? "Une sécurité supplémentaire pour votre espace professionnel." : stage === "password-change" ? "Remplacez le mot de passe temporaire par un mot de passe personnel." : stage === "login" ? "Votre santé, au même endroit et en toute confiance." : stage === "register" ? "Créez votre identité santé en quelques instants." : "L'équipe SANTÉ+ validera votre demande.";

  return <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} size="medium">
    {stage === "2fa-setup" ? <form onSubmit={submit} className="form-stack"><div className="auth-security-icon"><ShieldCheck size={28} /></div>{otpauth && <div className="totp-qr">{<QRCodeSVG value={otpauth} size={180} />}</div>}<div className="field"><span>Clé de configuration manuelle</span><code className="totp-secret">{setupSecret}</code></div><p className="form-help text-center">Conservez cette clé dans votre application d’authentification. Elle ne sera plus affichée après activation.</p><label className="field"><span>Code à 6 chiffres</span><input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required /></label>{error && <div className="form-error">{error}</div>}<button className="btn btn-primary btn-full" disabled={loading || otp.length !== 6}><LockKeyhole size={17} />{loading ? "Vérification..." : "Valider la configuration"}</button><button type="button" className="text-link justify-center" onClick={() => switchTab("login")}><ArrowLeft size={15} />Retour à la connexion</button></form>
    : stage === "2fa" ? <form onSubmit={submit} className="form-stack"><div className="auth-security-icon"><ShieldCheck size={28} /></div><p className="form-help text-center">Saisissez le code à 6 chiffres généré par votre application d’authentification.</p><label className="field"><span>Code de vérification</span><input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required /></label>{error && <div className="form-error">{error}</div>}<button className="btn btn-primary btn-full" disabled={loading || otp.length !== 6}><LockKeyhole size={17} />{loading ? "Vérification..." : "Vérifier et me connecter"}</button><button type="button" className="text-link justify-center" onClick={() => switchTab("login")}><ArrowLeft size={15} />Retour à la connexion</button></form>
    : stage === "password-change" ? <form onSubmit={submit} className="form-stack"><div className="auth-security-icon"><LockKeyhole size={28} /></div><label className="field"><span>Nouveau mot de passe</span><input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12 caractères minimum" required /></label><label className="field"><span>Confirmer le mot de passe</span><input type="password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Répétez le mot de passe" required /></label>{role === "patient" && <label className="privacy-checkbox"><input type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} required /><span>J’ai lu et j’accepte la <a href="/confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a> et le traitement de mes données pour ma prise en charge.</span></label>}{error && <div className="form-error">{error}</div>}<button className="btn btn-primary btn-full" disabled={loading || newPassword.length < 12 || newPassword !== confirmPassword || (role === "patient" && !privacyConsent)}>{loading ? "Activation..." : "Activer mon compte"}<ArrowRight size={17} /></button></form>
    : success ? <div className="auth-success"><div className="auth-security-icon"><CheckCircle2 size={30} /></div><h3>Demande envoyée !</h3><p>Notre équipe vérifiera vos informations et vous contactera après validation de votre accès.</p><button className="btn btn-primary" onClick={onClose}>Terminer</button></div> : <>
      <div className="auth-tabs"><button className={stage === "login" ? "active" : ""} onClick={() => switchTab("login")}>Connexion</button>{canRegister && <button className={stage === "register" ? "active" : ""} onClick={() => switchTab("register")}>Inscription</button>}<button className={stage === "access" ? "active" : ""} onClick={() => switchTab("access")}>Professionnels</button></div>
      <form onSubmit={submit} className="form-stack">
        {stage === "login" && <><label className="field"><span>Email ou téléphone</span><div className="input-icon"><Mail size={17} /><input value={login.identifier} onChange={(event) => setLogin({ ...login, identifier: event.target.value })} placeholder="votre@email.bj" required /></div></label><label className="field"><span>Mot de passe</span><div className="input-icon"><LockKeyhole size={17} /><input value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} type={showPassword ? "text" : "password"} placeholder="Votre mot de passe" required /><button type="button" className="input-trailing" onClick={() => setShowPassword(!showPassword)} aria-label="Afficher le mot de passe">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}<ArrowRight size={17} /></button><p className="form-help text-center">Première connexion ? Utilisez le mot de passe temporaire reçu, puis configurez votre sécurité.</p></>}
        {stage === "register" && <><div className="form-grid"><label className="field"><span>Nom complet *</span><input value={register.fullName} onChange={(event) => setRegister({ ...register, fullName: event.target.value })} placeholder="Votre nom complet" required /></label><label className="field"><span>Téléphone *</span><input value={register.phone} onChange={(event) => setRegister({ ...register, phone: event.target.value })} placeholder="+229 ..." required /></label></div><label className="field"><span>Adresse email *</span><input type="email" value={register.email} onChange={(event) => setRegister({ ...register, email: event.target.value })} placeholder="votre@email.bj" required /></label><div className="form-grid"><label className="field"><span>Ville</span><input value={register.city} onChange={(event) => setRegister({ ...register, city: event.target.value })} placeholder="Cotonou" /></label><label className="field"><span>Groupe sanguin</span><select value={register.bloodGroup} onChange={(event) => setRegister({ ...register, bloodGroup: event.target.value })}><option value="">Non renseigné</option>{["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((group) => <option key={group}>{group}</option>)}</select></label></div><div className="form-grid"><label className="field"><span>Mot de passe *</span><div className="input-icon"><LockKeyhole size={17} /><input type={showRegisterPassword ? "text" : "password"} minLength={12} value={register.password} onChange={(event) => setRegister({ ...register, password: event.target.value })} placeholder="12 caractères minimum" autoComplete="new-password" required /><button type="button" className="input-trailing" onClick={() => setShowRegisterPassword(!showRegisterPassword)} aria-label={showRegisterPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showRegisterPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><label className="field"><span>Confirmer le mot de passe *</span><div className="input-icon"><ShieldCheck size={17} /><input type={showRegisterPassword ? "text" : "password"} minLength={12} value={registerConfirm} onChange={(event) => setRegisterConfirm(event.target.value)} placeholder="Répétez le mot de passe" autoComplete="new-password" required /></div></label></div><p className="form-help"><HeartPulse size={15} />Un identifiant Santé+ interne et un QR code sont créés automatiquement après validation.</p><label className="privacy-checkbox"><input type="checkbox" checked={register.privacyConsent} onChange={(event) => setRegister({ ...register, privacyConsent: event.target.checked })} required /><span>J’ai lu et j’accepte la <a href="/confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a> et le traitement de mes données pour ma prise en charge.</span></label><button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Création..." : "Créer mon compte"}<ArrowRight size={17} /></button></>}
        {stage === "access" && <><div className="choice-row"><button type="button" className={access.role === "doctor" ? "choice-card selected" : "choice-card"} onClick={() => setAccess({ ...access, role: "doctor" })}><Stethoscope size={20} /><strong>Médecin</strong></button><button type="button" className={access.role === "hospital" ? "choice-card selected" : "choice-card"} onClick={() => setAccess({ ...access, role: "hospital" })}><Building2 size={20} /><strong>Établissement</strong></button></div><label className="field"><span>{access.role === "doctor" ? "Nom et prénom" : "Nom du responsable"} *</span><input value={access.applicantName} onChange={(event) => setAccess({ ...access, applicantName: event.target.value })} placeholder={access.role === "doctor" ? "Dr. ..." : "Nom du responsable"} required /></label><div className="form-grid"><label className="field"><span>Email professionnel *</span><input type="email" value={access.email} onChange={(event) => setAccess({ ...access, email: event.target.value })} placeholder="contact@exemple.bj" required /></label><label className="field"><span>Téléphone</span><input value={access.phone} onChange={(event) => setAccess({ ...access, phone: event.target.value })} placeholder="+229 ..." /></label></div><label className="field"><span>Établissement</span><input value={access.organization} onChange={(event) => setAccess({ ...access, organization: event.target.value })} placeholder="Nom de l'hôpital ou de la clinique" /></label>{access.role === "doctor" && <><label className="field"><span>Spécialité</span><input value={access.specialty} onChange={(event) => setAccess({ ...access, specialty: event.target.value })} placeholder="Médecine générale, cardiologie..." /></label><label className="field"><span>Numéro d’ordre / licence *</span><input value={access.licenseNumber} onChange={(event) => setAccess({ ...access, licenseNumber: event.target.value })} placeholder="Numéro officiel" required /></label></>}<button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Envoi..." : "Envoyer ma demande"}<ArrowRight size={17} /></button><p className="form-help text-center">Votre accès sera activé après vérification par SANTÉ+.</p></>}
        {error && <div className="form-error">{error}</div>}
      </form>
    </>}
  </Modal>;
}
