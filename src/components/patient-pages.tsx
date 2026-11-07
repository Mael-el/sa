"use client";

import { sessionHeaders } from "@/lib/session-client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  Copy,
  Download,
  Droplets,
  ExternalLink,
  Eye,
  EyeOff,
  FileHeart,
  FileText,
  Heart,
  HeartHandshake,
  HeartPulse,
  Hospital,
  Info,
  LocateFixed,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Pill,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  User,
  UserRound,
  Volume2,
  Wallet,
  WifiOff,
} from "lucide-react";
import { PrivacyCenter } from "@/components/privacy-center";
import {
  Avatar,
  DateTile,
  EmptyState,
  MetricCard,
  Modal,
  PageHeading,
  SearchField,
  SectionHeading,
  StatusBadge,
  firstName,
  hour,
  longDate,
  money,
  relativeDay,
  shortDate,
  type ScreenProps,
} from "@/components/shared";
import { IdentitySearch } from "@/components/identity-search";
import type { Appointment, Hospital as HospitalType, Pharmacy } from "@/lib/types";
import type { SymptomAssessment } from "@/lib/clinical";
import { passwordProblem } from "@/lib/passwords";

const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export function PatientPage({ page, ...props }: ScreenProps & { page: string }) {
  if (page === "profile") return <PatientProfile {...props} />;
  if (page === "identity") return <IdentitySearch role={props.data.user.role} act={props.act} toast={props.toast} />;
  if (page === "appointments") return <PatientAppointments {...props} />;
  if (page === "records") return <PatientRecords {...props} />;
  if (page === "prescriptions") return <PatientPrescriptions {...props} />;
  if (page === "results") return <PatientResults {...props} />;
  if (page === "history") return <PatientHistory {...props} />;
  if (page === "payments") return <PatientPayments {...props} />;
  if (page === "donations") return <PatientDonations {...props} />;
  if (page === "locations") return <PatientLocations {...props} />;
  if (page === "assistant") return <PatientAssistant {...props} />;
  if (page === "notifications") return <PatientNotifications {...props} />;
  if (page === "settings") return <PatientSettings {...props} />;
  if (page === "privacy") return <PrivacyCenter {...props} />;
  return <PatientOverview {...props} />;
}

/* ------------------------------------------------------------------ */
/* Carte d'identité et QR code Santé+                                 */
/* ------------------------------------------------------------------ */

