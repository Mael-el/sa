"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Clock3, Download, FileText, Info, LockKeyhole, Plus, ShieldCheck, UserCheck, X } from "lucide-react";
import { Avatar, EmptyState, Modal, PageHeading, SectionHeading, StatusBadge, shortDate, type ScreenProps } from "@/components/shared";

export function PrivacyCenter(props: ScreenProps) {
  const { data, act, toast } = props;
  const [sharing, setSharing] = useState(false);
  const [doctorId, setDoctorId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requestType, setRequestType] = useState("accès");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [refusing, setRefusing] = useState<number | null>(null);

  const requests = data.consentRequests || [];
  const pending = requests.filter((item) => item.status === "en attente" && !item.revokedAt);
  const active = requests.filter((item) => item.status === "accordé" && !item.revokedAt && new Date(item.expiresAt) > new Date());
  const history = requests.filter((item) => item.status === "refusé" || item.revokedAt || (item.status === "accordé" && new Date(item.expiresAt) <= new Date()));

  const decide = async (id: number, decision: "accorder" | "refuser", canModify: boolean) => {
    setBusy(id);
    try {
      const result = await act("decideConsent", { id, decision, canModify });
      toast(result.message || "Décision enregistrée.");
      setRefusing(null);
    } catch { /* le toast d'erreur est déjà affiché par act */ } finally { setBusy(null); }
  };

  const toggleModify = async (id: number, canModify: boolean) => {
    setBusy(id);
    try { const result = await act("updateConsentPermissions", { id, canModify }); toast(result.message || "Permissions mises à jour."); }
    catch { /* idem */ } finally { setBusy(null); }
  };

  const revoke = async (id: number) => {
    if (!window.confirm("Révoquer cette autorisation ? Le professionnel perdra immédiatement l’accès au dossier.")) return;
    setBusy(id);
    try { const result = await act("revokeConsent", { id }); toast(result.message || "Autorisation révoquée."); }
    catch { /* idem */ } finally { setBusy(null); }
  };

  const grant = async (event: FormEvent) => {
    event.preventDefault(); setBusy(-1);
    try { await act("grantConsent", { doctorId: Number(doctorId), purpose }); setSharing(false); setPurpose(""); setDoctorId(""); }
    catch { /* idem */ } finally { setBusy(null); }
  };
  const requestRight = async (event: FormEvent) => {
    event.preventDefault(); setBusy(-2);
    try { await act("privacyRequest", { type: requestType, message }); setMessage(""); }
    catch { /* idem */ } finally { setBusy(null); }
  };

  return <div>
    <PageHeading eyebrow="MES DONNÉES, MES DROITS" title="Confidentialité & accès" subtitle="Vous décidez qui consulte votre dossier, ce qu’il peut modifier, et pour combien de temps." action={<a className="btn btn-outline" href="/confidentialite" target="_blank" rel="noreferrer"><ShieldCheck size={17} />Lire la politique</a>} />

    <div className="privacy-banner"><div className="list-icon mint"><LockKeyhole size={24} /></div><div><h2>Votre dossier vous appartient.</h2><p>Un NPI identifie une personne, il n’ouvre aucun dossier. Seul un consentement actif délivré par vous permet à un professionnel de consulter ou de modifier vos données.</p></div><button className="btn btn-primary" onClick={() => setSharing(true)}><Plus size={16} />Autoriser un médecin</button></div>

    {pending.length > 0 && <section className="card card-pad consent-pending">
      <SectionHeading title={`${pending.length} demande${pending.length > 1 ? "s" : ""} en attente de votre décision`} subtitle="Aucun accès n’est ouvert tant que vous n’avez pas répondu" />
      {pending.map((request) => <div className="consent-request" key={request.id}>
        <Avatar name={request.requesterName} size={42} />
        <div className="consent-request-main">
          <strong>{request.requesterName}</strong>
          <span>{request.requesterRole}{request.requesterSpecialty ? ` · ${request.requesterSpecialty}` : ""}</span>
          <p>{request.requestMessage || request.purpose}</p>
          <small>Demandé le {shortDate(request.requestedAt || request.createdAt)}</small>
        </div>
        <div className="consent-request-actions">
          <button className="btn btn-primary btn-sm" disabled={busy === request.id} onClick={() => decide(request.id, "accorder", false)}>Consulter</button>
          <button className="btn btn-outline btn-sm" disabled={busy === request.id} onClick={() => decide(request.id, "accorder", true)}>Consulter et modifier</button>
          <button className="btn btn-danger btn-sm" disabled={busy === request.id} onClick={() => decide(request.id, "refuser", false)}><X size={14} />Refuser</button>
        </div>
      </div>)}
    </section>}

    <section className="card card-pad">
      <SectionHeading title="Autorisations actives" subtitle="Chaque accès est limité dans le temps et révocable immédiatement" />
      {active.length ? <div className="consent-list">{active.map((grant) => <div className="consent-row" key={grant.id}>
        <div className="consent-row-head">
          <div className="list-icon mint"><UserCheck size={18} /></div>
          <div><strong>{grant.requesterName}</strong><span>{grant.requesterRole} · expire le {shortDate(grant.expiresAt)}</span></div>
          <StatusBadge status="accorde" />
        </div>
        <p className="consent-purpose">Motif : {grant.purpose}</p>
        <div className="consent-perms">
          <label className="consent-perm"><input type="checkbox" checked readOnly disabled /><span>Consulter le dossier</span></label>
          <label className="consent-perm"><input type="checkbox" checked={grant.canModify} disabled={busy === grant.id} onChange={(event) => toggleModify(grant.id, event.target.checked)} /><span>Modifier les données médicales</span></label>
          <label className="consent-perm"><input type="checkbox" checked={grant.canViewDocuments} readOnly disabled /><span>Accéder aux documents</span></label>
        </div>
        <div className="consent-row-foot">
          <span className="muted-small">Accordé le {shortDate(grant.decidedAt || grant.createdAt)}</span>
          <button className="btn btn-outline btn-sm" disabled={busy === grant.id} onClick={() => revoke(grant.id)}><X size={14} />Révoquer</button>
        </div>
      </div>)}</div> : <EmptyState icon={ShieldCheck} title="Aucune autorisation active" description="Vos données médicales ne sont accessibles à aucun professionnel pour le moment." />}
    </section>

    {history.length > 0 && <section className="card card-pad">
      <SectionHeading title="Historique" subtitle="Demandes refusées, autorisations révoquées ou expirées" />
      <div className="consent-list">{history.map((grant) => <div className="consent-row consent-row-muted" key={grant.id}>
        <div className="consent-row-head">
          <div className="list-icon blue"><Clock3 size={18} /></div>
          <div><strong>{grant.requesterName}</strong><span>{grant.requesterRole} · {grant.revokedAt ? "révoquée" : grant.status === "refusé" ? "refusée" : "expirée"}</span></div>
        </div>
        <p className="consent-purpose">{grant.requestMessage || grant.purpose}</p>
      </div>)}</div>
    </section>}

    <Modal open={sharing} onClose={() => setSharing(false)} title="Autoriser un médecin" subtitle="L’accès est limité à 30 jours et révocable à tout moment.">
      <form className="form-stack" onSubmit={grant}>
        <label className="field"><span>Médecin *</span><select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required><option value="">Sélectionner</option>{data.doctors.filter((doctor) => doctor.status === "actif").map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>)}</select></label>
        <label className="field"><span>Motif du partage *</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Ex. suivi cardiologique" required /></label>
        <button className="btn btn-primary btn-full" disabled={busy === -1}>{busy === -1 ? "Enregistrement..." : "Accorder l’accès"}</button>
      </form>
    </Modal>

    {/* Le panneau de traitement n'est rendu que pour l'administration : la route
        API refuse déjà les autres rôles, mais un patient ne doit pas voir une
        file de demandes qu'il ne peut pas traiter. */}
    {data.user.role === "admin" && <AdminPrivacyRequests {...props} />}
  </div>;
}

