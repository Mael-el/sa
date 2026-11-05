"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowRight, CalendarDays, Check, ClipboardList, Download, FileText, HeartPulse, Search, ShieldCheck, X, type LucideIcon } from "lucide-react";
import type { AuditLog, BootstrapData, MedicalDocument, MedicalRecord, Prescription, UserView } from "@/lib/types";

export type ActionResult = { message?: string; credentials?: { email: string; password: string; role?: string }; [key: string]: unknown };
export type ScreenProps = {
  data: BootstrapData;
  go: (page: string) => void;
  act: (action: string, payload?: Record<string, unknown>) => Promise<ActionResult>;
  refresh: () => Promise<void>;
  toast: (message: string, type?: "success" | "error") => void;
  search: string;
  selectedPatientId: number | null;
  setSelectedPatientId: (id: number | null) => void;
  openEmergency: () => void;
};

export const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
export const shortDate = (value: string | Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
export const longDate = (value: string | Date) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
export const hour = (value: string | Date) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export const relativeDay = (value: string | Date) => {
  const date = new Date(value); const today = new Date();
  date.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  return days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : days > 1 ? `Dans ${days} jours` : shortDate(value);
};
export const firstName = (name: string) => name.replace(/^Dr\.\s*/i, "").split(" ")[0];
export const initials = (name: string) => name.replace(/^Dr\.\s*/i, "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S+";

export function Avatar({ name, size = 40, tone = 0, className = "" }: { name: string; size?: number; tone?: number; className?: string }) {
  const palette = ["#eff6ff|#2563eb", "#ecebfb|#7064b8", "#fcece7|#d4785b", "#e7f0fc|#4f83bd", "#fff1db|#bb8736"];
  const [backgroundColor, color] = palette[Math.abs(tone || name.length) % palette.length].split("|");
  return <span className={`avatar ${className}`} style={{ width: size, height: size, minWidth: size, fontSize: Math.max(11, size * 0.3), backgroundColor, color }}>{initials(name)}</span>;
}

export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const lower = status.toLocaleLowerCase("fr");
  const tone = ["confirmé", "payé", "actif", "effectué", "approuvé", "reçu", "terminé"].includes(lower) ? "positive" : ["annulé", "refusé", "inactif", "rupture"].includes(lower) ? "negative" : ["en livraison", "planifié"].includes(lower) ? "info" : "warning";
  return <span className={`status-badge status-${tone}`}>{dot && <i />}<span>{status.charAt(0).toUpperCase() + status.slice(1)}</span></span>;
}

export function Modal({ open, onClose, title, subtitle, children, size = "medium" }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; size?: "small" | "medium" | "large" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation"><div className={`modal-panel modal-${size}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={19} /></button></div><div className="modal-body">{children}</div></div></div>;
}

export function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-link" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>;
}

export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function MetricCard({ icon: Icon, label, value, sub, tone = "mint", onClick }: { icon: LucideIcon; label: string; value: string | number; sub?: string; tone?: "mint" | "blue" | "purple" | "orange" | "rose"; onClick?: () => void }) {
  const content = <><div className={`metric-icon metric-${tone}`}><Icon size={20} strokeWidth={2} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{sub && <div className="metric-sub">{sub}</div>}</>;
  return onClick ? <button className="metric-card metric-clickable" onClick={onClick}>{content}</button> : <div className="metric-card">{content}</div>;
}

export function EmptyState({ icon: Icon = ClipboardList, title, description, action, onAction }: { icon?: LucideIcon; title: string; description?: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={25} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action && <button className="btn btn-primary" onClick={onAction}>{action}</button>}</div>;
}

export function DateTile({ value }: { value: string | Date }) {
  const date = new Date(value);
  return <div className="date-tile"><strong>{new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(date)}</strong><span>{new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", "")}</span></div>;
}

export function MiniBars({ values, labels, color = "#2563eb" }: { values: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...values, 1);
  return <div className="mini-bars">{values.map((value, index) => <div className="mini-bar-col" key={index}><span className="mini-bar-value">{value}</span><div className="mini-bar-track"><div style={{ height: `${Math.max(8, value / max * 100)}%`, background: color }} /></div><span className="mini-bar-label">{labels[index]}</span></div>)}</div>;
}

export function AuditTimeline({ logs, users }: { logs: AuditLog[]; users: UserView[] }) {
  if (!logs.length) return <EmptyState icon={ShieldCheck} title="Aucune activité enregistrée" description="Les actions effectuées apparaîtront ici." />;
  return <div className="activity-list">{[...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log) => <div className="activity-row" key={log.id}><div className="activity-icon"><ShieldCheck size={17} /></div><div className="activity-copy"><strong>{log.action}</strong><span>{log.resource}{log.details ? ` · ${log.details}` : ""}</span><small>{users.find((user) => user.id === log.userId)?.fullName || "Système"} · {shortDate(log.createdAt)} à {hour(log.createdAt)}</small></div></div>)}</div>;
}