function IdentityCard({ data, toast }: Pick<ScreenProps, "data" | "toast">) {
  const download = () => {
    const svg = document.getElementById("patient-identity-qr");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `santeplus-qr-${data.user.npi || "patient"}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Votre QR code a été téléchargé.");
  };

  return (
    <div className="card identity-card">
      <div className="identity-top">
        <div className="identity-small-icon"><ShieldCheck size={18} /></div>
        <span>IDENTITÉ SANTÉ+</span>
        <BadgeCheck size={19} className="identity-check" />
      </div>
      <div className="qr-frame">
        <QRCodeSVG
          id="patient-identity-qr"
          value={`SANTEPLUS:${data.user.npi || data.user.id}`}
          size={144}
          level="H"
          bgColor="#ffffff"
          fgColor="#0f2a43"
          marginSize={1}
        />
      </div>
      <h3>{data.user.fullName}</h3>
      <p>Identifiant Santé+ vérifié · Sécurisé</p>
      <div className="npi-box">
        <span>ID SANTÉ+</span>
        <strong>{data.user.npi || "En attente"}</strong>
        <button
          onClick={() => {
            copyToClipboard(data.user.npi || "").then((ok) => {
              if (ok) toast("NPI copié dans le presse-papiers.");
            });
          }}
          aria-label="Copier le NPI"
        >
          <Copy size={14} />
        </button>
      </div>
      <div className="identity-grid">
        <div><span>GROUPE SANGUIN</span><strong>{data.user.bloodGroup || "—"}</strong></div>
        <div><span>VILLE</span><strong>{data.user.city || "—"}</strong></div>
      </div>
      <button className="btn btn-primary btn-sm btn-full" onClick={download}>
        <Download size={14} /> Télécharger mon QR code
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de réservation de rendez-vous                                */
/* ------------------------------------------------------------------ */

function BookingModal({ open, onClose, data, act, go }: { open: boolean; onClose: () => void } & Pick<ScreenProps, "data" | "act" | "go">) {
  const [hospitalId, setHospitalId] = useState(String(data.hospitals[0]?.id || ""));
  const availableDoctors = data.doctors.filter((item) => item.hospitalId === Number(hospitalId) && item.status === "actif");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("Consultation");
  const [careConsent, setCareConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDoctorId(String(availableDoctors[0]?.id || ""));
      setDate("");
      setReason("");
      setCareConsent(false);
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await act("bookAppointment", {
        hospitalId: Number(hospitalId),
        doctorId: Number(doctorId),
        scheduledAt: new Date(`${date}T${time}:00`).toISOString(),
        reason,
        type,
        careConsent,
      });
      onClose();
    } catch {
      /* feedback fourni par act */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Prendre rendez-vous" subtitle="Choisissez le professionnel et le créneau qui vous conviennent." size="medium">
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Établissement de santé *</span>
          <select
            value={hospitalId}
            onChange={(event) => {
              setHospitalId(event.target.value);
              setDoctorId(String(data.doctors.find((doctor) => doctor.hospitalId === Number(event.target.value))?.id || ""));
            }}
            required
          >
            {!data.hospitals.some((hospital) => hospital.isActive) && <option value="">Aucun établissement partenaire</option>}
            {data.hospitals.filter((hospital) => hospital.isActive).map((hospital) => (
              <option key={hospital.id} value={hospital.id}>{hospital.shortName} · {hospital.city}</option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Médecin disponible *</span>
            <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
              {availableDoctors.length ? (
                availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>
                ))
              ) : (
                <option value="">Aucun praticien disponible dans cet établissement</option>
              )}
            </select>
          </label>
          <label className="field">
            <span>Type de prestation</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="Consultation">Consultation générale</option>
              <option value="Suivi">Consultation de suivi</option>
              <option value="Urgence relative">Urgence relative</option>
              <option value="Examen">Examen médical</option>
            </select>
          </label>
        </div>
        {!availableDoctors.length && (
          <div className="form-info">
            Les médecins cartographiés ne disposent pas encore d’un agenda SANTÉ+ vérifié. Seuls les praticiens inscrits dans le réseau peuvent recevoir une réservation.
            <button type="button" className="text-link" onClick={() => { onClose(); go("locations"); }}>Consulter les établissements et cabinets référencés</button>
          </div>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Date souhaitée *</span>
            <input type="date" value={date} min={data.serverTime.slice(0, 10)} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className="field">
            <span>Heure *</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
          </label>
        </div>
        <label className="field">
          <span>Motif de la consultation</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex. Douleurs articulaires, contrôle de tension..." />
        </label>
        <label className="privacy-checkbox">
          <input type="checkbox" checked={careConsent} onChange={(event) => setCareConsent(event.target.checked)} required />
          <span>J’autorise expressément le médecin sélectionné à consulter mon dossier médical Santé+ pour la préparation et la réalisation de cette consultation.</span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={saving || !doctorId || !date}>
            {saving ? "Confirmation en cours..." : "Confirmer le rendez-vous"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de reprogrammation                                           */
/* ------------------------------------------------------------------ */

function RescheduleModal({ id, onClose, data, act }: { id: number | null; onClose: () => void; data: ScreenProps["data"]; act: ScreenProps["act"] }) {
  const appointment = data.appointments.find((item) => item.id === id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [prevId, setPrevId] = useState(id);

  if (id !== prevId) {
    setPrevId(id);
    setDate("");
    setTime("09:00");
  }

  const doctor = appointment ? data.doctors.find((item) => item.id === appointment.doctorId) : undefined;
  const hospital = appointment ? data.hospitals.find((item) => item.id === appointment.hospitalId) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!appointment) return;
    setSaving(true);
    try {
      await act("rescheduleAppointment", { id: appointment.id, scheduledAt: new Date(`${date}T${time}:00`).toISOString() });
      onClose();
    } catch {
      /* feedback fourni par act */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Déplacer le rendez-vous" subtitle={doctor ? `${doctor.name} · ${hospital?.shortName || "Établissement"}` : undefined} size="small">
      <form className="form-stack" onSubmit={submit}>
        <div className="form-info">
          <Clock3 size={16} />
          <span>Rendez-vous actuel : {appointment ? longDate(appointment.scheduledAt) : ""} à {appointment ? hour(appointment.scheduledAt) : ""}.</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Nouvelle date *</span>
            <input type="date" value={date} min={data.serverTime.slice(0, 10)} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className="field">
            <span>Nouvelle heure *</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
          </label>
        </div>
        <p className="form-help">Le médecin et l’établissement sont notifiés automatiquement de votre changement de date.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary" disabled={saving || !date}>
            {saving ? "Enregistrement..." : "Confirmer le déplacement"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de détail / paiement                                         */
/* ------------------------------------------------------------------ */

function PaymentModal({ id, onClose, data }: { id: number | null; onClose: () => void; data: ScreenProps["data"] }) {
  const payment = data.payments.find((item) => item.id === id);
  const hospital = data.hospitals.find((item) => item.id === payment?.hospitalId);
  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Régler une facture" subtitle="Paiement auprès de l’établissement." size="small">
      {payment && (
        <div className="form-stack">
          <div className="payment-amount-box">
            <span>Montant à régler</span>
            <strong>{money(payment.amount)}</strong>
            <small>{payment.title}</small>
          </div>
          <div className="form-warning">
            <Info size={16} />
            <span>Le paiement en ligne n’est pas encore activé. Réglez cette facture auprès de {hospital?.shortName || "l’établissement"} ; il enregistrera le paiement dans votre espace.</span>
          </div>
          {hospital?.phone && (
            <a className="btn btn-outline btn-full" href={`tel:${hospital.phone}`}>
              Appeler l’établissement ({hospital.phone})
            </a>
          )}
          <button className="btn btn-primary btn-full" onClick={onClose}>Fermer</button>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Tableau de bord (Overview)                                      */
/* ------------------------------------------------------------------ */

function PatientOverview(props: ScreenProps) {
  const { data, go, toast, openEmergency } = props;
  const [booking, setBooking] = useState(false);
  const now = new Date(data.serverTime).getTime();
  const upcoming = [...data.appointments]
    .filter((item) => item.status === "confirmé" && new Date(item.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const recent = [...data.records]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 3);
  const doctorOf = (appointment: Appointment) => data.doctors.find((doctor) => doctor.id === appointment.doctorId);

  return (
    <div className="dashboard-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-kicker">ESPACE PERSONNEL PATIENT <span /></div>
          <h1>Bonjour, {firstName(data.user.fullName)} </h1>
          <p>Bienvenue sur votre espace santé. Voici le point sur votre suivi médical.</p>
        </div>
        <div className="today-label"><CalendarDays size={17} />{longDate(new Date(data.serverTime))}</div>
      </div>

      <div className="patient-hero">
        <Image className="hero-visual" src="/images/doctor-hero.jpg" alt="Médecin en consultation" width={900} height={700} priority />
        <div className="hero-content">
          <div className="hero-eyebrow"><span />VOTRE SANTÉ, NOTRE PRIORITÉ</div>
          <h2>Votre santé, toujours<br />à portée de main.</h2>
          <p>Un dossier unique et sécurisé. Prenez rendez-vous, consultez vos ordonnances et suivez vos soins en toute confiance.</p>
          <div className="hero-actions">
            <button className="btn btn-dark" onClick={() => setBooking(true)}>
              Prendre rendez-vous<ArrowRight size={17} />
            </button>
            <button className="hero-text-link" onClick={() => go("records")}>
              Consulter mon dossier <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <MetricCard
          icon={CalendarDays}
          label="Prochain rendez-vous"
          value={upcoming.length ? relativeDay(upcoming[0].scheduledAt) : "Aucun"}
          sub={upcoming.length ? `${hour(upcoming[0].scheduledAt)} · ${doctorOf(upcoming[0])?.name || "Médecin"}` : "Planifier une consultation"}
          tone="blue"
          onClick={() => go("appointments")}
        />
        <MetricCard
          icon={FileHeart}
          label="Dossier médical"
          value={String(data.records.length + data.documents.length).padStart(2, "0")}
          sub="Événements enregistrés"
          tone="purple"
          onClick={() => go("records")}
        />
        <MetricCard
          icon={Pill}
          label="Ordonnances"
          value={String(data.prescriptions.length).padStart(2, "0")}
          sub="Voir mes prescriptions"
          tone="orange"
          onClick={() => go("prescriptions")}
        />
        <MetricCard
          icon={Droplets}
          label="Groupe sanguin"
          value={data.user.bloodGroup || "—"}
          sub="Mon profil donneur"
          tone="rose"
          onClick={() => go("donations")}
        />
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-main-column">
          <section className="card card-pad">
            <SectionHeading
              title="Mes prochains rendez-vous"
              subtitle="Vos consultations médicales programmées"
              action="Voir tous les rendez-vous"
              onAction={() => go("appointments")}
            />
            {upcoming.length ? (
              upcoming.slice(0, 2).map((appointment) => {
                const doctor = doctorOf(appointment);
                return (
                  <div className="appointment-row" key={appointment.id}>
                    <DateTile value={appointment.scheduledAt} />
                    <Avatar name={doctor?.name || "Médecin"} size={43} />
                    <div className="appointment-info">
                      <strong>{doctor?.name || "Médecin"}</strong>
                      <span>{doctor?.specialty || appointment.type} · {data.hospitals.find((h) => h.id === appointment.hospitalId)?.shortName}</span>
                    </div>
                    <div className="appointment-time"><Clock3 size={16} />{hour(appointment.scheduledAt)}</div>
                    <StatusBadge status={appointment.status} />
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Aucun rendez-vous à venir"
                description="Trouvez un médecin partenaire et réservez votre créneau en quelques clics."
                action="Prendre rendez-vous"
                onAction={() => setBooking(true)}
              />
            )}
          </section>

          <section className="card card-pad">
            <SectionHeading
              title="Activité médicale récente"
              subtitle="Dernières mises à jour de votre dossier de santé"
              action="Voir tout mon dossier"
              onAction={() => go("records")}
            />
            {recent.length ? (
              <div className="recent-list">
                {recent.map((record) => (
                  <div className="recent-row" key={record.id}>
                    <div className={`list-icon ${record.category === "vaccin" ? "orange" : record.category === "analyse" ? "purple" : "mint"}`}>
                      {record.category === "vaccin" ? <Syringe size={18} /> : record.category === "analyse" ? <Activity size={18} /> : <Stethoscope size={18} />}
                    </div>
                    <div>
                      <strong>{record.title}</strong>
                      <span>{record.description}</span>
                    </div>
                    <small>{shortDate(record.recordedAt)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileHeart}
                title="Dossier en attente de consultations"
                description="Vos comptes-rendus de consultations et résultats d'examens s'afficheront ici."
              />
            )}
          </section>
        </div>

        <div className="dashboard-side-column">
          <IdentityCard data={data} toast={toast} />
          <div className="help-card">
            <div className="help-icon"><MessageCircle size={22} /></div>
            <h3>Une question sur votre santé ?</h3>
            <p>Décrivez vos symptômes à l’assistant pour une première orientation et les consignes adaptées.</p>
            <button onClick={() => go("assistant")}>
              Consulter l’assistant <ArrowRight size={16} />
            </button>
          </div>
          <button className="emergency-inline" onClick={openEmergency}>
            <span><HeartPulse size={19} /></span>
            <span><strong>Besoin d’aide urgente ?</strong><small>Numéros d’urgence médicale au Bénin</small></span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <BookingModal open={booking} onClose={() => setBooking(false)} data={data} act={props.act} go={props.go} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Profil personnel                                                */
/* ------------------------------------------------------------------ */

function PatientProfile({ data, act, toast }: ScreenProps) {
  const [form, setForm] = useState({
    fullName: data.user.fullName,
    email: data.user.email,
    phone: data.user.phone || "",
    city: data.user.city || "",
    bloodGroup: data.user.bloodGroup || "",
    birthDate: data.user.birthDate || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.fullName.trim().length < 2) {
      setError("Le nom complet doit comporter au moins 2 caractères.");
      return;
    }
    if (!/^\+?[0-9 .()-]{8,40}$/.test(form.phone.trim())) {
      setError("Le numéro de téléphone est invalide (8 chiffres minimum).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setError("L'adresse email est invalide.");
      return;
    }
    setSaving(true);
    try {
      await act("updateProfile", {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        bloodGroup: form.bloodGroup || null,
        birthDate: form.birthDate || null,
      });
      setSuccess("Vos informations personnelles ont été mises à jour avec succès.");
      toast("Profil mis à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour le profil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="MON COMPTE"
        title="Profil personnel"
        subtitle="Consultez et mettez à jour vos informations personnelles et coordonnées de santé."
      />

      <div className="profile-overview-card">
        <div className="profile-overview-left">
          <Avatar name={form.fullName} size={70} />
          <div className="profile-overview-meta">
            <h2>{form.fullName}</h2>
            <p>Identifiant Santé+ : <strong>{data.user.npi || "En attente"}</strong></p>
            <div className="profile-badges">
              <span className="profile-badge-pill"><ShieldCheck size={13} /> Compte actif</span>
              <span className="profile-badge-pill"><Droplets size={13} /> Groupe {form.bloodGroup || "non renseigné"}</span>
              <span className="profile-badge-pill"><MapPin size={13} /> {form.city || "Bénin"}</span>
            </div>
          </div>
        </div>
        <div className="profile-overview-right">
          <a className="btn btn-white btn-sm" href="/api/export?type=dossier">
            <Download size={15} /> Exporter mon dossier complet
          </a>
        </div>
      </div>

      <div className="profile-layout-grid">
        <div className="card card-pad">
          <SectionHeading
            title="Modifier mes coordonnées"
            subtitle="Ces informations permettent aux soignants de vous contacter et de sécuriser votre prise en charge."
          />
          {error && <div className="form-error" role="alert">{error}</div>}
          {success && <div className="form-info" role="status"><CheckCircle2 size={16} />{success}</div>}
          <form className="form-stack" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">
                <span>Nom complet *</span>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Prénom et nom"
                  required
                />
              </label>
              <label className="field">
                <span>Numéro de téléphone *</span>
                <div className="input-icon">
                  <Phone size={16} />
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+229 97 00 00 00"
                    required
                  />
                </div>
              </label>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Adresse email *</span>
                <div className="input-icon">
                  <Mail size={16} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="vous@exemple.bj"
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span>Ville de résidence</span>
                <div className="input-icon">
                  <MapPin size={16} />
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Cotonou"
                  />
                </div>
              </label>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Groupe sanguin</span>
                <select
                  value={form.bloodGroup}
                  onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                >
                  <option value="">Non renseigné</option>
                  {BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date de naissance</span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
            </div>
            <div className="form-info">
              <ShieldCheck size={16} />
              <span>Vos données sont strictement protégées conformément à la loi 2017-20 et accessibles uniquement aux professionnels avec votre consentement.</span>
            </div>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Enregistrement en cours..." : "Enregistrer les modifications"}
            </button>
          </form>
        </div>

        <div className="profile-side-column">
          <IdentityCard data={data} toast={toast} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Rendez-vous                                                     */
/* ------------------------------------------------------------------ */

function PatientAppointments(props: ScreenProps) {
  const { data, act, search } = props;
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState<number | null>(null);
  const [tab, setTab] = useState("avenir");

  const appointments = [...data.appointments]
    .filter((item) => {
      const matchSearch =
        !search ||
        `${item.reason} ${data.doctors.find((doctor) => doctor.id === item.doctorId)?.name}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (tab === "tous") return true;
      if (tab === "avenir") return item.status === "confirmé" && new Date(item.scheduledAt) > new Date();
      return item.status !== "confirmé" || new Date(item.scheduledAt) <= new Date();
    })
    .sort((a, b) => (tab === "avenir" ? new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() : new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()));

  return (
    <div>
      <PageHeading
        eyebrow="MON AGENDA"
        title="Mes rendez-vous"
        subtitle="Retrouvez vos consultations et planifiez votre prochaine visite."
        action={
          <button className="btn btn-primary" onClick={() => setBooking(true)}>
            <Plus size={18} /> Prendre rendez-vous
          </button>
        }
      />

      <div className="appointments-top-banner">
        <div className="appointments-top-icon"><CalendarDays size={27} /></div>
        <div>
          <strong>Un suivi médical simplifié</strong>
          <p>Choisissez votre établissement, votre praticien et l’horaire qui vous convient.</p>
        </div>
        <button className="btn btn-white" onClick={() => setBooking(true)}>
          Réserver un créneau <ArrowRight size={16} />
        </button>
      </div>

      <section className="card card-pad">
        <div className="section-heading">
          <div>
            <h2>Mes consultations</h2>
            <p>{appointments.length} rendez-vous affiché{appointments.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="tabs">
          {[
            ["avenir", "À venir"],
            ["historique", "Historique"],
            ["tous", "Tous"],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="appointment-list">
          {appointments.length ? (
            appointments.map((appointment) => {
              const doctor = data.doctors.find((item) => item.id === appointment.doctorId);
              const hospital = data.hospitals.find((item) => item.id === appointment.hospitalId);
              const isFuture = appointment.status === "confirmé" && new Date(appointment.scheduledAt) > new Date();

              return (
                <div className="appointment-detail-row" key={appointment.id}>
                  <DateTile value={appointment.scheduledAt} />
                  <div className="appointment-detail-main">
                    <div className="appointment-detail-head">
                      <h3>{doctor?.name || "Médecin"}</h3>
                      <StatusBadge status={appointment.status} />
                    </div>
                    <p>{doctor?.specialty || appointment.type} · {appointment.reason}</p>
                    <div className="appointment-meta">
                      <span><MapPin size={14} />{hospital?.shortName || "Établissement"}</span>
                      <span><Clock3 size={14} />{hour(appointment.scheduledAt)}</span>
                    </div>
                  </div>

                  {isFuture && (
                    <div className="appointment-actions">
                      <button className="btn btn-soft btn-sm" onClick={() => setRescheduling(appointment.id)}>
                        Déplacer
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          if (window.confirm("Êtes-vous sûr(e) de vouloir annuler ce rendez-vous ?")) {
                            try {
                              await act("cancelAppointment", { id: appointment.id });
                            } catch {
                              /* retour fourni par act */
                            }
                          }
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Aucun rendez-vous ici"
              description="Vos prochaines consultations médicales apparaîtront dans cette rubrique."
              action="Prendre rendez-vous"
              onAction={() => setBooking(true)}
            />
          )}
        </div>
      </section>

      <BookingModal open={booking} onClose={() => setBooking(false)} data={data} act={act} go={props.go} />
      <RescheduleModal id={rescheduling} onClose={() => setRescheduling(null)} data={data} act={act} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Dossier médical                                                 */
/* ------------------------------------------------------------------ */

function PatientRecords({ data, toast }: ScreenProps) {
  const [tab, setTab] = useState("tout");
  const tabs = [
    ["tout", "Tout le dossier"],
    ["consultation", "Consultations"],
    ["ordonnances", "Ordonnances"],
    ["analyse", "Analyses"],
    ["vaccin", "Vaccins"],
    ["documents", "Documents"],
  ];
  const filtered = [...data.records]
    .filter((record) => tab === "tout" || record.category === tab)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  return (
    <div>
      <PageHeading
        eyebrow="MON ESPACE PATIENT"
        title="Mon dossier médical"
        subtitle="Toute votre histoire de santé, réunie et sécurisée au même endroit."
        action={
          <a className="btn btn-primary" href="/api/export?type=dossier">
            <Download size={17} /> Télécharger le dossier
          </a>
        }
      />

      <div className="record-summary">
        <div>
          <div className="record-summary-icon"><FileHeart size={25} /></div>
          <h2>Votre parcours de santé, en un seul dossier.</h2>
          <p>Vos informations vous accompagnent dans tous les établissements du réseau SANTÉ+.</p>
          <div className="record-summary-chips">
            <span><ShieldCheck size={15} />Données protégées</span>
            <span><BadgeCheck size={15} />ID Santé+ : {data.user.npi || "En attente"}</span>
          </div>
        </div>
        <div className="record-summary-blood">
          <Droplets size={24} />
          <small>GROUPE SANGUIN</small>
          <strong>{data.user.bloodGroup || "—"}</strong>
        </div>
      </div>

      <div className="record-stats">
        <div><FileText size={20} /><strong>{data.records.filter((item) => item.category === "consultation").length}</strong><span>Consultations</span></div>
        <div><Pill size={20} /><strong>{data.prescriptions.length}</strong><span>Ordonnances</span></div>
        <div><Activity size={20} /><strong>{data.records.filter((item) => item.category === "analyse").length}</strong><span>Analyses</span></div>
        <div><Syringe size={20} /><strong>{data.records.filter((item) => item.category === "vaccin").length}</strong><span>Vaccinations</span></div>
      </div>

      <section className="card card-pad">
        <SectionHeading title="Historique médical" subtitle="Consultez vos soins et documents par catégorie" />
        <div className="tabs scroll-tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "ordonnances" ? (
          <div className="record-list">
            {data.prescriptions.length ? (
              [...data.prescriptions].reverse().map((prescription) => (
                <div className="record-entry" key={prescription.id}>
                  <div className="record-entry-icon orange"><Pill size={21} /></div>
                  <div className="record-entry-body">
                    <div className="record-entry-top">
                      <span className="type-tag orange">ORDONNANCE</span>
                      <span>{shortDate(prescription.createdAt)}</span>
                    </div>
                    <h3>{prescription.diagnosis}</h3>
                    <p>{prescription.medications.map((medication) => `${medication.name} ${medication.dosage}`).join(" · ")}</p>
                    <small>{data.doctors.find((doctor) => doctor.id === prescription.doctorId)?.name || "Médecin"}</small>
                  </div>
                  <a className="icon-button" href={`/api/export?type=prescription&id=${prescription.id}`} aria-label="Télécharger l'ordonnance">
                    <Download size={18} />
                  </a>
                </div>
              ))
            ) : (
              <EmptyState title="Aucune ordonnance" />
            )}
          </div>
        ) : tab === "documents" ? (
          <div className="record-list">
            {data.documents.length ? (
              data.documents.map((document) => (
                <div className="record-entry" key={document.id}>
                  <div className="record-entry-icon purple"><FileText size={21} /></div>
                  <div className="record-entry-body">
                    <div className="record-entry-top">
                      <span className="type-tag purple">{document.category.toUpperCase()}</span>
                      <span>{shortDate(document.createdAt)}</span>
                    </div>
                    <h3>{document.title}</h3>
                    <p>{document.fileName}</p>
                  </div>
                  <a className="icon-button" href={`/api/documents/${document.id}`} aria-label="Télécharger le document">
                    <Download size={18} />
                  </a>
                </div>
              ))
            ) : (
              <EmptyState title="Aucun document à télécharger" />
            )}
          </div>
        ) : (
          <div className="record-list">
            {filtered.length ? (
              filtered.map((record) => (
                <div className="record-entry" key={record.id}>
                  <div className={`record-entry-icon ${record.category === "vaccin" ? "blue" : record.category === "analyse" ? "purple" : "mint"}`}>
                    {record.category === "vaccin" ? <Syringe size={21} /> : record.category === "analyse" ? <Activity size={21} /> : <Stethoscope size={21} />}
                  </div>
                  <div className="record-entry-body">
                    <div className="record-entry-top">
                      <span className={`type-tag ${record.category === "vaccin" ? "blue" : record.category === "analyse" ? "purple" : "mint"}`}>
                        {record.category.toUpperCase()}
                      </span>
                      <span>{shortDate(record.recordedAt)}</span>
                    </div>
                    <h3>{record.title}</h3>
                    <p>{record.description}</p>
                    {record.details && <small>{record.details}</small>}
                  </div>
                  <CheckCircle2 size={18} className="record-check" />
                </div>
              ))
            ) : (
              <EmptyState title="Aucune donnée dans cette catégorie" />
            )}
          </div>
        )}
      </section>

      <div className="record-security-note">
        <ShieldCheck size={19} />
        <span>Votre dossier est strictement confidentiel. Chaque accès par un professionnel de santé est tracé dans le journal d’audit.</span>
      </div>
      <div className="record-qr-inline"><IdentityCard data={data} toast={toast} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Ordonnances                                                     */
/* ------------------------------------------------------------------ */

function PatientPrescriptions({ data, go }: ScreenProps) {
  const [search, setSearch] = useState("");
  const prescriptions = [...data.prescriptions]
    .filter((script) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const doctor = data.doctors.find((d) => d.id === script.doctorId);
      return (
        script.diagnosis.toLowerCase().includes(s) ||
        (doctor?.name || "").toLowerCase().includes(s) ||
        script.medications.some((m) => m.name.toLowerCase().includes(s))
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalMeds = data.prescriptions.reduce((sum, p) => sum + p.medications.length, 0);

  return (
    <div>
      <PageHeading
        eyebrow="MES TRAITEMENTS"
        title="Mes ordonnances"
        subtitle="Consultez le détail de vos ordonnances médicales et téléchargez les exemplaires officiels."
        action={
          <div className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher médicament ou médecin..."
            />
          </div>
        }
      />

      <div className="metrics-grid three">
        <MetricCard
          icon={Pill}
          label="Ordonnances émises"
          value={String(data.prescriptions.length).padStart(2, "0")}
          sub="Prescriptions enregistrées"
          tone="orange"
        />
        <MetricCard
          icon={Activity}
          label="Médicaments prescrits"
          value={String(totalMeds).padStart(2, "0")}
          sub="Traitements cumulés"
          tone="blue"
        />
        <MetricCard
          icon={FileHeart}
          label="Dossier médical lié"
          value={String(data.records.length).padStart(2, "0")}
          sub="Voir les consultations"
          tone="purple"
          onClick={() => go("records")}
        />
      </div>

      <section className="card card-pad">
        <SectionHeading
          title="Historique des ordonnances"
          subtitle={`${prescriptions.length} ordonnance(s) disponible(s)`}
        />
        {prescriptions.length ? (
          <div className="prescription-meds-list">
            {prescriptions.map((script) => {
              const doctor = data.doctors.find((d) => d.id === script.doctorId);
              const hospital = data.hospitals.find((h) => h.id === script.hospitalId);
              return (
                <article className="prescription-full-card" key={script.id}>
                  <div className="prescription-card-head">
                    <div>
                      <span className="type-tag orange">ORDONNANCE #{script.id}</span>
                      <h3>{script.diagnosis}</h3>
                      <p>Prescrite par le {doctor?.name || "Médecin"} · {doctor?.specialty || "Médecine générale"} ({hospital?.shortName || "Établissement"})</p>
                    </div>
                    <a
                      className="btn btn-outline btn-sm"
                      href={`/api/export?type=prescription&id=${script.id}`}
                      download
                    >
                      <Download size={15} /> Télécharger en PDF
                    </a>
                  </div>

                  <div className="prescription-meds-list">
                    {script.medications.map((med, index) => (
                      <div className="prescription-med-row" key={index}>
                        <div className="prescription-med-info">
                          <strong>{med.name} — {med.dosage}</strong>
                          <span>Posologie : {med.frequency}</span>
                        </div>
                        <span className="prescription-med-duration">{med.duration}</span>
                      </div>
                    ))}
                  </div>

                  {script.notes && (
                    <div className="form-info">
                      <Info size={16} />
                      <span><strong>Recommandations du praticien :</strong> {script.notes}</span>
                    </div>
                  )}

                  <div className="prescription-card-foot">
                    <span>Délivrée le {longDate(script.createdAt)}</span>
                    <span className="muted-small">Document authentifié par signature électronique Santé+</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Pill}
            title="Aucune ordonnance"
            description="Vos ordonnances émises lors de vos consultations médicales apparaîtront ici."
            action="Prendre rendez-vous"
            onAction={() => go("appointments")}
          />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Résultats d'examens                                             */
/* ------------------------------------------------------------------ */

function PatientResults({ data, go }: ScreenProps) {
  const [tab, setTab] = useState("tous");

  const allResults = useMemo(() => {
    const fromDocs = data.documents.map((d) => ({
      id: `doc-${d.id}`,
      documentId: d.id,
      title: d.title,
      category: d.category,
      fileName: d.fileName,
      mimeType: d.mimeType,
      date: d.createdAt,
      doctor: data.doctors.find((doc) => doc.id === d.doctorId)?.name || "Laboratoire / Praticien",
      isFile: true,
      description: "Document certifié transmis par le soignant.",
    }));
    const fromRecords = data.records
      .filter((r) => r.category === "analyse" || r.category === "imagerie")
      .map((r) => ({
        id: `rec-${r.id}`,
        documentId: null,
        title: r.title,
        category: r.category,
        fileName: r.details || "Rapport clinique",
        mimeType: "text/plain",
        date: r.recordedAt,
        doctor: "Service médical hospitalier",
        isFile: false,
        description: r.description,
      }));
    return [...fromDocs, ...fromRecords].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data.documents, data.records, data.doctors]);

  const filtered = allResults.filter((r) => {
    if (tab === "tous") return true;
    if (tab === "biologie") return r.category === "analyse";
    if (tab === "imagerie") return r.category === "imagerie";
    return true;
  });

  return (
    <div>
      <PageHeading
        eyebrow="EXAMENS & ANALYSES"
        title="Résultats d'examens"
        subtitle="Consultez et téléchargez vos analyses de laboratoire, radiographies et comptes-rendus médicaux."
        action={
          <a className="btn btn-outline" href="/api/export?type=dossier">
            <Download size={16} /> Exporter le dossier complet
          </a>
        }
      />

      <div className="tabs">
        {[
          ["tous", "Tous les résultats"],
          ["biologie", "Biologie médicale"],
          ["imagerie", "Imagerie médicale"],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <section className="card card-pad">
        <SectionHeading
          title="Documents et comptes-rendus"
          subtitle={`${filtered.length} résultat(s) disponible(s)`}
        />
        {filtered.length ? (
          <div className="results-grid">
            {filtered.map((item) => (
              <div className="result-card" key={item.id}>
                <div className="result-card-top">
                  <div className={`list-icon ${item.category === "imagerie" ? "blue" : "purple"}`}>
                    <Activity size={20} />
                  </div>
                  <div className="result-card-copy">
                    <span className="type-tag purple">{item.category.toUpperCase()}</span>
                    <h3>{item.title}</h3>
                    <p>{item.doctor}</p>
                  </div>
                </div>

                <div className="result-card-meta">
                  <span>{shortDate(item.date)}</span>
                  <span>{item.fileName}</span>
                </div>

                {item.isFile && item.documentId ? (
                  <a
                    className="btn btn-primary btn-sm btn-full"
                    href={`/api/documents/${item.documentId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={15} /> Télécharger le document
                  </a>
                ) : (
                  <button className="btn btn-soft btn-sm btn-full" onClick={() => go("records")}>
                    <FileHeart size={15} /> Voir dans le dossier
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="Aucun résultat d'examen"
            description="Les résultats d'analyses et comptes-rendus publiés par vos soignants apparaîtront ici."
            action="Voir mon dossier"
            onAction={() => go("records")}
          />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Historique & Suivi médical                                      */
/* ------------------------------------------------------------------ */

function PatientHistory({ data }: ScreenProps) {
  const [filter, setFilter] = useState("tout");

  const timeline = useMemo(() => {
    type Event = {
      id: string;
      date: string;
      category: "soin" | "rdv" | "prescription" | "examen" | "consentement" | "securite";
      title: string;
      desc: string;
      meta?: string;
    };
    const events: Event[] = [];

    data.records.forEach((r) => {
      events.push({
        id: `rec-${r.id}`,
        date: r.recordedAt,
        category: r.category === "analyse" || r.category === "imagerie" ? "examen" : "soin",
        title: r.title,
        desc: r.description,
        meta: r.details || undefined,
      });
    });

    data.appointments.forEach((a) => {
      const doc = data.doctors.find((d) => d.id === a.doctorId);
      const hosp = data.hospitals.find((h) => h.id === a.hospitalId);
      events.push({
        id: `apt-${a.id}`,
        date: a.scheduledAt,
        category: "rdv",
        title: `Rendez-vous ${a.status} : ${a.reason}`,
        desc: `Consultation avec le ${doc?.name || "Médecin"} à ${hosp?.shortName || "l'établissement"}.`,
        meta: `Statut : ${a.status}`,
      });
    });

    data.prescriptions.forEach((p) => {
      const doc = data.doctors.find((d) => d.id === p.doctorId);
      events.push({
        id: `pres-${p.id}`,
        date: p.createdAt,
        category: "prescription",
        title: `Ordonnance : ${p.diagnosis}`,
        desc: `${p.medications.length} médicament(s) prescrit(s) par le ${doc?.name || "Médecin"}.`,
        meta: p.medications.map((m) => m.name).join(", "),
      });
    });

    data.documents.forEach((d) => {
      events.push({
        id: `doc-${d.id}`,
        date: d.createdAt,
        category: "examen",
        title: `Document ajouté : ${d.title}`,
        desc: `Fichier ${d.fileName} enregistré dans votre dossier.`,
      });
    });

    data.consents.forEach((c) => {
      events.push({
        id: `con-${c.id}`,
        date: c.createdAt,
        category: "consentement",
        title: c.revokedAt ? "Consentement révoqué" : "Consentement de soins accordé",
        desc: `Finalité : ${c.purpose}. Source : ${c.source}.`,
        meta: c.revokedAt ? `Révoqué le ${shortDate(c.revokedAt)}` : `Valable jusqu'au ${shortDate(c.expiresAt)}`,
      });
    });

    data.audit.forEach((a) => {
      events.push({
        id: `aud-${a.id}`,
        date: a.createdAt,
        category: "securite",
        title: a.action,
        desc: a.resource,
        meta: a.details || undefined,
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data]);

  const filtered = timeline.filter((e) => {
    if (filter === "tout") return true;
    if (filter === "soins") return e.category === "soin" || e.category === "rdv";
    if (filter === "prescriptions") return e.category === "prescription" || e.category === "examen";
    if (filter === "securite") return e.category === "securite" || e.category === "consentement";
    return true;
  });

  return (
    <div>
      <PageHeading
        eyebrow="CHRONOLOGIE MÉDICALE"
        title="Historique & Suivi"
        subtitle="Traçabilité chronologique complète de vos consultations, ordonnances, examens et activités de compte."
        action={
          <div className="table-filters">
            <a className="btn btn-outline" href="/api/export?type=dossier">
              <Download size={15} /> Export PDF
            </a>
            <a className="btn btn-outline" href="/api/privacy/export">
              <Download size={15} /> Données JSON
            </a>
          </div>
        }
      />

      <div className="tabs">
        {[
          ["tout", "Toute l'activité"],
          ["soins", "Soins & Rendez-vous"],
          ["prescriptions", "Ordonnances & Examens"],
          ["securite", "Sécurité & Consentements"],
        ].map(([key, label]) => (
          <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <section className="card card-pad">
        <SectionHeading
          title="Fil chronologique"
          subtitle={`${filtered.length} événement(s) répertorié(s)`}
        />
        {filtered.length ? (
          <div className="timeline-container">
            {filtered.map((event) => {
              const icon =
                event.category === "soin" ? <Stethoscope size={13} /> :
                event.category === "rdv" ? <CalendarDays size={13} /> :
                event.category === "prescription" ? <Pill size={13} /> :
                event.category === "examen" ? <Activity size={13} /> :
                event.category === "consentement" ? <ShieldCheck size={13} /> :
                <LockKeyhole size={13} />;

              return (
                <div className="timeline-item" key={event.id}>
                  <div className="timeline-dot">{icon}</div>
                  <div className="timeline-card">
                    <div className="timeline-header">
                      <strong>{event.title}</strong>
                      <span>{longDate(event.date)} · {hour(event.date)}</span>
                    </div>
                    <p>{event.desc}</p>
                    {event.meta && <small>{event.meta}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="Aucun historique"
            description="Votre activité médicale et les événements de sécurité s'afficheront chronologiquement ici."
          />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Paiements                                                       */
/* ------------------------------------------------------------------ */

function PatientPayments(props: ScreenProps) {
  const { data } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const due = data.payments.filter((item) => item.status !== "payé");
  const paid = data.payments.filter((item) => item.status === "payé");

  return (
    <div>
      <PageHeading eyebrow="FINANCES DE SANTÉ" title="Paiements & Factures" subtitle="Retrouvez l’historique de vos prestations de soins et vos reçus." />
      <div className="metrics-grid three">
        <MetricCard icon={Wallet} label="Factures en attente" value={String(due.length).padStart(2, "0")} sub="À régler en clinique" tone="orange" />
        <MetricCard icon={CheckCircle2} label="Factures réglées" value={String(paid.length).padStart(2, "0")} sub="Prestations acquittées" tone="mint" />
        <MetricCard icon={FileText} label="Total engagé" value={money(data.payments.reduce((sum, item) => sum + item.amount, 0))} sub="Dépenses cumulées" tone="blue" />
      </div>

      <section className="card card-pad">
        <SectionHeading title="Factures à régler" subtitle="Règlements en attente auprès des établissements" />
        {due.length ? (
          <div className="payment-list">
            {due.map((item) => (
              <div className="payment-row" key={item.id}>
                <div><strong>{item.title}</strong><span>{data.hospitals.find((h) => h.id === item.hospitalId)?.shortName || "Établissement"} · {shortDate(item.createdAt)}</span></div>
                <div className="payment-amount">{money(item.amount)}</div>
                <button className="btn btn-primary btn-sm" onClick={() => setSelected(item.id)}>Détails</button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Aucune facture en attente" description="Toutes vos prestations de soins sont actuellement à jour." />
        )}
      </section>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <SectionHeading title="Historique des paiements acquittés" subtitle="Reçus enregistrés par les établissements" />
        {paid.length ? (
          <div className="payment-list">
            {paid.map((item) => (
              <div className="payment-row" key={item.id}>
                <div><strong>{item.title}</strong><span>{data.hospitals.find((h) => h.id === item.hospitalId)?.shortName} · Référence : {item.reference || `#${item.id}`}</span></div>
                <div className="payment-amount">{money(item.amount)}</div>
                <StatusBadge status="payé" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Wallet} title="Aucun reçu pour l’instant" description="Vos règlements confirmés apparaîtront ici." />
        )}
      </section>

      <PaymentModal id={selected} onClose={() => setSelected(null)} data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. Don de sang                                                     */
/* ------------------------------------------------------------------ */

function PatientDonations({ data, act }: ScreenProps) {
  const [hospitalId, setHospitalId] = useState(String(data.hospitals[0]?.id || ""));
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const donations = data.donations;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await act("planDonation", { hospitalId: Number(hospitalId), date });
      setDate("");
    } catch {
      /* feedback fourni par act */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeading eyebrow="SOLIDARITÉ NATIONALE" title="Don de sang" subtitle="Chaque don sauve des vies dans les hôpitaux béninois." />
      <div className="donation-hero">
        <div className="donation-heart"><Heart size={30} /></div>
        <div>
          <h2>Un geste simple qui sauve trois vies.</h2>
          <p>Planifiez votre prochain don de sang dans l’établissement partenaire de votre choix.</p>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-main-column">
          <section className="card card-pad">
            <SectionHeading title="Planifier un don" subtitle="Choisissez votre centre de collecte" />
            <form className="form-stack" onSubmit={submit}>
              <label className="field">
                <span>Centre de collecte *</span>
                <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} required>
                  {data.hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} · {h.city}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date souhaitée *</span>
                <input type="date" value={date} min={data.serverTime.slice(0, 10)} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <button className="btn btn-primary" disabled={saving || !date}>
                {saving ? "Enregistrement..." : "Confirmer mon intention de don"}
              </button>
            </form>
          </section>

          <section className="card card-pad">
            <SectionHeading title="Mes dons de sang" subtitle="Historique de vos participations" />
            {donations.length ? (
              <div className="recent-list">
                {donations.map((d) => (
                  <div className="recent-row" key={d.id}>
                    <div className="list-icon rose"><Droplets size={18} /></div>
                    <div>
                      <strong>Don de sang · {data.hospitals.find((h) => h.id === d.hospitalId)?.shortName || "Centre national"}</strong>
                      <span>Statut : {d.status}</span>
                    </div>
                    <small>{shortDate(d.donatedAt)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Droplets} title="Aucun don planifié" description="Planifiez votre premier don dès aujourd’hui." />
            )}
          </section>
        </div>

        <div className="dashboard-side-column">
          <div className="card card-pad">
            <SectionHeading title="Mon profil donneur" subtitle="Informations transfusionnelles" />
            <div className="blood-profile-box">
              <Droplets size={32} className="blood-drop-icon" />
              <div>
                <span>Groupe sanguin</span>
                <strong>{data.user.bloodGroup || "Non renseigné"}</strong>
              </div>
            </div>
            <p className="setting-note">Votre groupe sanguin est vérifié lors de votre premier don médicalisé.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. Trouver un centre                                              */
/* ------------------------------------------------------------------ */

const FACILITY_CATEGORY_LABELS: Record<string, string> = {
  alternative: "Médecine alternative",
  blood_bank: "Banque de sang",
  birthing_centre: "Maternité",
  centre: "Centre de santé",
  clinic: "Clinique",
  dentist: "Cabinet dentaire",
  doctor: "Cabinet médical",
  doctors: "Cabinet médical",
  hospital: "Hôpital / centre de soins",
  laboratory: "Laboratoire médical",
  nurse: "Soins infirmiers",
  psychotherapist: "Psychothérapie",
  rehabilitation: "Réadaptation",
  social_facility: "Structure médico-sociale",
  yes: "Structure de santé (catégorie non précisée)",
  pharmacy: "Pharmacie",
};

function PatientLocations({ data }: ScreenProps) {
  const [tab, setTab] = useState<"hospitals" | "pharmacies">("hospitals");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(0);
  const search = query.toLowerCase();
  const pageSize = 30;
  const hospitals = [
    ...data.hospitals.map((hospital) => ({
      id: `hospital-${hospital.id}`,
      name: hospital.name,
      category: hospital.type,
      city: hospital.city,
      address: hospital.address,
      phone: hospital.phone || null,
      details: `Capacité : ${hospital.bedsTotal} lits (${hospital.bedsTotal - hospital.bedsOccupied} disponibles)`,
      status: hospital.isActive ? "actif" : "inactif",
      categoryKey: hospital.type,
      sourceUrl: null,
      sourceName: null,
      sourceLicense: null,
      sourceSnapshotDate: null,
    })),
    ...data.healthFacilities.filter((facility) => facility.kind === "facility").map((facility) => ({
      id: `osm-${facility.id}`,
      name: facility.name || `${FACILITY_CATEGORY_LABELS[facility.category] || "Établissement"} (nom non renseigné dans OpenStreetMap)`,
      category: FACILITY_CATEGORY_LABELS[facility.category === "doctors" ? "doctor" : facility.category] || facility.category.replaceAll("_", " "),
      city: facility.city || facility.locality || "Localité non renseignée",
      address: facility.address,
      phone: facility.phone,
      details: null,
      status: null,
      categoryKey: facility.category === "doctors" ? "doctor" : facility.category,
      sourceUrl: facility.sourceUrl,
      sourceName: facility.sourceName,
      sourceLicense: facility.sourceLicense,
      sourceSnapshotDate: facility.sourceSnapshotDate,
    })),
  ];
  const pharmacies = [
    ...data.pharmacies.map((pharmacy) => ({
      id: `pharmacy-${pharmacy.id}`,
      name: pharmacy.name,
      category: "Pharmacie",
      city: pharmacy.city,
      address: pharmacy.address,
      phone: pharmacy.phone || null,
      hours: pharmacy.hours || null,
      categoryKey: "pharmacy",
      sourceUrl: null,
      sourceName: null,
      sourceLicense: null,
      sourceSnapshotDate: null,
    })),
    ...data.healthFacilities.filter((facility) => facility.kind === "pharmacy").map((facility) => ({
      id: `osm-${facility.id}`,
      name: facility.name || "Pharmacie (nom non renseigné dans OpenStreetMap)",
      category: "Pharmacie",
      city: facility.city || facility.locality || "Localité non renseignée",
      address: facility.address,
      phone: facility.phone,
      hours: facility.openingHours,
      categoryKey: "pharmacy",
      sourceUrl: facility.sourceUrl,
      sourceName: facility.sourceName,
      sourceLicense: facility.sourceLicense,
      sourceSnapshotDate: facility.sourceSnapshotDate,
    })),
  ];
  const categoryOptions = [...new Map((tab === "hospitals" ? hospitals : pharmacies).map((location) => [location.categoryKey, location.category])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const searchSuggestions = (tab === "hospitals" ? hospitals : pharmacies)
    .filter((location) => !location.name.includes("nom non renseigné"))
    .filter((location) => !search || `${location.name} ${location.city}`.toLowerCase().includes(search))
    .slice(0, 50);
  const matchesLocation = (location: { categoryKey: string; name: string; city: string; category: string }) =>
    (categoryFilter === "all" || location.categoryKey === categoryFilter) &&
    `${location.name} ${location.city} ${location.category}`.toLowerCase().includes(search);
  const matchingHospitals = hospitals.filter(matchesLocation);
  const matchingPharmacies = pharmacies.filter(matchesLocation);
  const visibleHospitals = matchingHospitals.slice(page * pageSize, (page + 1) * pageSize);
  const visiblePharmacies = matchingPharmacies.slice(page * pageSize, (page + 1) * pageSize);
  const matchingCount = tab === "hospitals" ? matchingHospitals.length : matchingPharmacies.length;
  const updateQuery = (value: string) => { setQuery(value); setPage(0); };
  const updateCategory = (value: string) => { setCategoryFilter(value); setPage(0); };

  return (
    <div>
      <PageHeading eyebrow="RÉSEAU DE SANTÉ" title="Trouver un centre" subtitle="Établissements de santé et pharmacies cartographiés au Bénin. Vérifiez les informations avant de vous déplacer." />
      <div className="location-toolbar">
        <div className="tabs">
          <button className={tab === "hospitals" ? "active" : ""} onClick={() => { setTab("hospitals"); updateCategory("all"); }}>Établissements & professionnels ({hospitals.length})</button>
          <button className={tab === "pharmacies" ? "active" : ""} onClick={() => { setTab("pharmacies"); updateCategory("all"); }}>Pharmacies ({pharmacies.length})</button>
        </div>
        <label className="field location-category-filter"><span>Type</span><select value={categoryFilter} onChange={(event) => updateCategory(event.target.value)}><option value="all">Tous les types</option>{categoryOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="search-field">
          <Search size={16} />
          <input value={query} onChange={(e) => updateQuery(e.target.value)} placeholder="Rechercher un nom ou une ville..." list="health-location-suggestions" aria-label="Rechercher un établissement par nom ou ville" />
          <datalist id="health-location-suggestions">{searchSuggestions.map((location) => <option key={location.id} value={location.name} label={`${location.city} · ${location.category}`} />)}</datalist>
        </div>
      </div>

      <div className="location-grid">
        {tab === "hospitals" ? (
          visibleHospitals.length ? (
            visibleHospitals.map((hospital) => (
              <div className="location-card" key={hospital.id}>
                <div className="location-card-head">
                  <div>
                    <span className="type-tag blue">{hospital.category.toUpperCase()}</span>
                    <h3>{hospital.name}</h3>
                  </div>
                  <Hospital size={22} className="location-icon" />
                </div>
                <p><MapPin size={14} /> {hospital.address ? `${hospital.address}, ` : ""}{hospital.city}</p>
                {hospital.phone && <p><Phone size={14} /> <a href={`tel:${hospital.phone}`}>{hospital.phone}</a></p>}
                <div className="location-card-foot">
                  {hospital.details ? <><span>{hospital.details}</span>{hospital.status && <StatusBadge status={hospital.status} />}</> : <span>Établissement cartographié · activité à confirmer</span>}
                </div>
                {hospital.sourceUrl && <p className="location-source">Source : {hospital.sourceName} · relevé du {shortDate(hospital.sourceSnapshotDate)} · {hospital.sourceLicense} · <a href={hospital.sourceUrl} target="_blank" rel="noreferrer">Voir la carte<ExternalLink size={12} /></a></p>}
              </div>
            ))
          ) : (
            <EmptyState title="Aucun établissement trouvé" />
          )
        ) : visiblePharmacies.length ? (
          visiblePharmacies.map((pharmacy) => (
            <div className="location-card" key={pharmacy.id}>
              <div className="location-card-head">
                <div>
                  <span className="type-tag mint">PHARMACIE</span>
                  <h3>{pharmacy.name}</h3>
                </div>
                <Pill size={22} className="location-icon" />
              </div>
              <p><MapPin size={14} /> {pharmacy.address ? `${pharmacy.address}, ` : ""}{pharmacy.city}</p>
              {pharmacy.phone && <p><Phone size={14} /> <a href={`tel:${pharmacy.phone}`}>{pharmacy.phone}</a></p>}
              <div className="location-card-foot">
                <span>{pharmacy.hours ? `Horaires déclarés : ${pharmacy.hours}` : "Horaires non renseignés"}</span>
                <span className="status-badge">Garde non renseignée</span>
              </div>
              {pharmacy.sourceUrl && <p className="location-source">Source : {pharmacy.sourceName} · relevé du {shortDate(pharmacy.sourceSnapshotDate)} · {pharmacy.sourceLicense} · <a href={pharmacy.sourceUrl} target="_blank" rel="noreferrer">Voir la carte<ExternalLink size={12} /></a></p>}
            </div>
          ))
        ) : (
          <EmptyState title="Aucune pharmacie trouvée" />
        )}
      </div>
      {matchingCount > pageSize && <div className="location-pagination">
        <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, matchingCount)} sur {matchingCount}</span>
        <button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
        <button className="btn btn-outline btn-sm" disabled={(page + 1) * pageSize >= matchingCount} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>}
      <p className="location-data-note">Les noms proposés sont ceux des lieux ou cabinets cartographiés, pas un annuaire vérifié de médecins individuels. Ces données OpenStreetMap peuvent être incomplètes ou anciennes et ne confirment ni l’activité ni l’ouverture. Les médecins réservables doivent être inscrits et validés dans le réseau SANTÉ+. Aucun calendrier de pharmacie de garde daté et vérifiable n’étant disponible, aucune garde actuelle n’est affichée. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Attribution et licence OpenStreetMap<ExternalLink size={12} /></a></p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11. Assistant santé                                                */
/* ------------------------------------------------------------------ */

function PatientAssistant({ go, openEmergency }: ScreenProps) {
  const [messages, setMessages] = useState<Array<{ sender: "user" | "bot"; text: string; assessment?: SymptomAssessment }>>([
    {
      sender: "bot",
      text: "Bonjour ! Je suis l'assistant d'orientation SANTÉ+. Décrivez vos symptômes et je vous guiderai vers le service ou le professionnel adapté. En cas d'urgence vitale, contactez immédiatement le SAMU (112 / 118).",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Aucune donnée ne part vers un service externe sans accord explicite : le
  // consentement est demandé une fois, ici, et reste sous contrôle du patient.
  const [aiConsent, setAiConsent] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text }]);
    setLoading(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ symptoms: text, aiConsent }),
      });
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: data.reply || "Je vous invite à consulter un médecin pour une évaluation clinique complète.",
          assessment: data.assessment,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Impossible de joindre le service d'orientation pour le moment. Consultez un praticien." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeading eyebrow="ORIENTATION CLINIQUE" title="Assistant de santé" subtitle="Évaluez vos symptômes et obtenez des conseils d'orientation sécurisés." />
      <div className="assistant-layout">
        <div className="card assistant-chat-card">
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div className={`chat-bubble ${m.sender}`} key={i}>
                <p>{m.text}</p>
                {m.assessment?.level === "urgence" && (
                  <div className="alert-urgent">
                    <AlertCircle size={16} />
                    <span>Urgence détectée : consultez sans délai un service d’urgences.</span>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="chat-bubble bot"><span className="typing-dots">Analyse en cours...</span></div>}
          </div>
          <label className="assistant-consent">
            <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
            <span>J’accepte qu’un service d’intelligence artificielle externe analyse mon texte pour affiner l’orientation. Sans cet accord, l’analyse reste locale.</span>
          </label>
          <form className="chat-input-row" onSubmit={send}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Décrivez ce que vous ressentez (fièvre, douleurs, toux...)"
              disabled={loading}
            />
            <button className="btn btn-primary" disabled={loading || !input.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>

        <div className="assistant-side">
          <div className="card card-pad">
            <SectionHeading title="Avertissement médical" subtitle="Outil d’aide à la décision" />
            <p className="setting-note">Cet assistant ne fournit pas de diagnostic médical et ne remplace pas une consultation avec un médecin qualifié.</p>
            <button className="btn btn-primary btn-full" onClick={() => go("appointments")}>
              <CalendarDays size={16} /> Prendre un rendez-vous
            </button>
            <button className="btn btn-danger btn-full" style={{ marginTop: 10 }} onClick={openEmergency}>
              <HeartPulse size={16} /> Numéros d’urgence (112)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 12. Notifications                                                  */
/* ------------------------------------------------------------------ */

function PatientNotifications({ data, act }: ScreenProps) {
  const items = [...data.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <PageHeading
        eyebrow="MON ESPACE PATIENT"
        title="Notifications"
        subtitle="Vos rappels, confirmations de rendez-vous et actualités de santé."
        action={
          items.some((item) => !item.isRead) && (
            <button className="btn btn-outline" onClick={() => act("markAllNotifications").catch(() => {})}>
              <Check size={17} /> Tout marquer comme lu
            </button>
          )
        }
      />
      <section className="card card-pad">
        <SectionHeading title="Toutes mes notifications" subtitle={`${items.filter((item) => !item.isRead).length} non lue(s)`} />
        {items.length ? (
          items.map((item) => (
            <button
              className={`notification-row ${!item.isRead ? "unread" : ""}`}
              key={item.id}
              onClick={() => {
                if (!item.isRead) act("markNotification", { id: item.id }).catch(() => {});
              }}
            >
              <div className={`list-icon ${item.category === "rendez-vous" ? "blue" : item.category === "securite" ? "orange" : "mint"}`}>
                {item.category === "rendez-vous" ? <CalendarDays size={18} /> : item.category === "securite" ? <ShieldCheck size={18} /> : <Bell size={18} />}
              </div>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <span>{shortDate(item.createdAt)} · {hour(item.createdAt)}</span>
              </div>
              {!item.isRead && <i className="notification-dot" />}
            </button>
          ))
        ) : (
          <EmptyState icon={Bell} title="Tout est à jour" description="Vos prochaines alertes et rappels s'afficheront ici." />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 13. Paramètres & Sécurité                                          */
/* ------------------------------------------------------------------ */

function PatientSettings({ data, toast, go }: ScreenProps) {
  const router = useRouter();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const [largeText, setLargeText] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLargeText(localStorage.getItem("sante_large_text") === "true");
      setOffline(localStorage.getItem("sante_offline_enabled") === "true");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (newPw !== confirmPw) {
      setPwError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    const weakness = passwordProblem(newPw, { email: data.user.email, fullName: data.user.fullName });
    if (weakness) {
      setPwError(weakness);
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "changePassword",
          currentPassword: currentPw,
          newPassword: newPw,
          confirmPassword: confirmPw,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Impossible de mettre à jour le mot de passe.");
      setPwSuccess("Votre mot de passe a été modifié avec succès. Vos autres sessions ont été déconnectées.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      toast("Mot de passe mis à jour.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Erreur lors du changement de mot de passe.");
    } finally {
      setPwSaving(false);
    }
  };

  const logoutAll = async () => {
    if (!window.confirm("Êtes-vous sûr(e) de vouloir fermer toutes vos sessions sur tous vos appareils ?")) return;
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "logoutAll" }),
      });
      router.replace("/connexion"); router.refresh();
    } catch {
      toast("Erreur lors de la déconnexion.", "error");
    }
  };

  const toggleLarge = () => {
    const next = !largeText;
    setLargeText(next);
    localStorage.setItem("sante_large_text", String(next));
    document.documentElement.classList.toggle("large-text", next);
    toast(next ? "Grande police activée." : "Taille de police standard activée.");
  };

  const toggleOffline = () => {
    const next = !offline;
    setOffline(next);
    localStorage.setItem("sante_offline_enabled", String(next));
    if ("serviceWorker" in navigator) {
      if (next) navigator.serviceWorker.register("/sw.js").catch(() => {});
      else navigator.serviceWorker.getRegistrations().then((items) => items.forEach((item) => item.unregister()));
    }
    toast(next ? "Mode hors ligne activé pour cet appareil." : "Mode hors ligne désactivé.");
  };

  const speak = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `Bonjour ${firstName(data.user.fullName)}. Bienvenue dans votre espace SANTÉ plus. Votre identifiant patient est ${data.user.npi || "non renseigné"}.`
      );
      utterance.lang = "fr-FR";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
      toast("Lecture vocale démarrée.");
    } else {
      toast("La lecture vocale n'est pas disponible dans ce navigateur.", "error");
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="MON COMPTE"
        title="Paramètres & Sécurité"
        subtitle="Gérez la sécurité de votre compte, votre mot de passe et vos préférences d'accessibilité."
      />

      <div className="settings-layout">
        <div className="card card-pad security-card">
          <SectionHeading
            title="Sécurité du mot de passe"
            subtitle="Changez votre mot de passe pour protéger votre dossier médical."
          />
          {pwError && <div className="form-error" role="alert">{pwError}</div>}
          {pwSuccess && <div className="form-info" role="status"><CheckCircle2 size={16} />{pwSuccess}</div>}
          <form className="form-stack" onSubmit={changePassword}>
            <label className="field">
              <span>Mot de passe actuel *</span>
              <div className="input-icon">
                <LockKeyhole size={16} />
                <input
                  type={pwVisible ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Nouveau mot de passe *</span>
                <div className="input-icon">
                  <LockKeyhole size={16} />
                  <input
                    type={pwVisible ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="12 caractères minimum"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <button
                    type="button"
                    className="input-trailing"
                    onClick={() => setPwVisible(!pwVisible)}
                    aria-label={pwVisible ? "Masquer" : "Afficher"}
                  >
                    {pwVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="field">
                <span>Confirmer le mot de passe *</span>
                <div className="input-icon">
                  <ShieldCheck size={16} />
                  <input
                    type={pwVisible ? "text" : "password"}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Répétez"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </div>
              </label>
            </div>
            <p className="form-help">
              Le mot de passe doit comporter au moins 12 caractères et mélanger lettres et chiffres.
            </p>
            <button className="btn btn-primary" disabled={pwSaving || !currentPw || !newPw}>
              {pwSaving ? "Mise à jour en cours..." : "Mettre à jour le mot de passe"}
            </button>
          </form>

          <div className="sessions-box">
            <SectionHeading
              title="Gestion des sessions"
              subtitle="Contrôlez les accès connectés à votre compte patient."
            />
            <div className="session-current-row">
              <div>
                <strong>Session courante</strong>
                <p className="muted-small">Connecté sur cet appareil · Cookie chiffré HTTP-Only</p>
              </div>
              <span className="status-badge status-positive"><i></i> Actif</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={logoutAll}>
                <LogOut size={16} /> Déconnecter tous les appareils
              </button>
            </div>
          </div>
        </div>

        <div className="settings-side">
          <div className="card card-pad">
            <SectionHeading
              title="Accessibilité"
              subtitle="Une interface adaptée à vos besoins"
            />
            <div className="setting-option">
              <div className="list-icon blue"><Volume2 size={19} /></div>
              <div>
                <strong>Lecture vocale</strong>
                <span>Écouter un résumé de mon espace</span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={speak}>Écouter</button>
            </div>
            <div className="setting-option">
              <div className="list-icon purple"><FileText size={19} /></div>
              <div>
                <strong>Grande police</strong>
                <span>Améliorer la lisibilité du texte</span>
              </div>
              <button
                className={`toggle-switch ${largeText ? "on" : ""}`}
                onClick={toggleLarge}
                aria-label="Activer la grande police"
                aria-pressed={largeText}
              ><i /></button>
            </div>
          </div>

          <div className="card card-pad">
            <SectionHeading
              title="Accès hors ligne"
              subtitle="Restez informé même sans connexion"
            />
            <div className="setting-option">
              <div className="list-icon mint"><WifiOff size={19} /></div>
              <div>
                <strong>Mode hors ligne</strong>
                <span>Conserver uniquement l’interface, sans données médicales</span>
              </div>
              <button
                className={`toggle-switch ${offline ? "on" : ""}`}
                onClick={toggleOffline}
                aria-label="Activer le mode hors ligne"
                aria-pressed={offline}
              ><i /></button>
            </div>
            <p className="setting-note">
              Seule l’interface publique est disponible sans réseau. Aucune donnée médicale n’est conservée dans le navigateur pour des raisons de confidentialité.
            </p>
          </div>

          <div className="card card-pad">
            <SectionHeading
              title="Confidentialité & Droits"
              subtitle="Contrôlez vos données de santé"
            />
            <p className="setting-note">
              Vous disposez d’un droit d’accès, de rectification, d’effacement et de portabilité conformément à la loi 2017-20.
            </p>
            <button className="btn btn-soft btn-full" onClick={() => go("privacy")}>
              <ShieldCheck size={16} /> Ouvrir le centre de confidentialité
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