export function AdminPrivacyRequests({ data, act }: ScreenProps) {
  const pending = data.privacyRequests.filter((item) => item.status === "en attente").length;
  return <div><PageHeading eyebrow="PROTECTION DES DONNÉES" title="Droits des patients" subtitle="Examinez les demandes d’accès, de rectification, d’opposition ou d’effacement." /><div className="privacy-banner admin-privacy-banner"><div className="list-icon mint"><UserCheck size={24} /></div><div><h2>{pending} demande{pending > 1 ? "s" : ""} à prendre en charge</h2><p>Une vérification d’identité et une réponse humaine restent nécessaires avant toute modification des données médicales.</p></div></div><section className="card card-pad"><SectionHeading title="Demandes reçues" subtitle="Les actions sont enregistrées dans le journal d’audit" />{data.privacyRequests.length ? [...data.privacyRequests].reverse().map((item) => <div className="privacy-request-row" key={item.id}><div className="list-icon blue"><FileText size={18} /></div><div><strong>{data.users.find((user) => user.id === item.patientId)?.fullName || `Patient #${item.patientId}`} · {item.type}</strong><span>{item.message}</span><small>{shortDate(item.createdAt)}</small></div><StatusBadge status={item.status} />{item.status === "en attente" && <button className="btn btn-primary btn-sm" onClick={() => act("reviewPrivacyRequest", { id: item.id }).catch(() => {})}>Prendre en charge</button>}</div>) : <EmptyState icon={CheckCircle2} title="Aucune demande" description="Les demandes des patients apparaîtront ici." />}</section><div className="record-security-note"><ShieldCheck size={18} />La prise en charge ne clôture pas la demande : le responsable du traitement doit vérifier l’identité, appliquer les obligations légales et répondre au patient.</div></div>;
}