type PatientDetails = { patient: UserView; records: MedicalRecord[]; prescriptions: Prescription[]; appointments: { id: number; scheduledAt: string; status: string }[]; documents: MedicalDocument[] };

export function PatientDetailModal({ patientId, onClose, onConsult, role }: { patientId: number | null; onClose: () => void; onConsult?: (id: number) => void; role: string }) {
  const [detail, setDetail] = useState<PatientDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("historique");
  const [prevPatientId, setPrevPatientId] = useState(patientId);
  if (patientId !== prevPatientId) {
    setPrevPatientId(patientId);
    setDetail(null);
    setLoading(Boolean(patientId));
    setTab("historique");
  }
  useEffect(() => {
    if (!patientId) return;
    const controller = new AbortController();
    fetch(`/api/patient/${patientId}`, { signal: controller.signal }).then((response) => response.json()).then((result) => { if (!controller.signal.aborted) setDetail(result.patient ? result : null); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [patientId]);
  return <Modal open={Boolean(patientId)} onClose={onClose} title="Dossier du patient" subtitle="Accès tracé dans le journal d'audit" size="large">{loading || !detail ? <div className="loading-inline"><div className="spinner" />Chargement sécurisé du dossier...</div> : <><div className="detail-profile"><Avatar name={detail.patient.fullName} size={58} /><div><h3>{detail.patient.fullName}</h3><p>{detail.patient.npi || "NPI non renseigné"} · {detail.patient.city}</p></div><div className="detail-blood"><HeartPulse size={16} />{detail.patient.bloodGroup || "—"}</div></div><div className="detail-mini-stats"><div><span>Consultations</span><strong>{detail.records.filter((item) => item.category === "consultation").length}</strong></div><div><span>Ordonnances</span><strong>{detail.prescriptions.length}</strong></div><div><span>Documents</span><strong>{detail.documents.length}</strong></div></div><div className="tabs" role="tablist">{[["historique", "Historique"], ["ordonnances", "Ordonnances"], ["documents", "Documents"]].map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</div>{tab === "historique" && <div className="detail-list">{detail.records.length ? [...detail.records].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).map((item) => <div className="detail-list-row" key={item.id}><div className="list-icon mint"><Activity size={17} /></div><div><strong>{item.title}</strong><p>{item.description}</p>{item.details && <small>{item.details}</small>}</div><span>{shortDate(item.recordedAt)}</span></div>) : <EmptyState title="Aucun antécédent enregistré" />}</div>}{tab === "ordonnances" && <div className="detail-list">{detail.prescriptions.length ? detail.prescriptions.map((item) => <div className="detail-list-row" key={item.id}><div className="list-icon blue"><FileText size={17} /></div><div><strong>{item.diagnosis}</strong><p>{item.medications.map((med) => `${med.name} ${med.dosage}`).join(" · ")}</p></div><a className="icon-button" href={`/api/export?type=prescription&id=${item.id}`} aria-label="Télécharger l'ordonnance"><Download size={17} /></a></div>) : <EmptyState title="Aucune ordonnance" />}</div>}{tab === "documents" && <div className="detail-list">{detail.documents.length ? detail.documents.map((item) => <div className="detail-list-row" key={item.id}><div className="list-icon purple"><FileText size={17} /></div><div><strong>{item.title}</strong><p>{item.fileName}</p></div>{role !== "admin" && <a className="icon-button" href={`/api/documents/${item.id}`} aria-label="Télécharger le document"><Download size={17} /></a>}</div>) : <EmptyState title="Aucun document" />}</div>}<div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Fermer</button>{role !== "admin" && <a className="btn btn-soft" href={`/api/export?type=dossier&patientId=${patientId}`}><Download size={16} />Exporter le dossier</a>}{onConsult && <button className="btn btn-primary" onClick={() => { onConsult(detail.patient.id); onClose(); }}><CalendarDays size={16} />Nouvelle consultation</button>}</div></>}</Modal>;
}

export function SearchField({ value, onChange, placeholder = "Rechercher...", className = "" }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <div className={`search-field ${className}`}><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>;
}

export function CheckIcon() { return <span className="check-icon"><Check size={14} /></span>; }
