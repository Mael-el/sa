"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, ArrowRight, Bell, BedDouble, Building2, CalendarDays, Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Droplets, FileBarChart2, FileHeart, FileText, HeartHandshake, HeartPulse, Hospital, LayoutDashboard, LockKeyhole, LogOut, MapPin, Menu, MessageCircle, Package, Phone, Pill, Plus, ScanLine, Search, Settings2, ShieldCheck, ShoppingCart, Sparkles, Stethoscope, UserCheck, UserRound, Users, Wallet, WifiOff, X, type LucideIcon } from "lucide-react";
import { AdminPage } from "@/components/admin-pages";
import { AuthModal } from "@/components/auth-modal";
import { DoctorPage } from "@/components/doctor-pages";
import { HospitalPage } from "@/components/hospital-pages";
import { PatientPage } from "@/components/patient-pages";
import { WelcomeScreen } from "@/components/welcome-screen";
import { Avatar, Modal, firstName, type ActionResult, type ScreenProps } from "@/components/shared";
import type { BootstrapData, Role } from "@/lib/types";

type NavItem = { id: string; label: string; icon: LucideIcon; badge?: string };
type NavGroup = { title: string; items: NavItem[] };
const navigation: Record<Role, NavGroup[]> = {
  patient: [
    {
      title: "SANTÉ & SOINS",
      items: [
        { id: "overview", label: "Tableau de bord", icon: LayoutDashboard },
        { id: "profile", label: "Profil personnel", icon: UserRound },
        { id: "appointments", label: "Mes rendez-vous", icon: CalendarDays },
        { id: "records", label: "Dossier médical", icon: FileHeart },
        { id: "prescriptions", label: "Mes ordonnances", icon: Pill },
        { id: "results", label: "Résultats d'examens", icon: Activity },
      ],
    },
    {
      title: "SUIVI & SERVICES",
      items: [
        { id: "history", label: "Historique & Suivi", icon: ClipboardList },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "payments", label: "Paiements", icon: Wallet },
        { id: "donations", label: "Don de sang", icon: Droplets },
        { id: "locations", label: "Trouver un centre", icon: MapPin },
        { id: "assistant", label: "Assistant santé", icon: Sparkles },
      ],
    },
    {
      title: "SÉCURITÉ & COMPTE",
      items: [
        { id: "settings", label: "Paramètres & Sécurité", icon: Settings2 },
        { id: "privacy", label: "Confidentialité & Droits", icon: ShieldCheck },
      ],
    },
  ],
  doctor: [
    { title: "MENU PRINCIPAL", items: [{ id: "overview", label: "Vue d’ensemble", icon: LayoutDashboard }, { id: "patients", label: "Mes patients", icon: Users }, { id: "consultations", label: "Consultations", icon: Stethoscope }, { id: "agenda", label: "Mon agenda", icon: CalendarDays }, { id: "prescriptions", label: "Ordonnances", icon: Pill }] },
    { title: "SÉCURITÉ", items: [{ id: "audit", label: "Journal d’audit", icon: ShieldCheck }, { id: "settings", label: "Paramètres", icon: Settings2 }] },
  ],
  hospital: [
    { title: "MENU PRINCIPAL", items: [{ id: "overview", label: "Vue d’ensemble", icon: LayoutDashboard }, { id: "doctors", label: "Médecins", icon: Stethoscope }, { id: "patients", label: "Patients & dossiers", icon: Users }, { id: "services", label: "Services & lits", icon: BedDouble }, { id: "pharmacy", label: "Pharmacie & stocks", icon: Pill }] },
    { title: "GESTION", items: [{ id: "orders", label: "Commandes", icon: ShoppingCart }, { id: "finances", label: "Ventes & finances", icon: Wallet }, { id: "blood", label: "Stock de sang", icon: Droplets }, { id: "reports", label: "Rapports", icon: FileBarChart2 }] },
    { title: "SÉCURITÉ", items: [{ id: "audit", label: "Journal d’audit", icon: ShieldCheck }, { id: "settings", label: "Paramètres", icon: Settings2 }] },
  ],
  admin: [
    { title: "MENU PRINCIPAL", items: [{ id: "overview", label: "Vue nationale", icon: LayoutDashboard }, { id: "access", label: "Demandes d’accès", icon: UserCheck }, { id: "users", label: "Utilisateurs", icon: Users }, { id: "hospitals", label: "Établissements", icon: Hospital }, { id: "patients", label: "Patients", icon: UserRound }] },
    { title: "SUPERVISION", items: [{ id: "payments", label: "Paiements", icon: Wallet }, { id: "statistics", label: "Statistiques", icon: FileBarChart2 }, { id: "privacy", label: "Droits des patients", icon: LockKeyhole }, { id: "audit", label: "Journal d’audit", icon: ShieldCheck }, { id: "settings", label: "Paramètres", icon: Settings2 }] },
  ],
};
const roleNames: Record<Role, string> = { patient: "Patient", doctor: "Médecin", hospital: "Hôpital", admin: "Admin SANTÉ+" };

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}
const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

export function DashboardApp() {
  const router = useRouter();
  const [data, setData] = useState<BootstrapData | null>(null);
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleMenu, setRoleMenu] = useState(false);
  const [notificationMenu, setNotificationMenu] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authStage, setAuthStage] = useState<"login" | "register" | "access">("login");
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [toastState, setToastState] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToastState({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) { setData(null); setLoadError("AUTH_REQUIRED"); return; }
      if (!response.ok) throw new Error(result.error || "Chargement impossible.");
      setData(result as BootstrapData);
      setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Connexion indisponible."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    localStorage.removeItem("sante_offline_snapshot");
    if (localStorage.getItem("sante_offline_enabled") === "true" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (localStorage.getItem("sante_large_text") === "true") document.documentElement.classList.add("large-text");
    // Initial data fetch; state updates happen after the awaited network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return undefined;
  }, [refresh]);

  const go = useCallback((target: string) => {
    setPage(target); setMobileMenu(false); setNotificationMenu(false); setRoleMenu(false); setSearch("");
    window.history.replaceState(null, "", target === "overview" ? window.location.pathname : `#${target}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}): Promise<ActionResult> => {
    if (!navigator.onLine) { toast("Cette action nécessite une connexion internet.", "error"); throw new Error("Mode hors ligne"); }
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
      await refresh();
      if (result.message) toast(result.message);
      return result as ActionResult;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Une erreur est survenue.", "error");
      throw error;
    }
  }, [refresh, toast]);

  const logout = async () => {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setRoleMenu(false);
    toast("Vous êtes déconnecté(e).");
    router.replace("/connexion"); router.refresh();
  };

  if (!data && !loading && loadError === "AUTH_REQUIRED") return <WelcomeScreen authOpen={authOpen} authStage={authStage} onAuthClose={() => setAuthOpen(false)} onAuthOpen={(stage) => { setAuthStage(stage ?? "login"); setAuthOpen(true); }} onAuthenticated={async () => { await refresh(); go("overview"); }} toast={toast} />;
  if (!data) return <div className="loading-screen"><div className="loading-brand"><span className="brand-mark"><Plus size={25} strokeWidth={3.5} /></span><span>SANTÉ<span>+</span></span></div><div className="spinner" /><p>{loading ? "Préparation de votre espace santé..." : loadError || "Connexion indisponible."}</p>{!loading && <button className="btn btn-primary" onClick={() => { setLoading(true); refresh(); }}>Réessayer <ArrowRight size={16} /></button>}</div>;

  const role = (data.user.role in navigation ? data.user.role : "patient") as Role;
  const groups = navigation[role];
  const validPage = groups.some((group) => group.items.some((item) => item.id === page)) ? page : "overview";
  const activeItem = groups.flatMap((group) => group.items).find((item) => item.id === validPage);
  const unread = data.notifications.filter((item) => !item.isRead).length;
  const screenProps: ScreenProps = { data, go, act, refresh, toast, search, selectedPatientId, setSelectedPatientId, openEmergency: () => setEmergencyOpen(true) };
  const searchSubmit = (event: FormEvent) => { event.preventDefault(); if (role === "patient") setPage("appointments"); else if (role === "admin") setPage("users"); else setPage("patients"); setMobileMenu(false); };

  return <div className="app-shell"><>{mobileMenu && <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="Fermer le menu" />}</><aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}><div className="sidebar-brand"><span className="brand-mark"><Plus size={24} strokeWidth={3.5} /></span><div><strong>SANTÉ<span>+</span></strong><small>LA SANTÉ CONNECTÉE</small></div><button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Fermer le menu"><X size={19} /></button></div><div className="sidebar-scroll">{groups.map((group) => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map((item) => { const Icon = item.icon; const badge = item.id === "notifications" ? unread : item.id === "access" ? data.requests.filter((request) => request.status === "en attente").length : 0; return <button className={`nav-item ${validPage === item.id ? "active" : ""}`} key={item.id} onClick={() => go(item.id)} aria-current={validPage === item.id ? "page" : undefined}><Icon size={19} strokeWidth={validPage === item.id ? 2.25 : 1.9} /><span>{item.label}</span>{badge > 0 && <i>{badge}</i>}</button>; })}</div>)}<div className="sidebar-help"><div className="sidebar-help-icon"><MessageCircle size={20} /></div><strong>Besoin d’aide ?</strong><p>Nous sommes là pour vous accompagner.</p><button onClick={() => role === "patient" ? go("assistant") : window.location.href = `mailto:${data.settings.find((item) => item.key === "support_email")?.value || "contact@santeplus.bj"}`}>Obtenir de l’aide <ArrowRight size={15} /></button></div>{role === "patient" && <button className="sidebar-emergency" onClick={() => setEmergencyOpen(true)}><HeartPulse size={18} />Urgence médicale<ChevronRight size={15} /></button>}</div><div className="sidebar-footer"><Avatar name={data.user.fullName} size={37} /><div><strong>{data.user.fullName}</strong><span>{roleNames[role]}</span></div><button className="icon-button sidebar-footer-more" onClick={() => setRoleMenu(!roleMenu)} aria-label="Changer de profil"><ChevronDown size={16} /></button></div></aside><div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Ouvrir le menu"><Menu size={21} /></button><div className="breadcrumb"><span>{role === "admin" ? "Administration" : role === "hospital" ? "Établissement" : role === "doctor" ? "Espace médecin" : "Espace patient"}</span><ChevronRight size={15} /><strong>{activeItem?.label || "Vue d’ensemble"}</strong></div></div><div className="topbar-right"><form className="top-search" onSubmit={searchSubmit}><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={role === "patient" ? "Rechercher un rendez-vous..." : role === "admin" ? "Rechercher un utilisateur..." : "Rechercher un patient..."} aria-label="Recherche globale" /><span>⌘ K</span></form><span className="topbar-divider" /><div className="topbar-popover-wrap"><button className="top-icon-button" onClick={() => { setNotificationMenu(!notificationMenu); setRoleMenu(false); }} aria-label="Notifications"><Bell size={20} />{unread > 0 && <i />}</button>{notificationMenu && <div className="popover notification-popover"><div className="popover-head"><strong>Notifications</strong><span>{unread} non lue{unread > 1 ? "s" : ""}</span></div>{data.notifications.length ? [...data.notifications].reverse().slice(0, 4).map((item) => <button className={`popover-notice ${!item.isRead ? "unread" : ""}`} key={item.id} onClick={() => { if (!item.isRead) act("markNotification", { id: item.id }).catch(() => {}); }}><span className="popover-notice-icon"><Bell size={16} /></span><span><strong>{item.title}</strong><small>{item.message}</small></span></button>) : <div className="popover-empty">Vous n’avez aucune notification.</div>}{role === "patient" && <button className="popover-link" onClick={() => go("notifications")}>Voir toutes les notifications <ArrowRight size={15} /></button>}</div>}</div><div className="topbar-popover-wrap"><button className="profile-trigger" onClick={() => { setRoleMenu(!roleMenu); setNotificationMenu(false); }} aria-label="Ouvrir le menu de profil"><Avatar name={data.user.fullName} size={37} /><ChevronDown size={16} /></button>{roleMenu && <div className="popover profile-popover"><div className="profile-popover-user"><Avatar name={data.user.fullName} size={43} /><div><strong>{data.user.fullName}</strong><span>{data.user.email}</span></div></div><div className="profile-menu-title">COMPTE</div><div className="profile-popover-actions"><button onClick={() => { setAuthOpen(true); setRoleMenu(false); }}><UserRound size={16} />Connexion / inscription</button><button onClick={logout}><LogOut size={16} />Se déconnecter</button></div></div>}</div></div></header>{!online && <div className="offline-banner"><WifiOff size={16} />Vous êtes hors ligne. Les dossiers médicaux ne sont jamais enregistrés localement ; reconnectez-vous pour les consulter.</div>}<main className="content-area">{role === "patient" ? <PatientPage page={validPage} {...screenProps} /> : role === "doctor" ? <DoctorPage page={validPage} {...screenProps} /> : role === "hospital" ? <HospitalPage page={validPage} {...screenProps} /> : <AdminPage page={validPage} {...screenProps} />}<footer className="app-footer"><span>© 2026 SANTÉ+ Bénin. Tous droits réservés.</span><span><ShieldCheck size={14} />Vos données de santé, notre priorité</span><a href="/confidentialite">Confidentialité</a></footer></main></div><AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={async () => { await refresh(); go("overview"); }} toast={toast} /><Modal open={emergencyOpen} onClose={() => setEmergencyOpen(false)} title="Besoin d’aide urgente ?" subtitle="Au Bénin, ces services sont joignables directement par téléphone." size="small"><div className="emergency-modal-intro"><AlertCircle size={20} />En cas d’urgence vitale, appelez immédiatement les secours. N’attendez pas une réponse en ligne.</div><div className="emergency-numbers"><a href="tel:112"><span className="emergency-number-icon samu"><HeartPulse size={22} /></span><span><strong>SAMU Bénin</strong><small>Urgences médicales</small></span><b>112</b><Phone size={18} /></a><a href="tel:118"><span className="emergency-number-icon fire"><Activity size={22} /></span><span><strong>Sapeurs-pompiers</strong><small>Secours & incendies</small></span><b>118</b><Phone size={18} /></a><a href="tel:117"><span className="emergency-number-icon police"><ShieldCheck size={22} /></span><span><strong>Police Républicaine</strong><small>Sécurité & assistance</small></span><b>117</b><Phone size={18} /></a></div><p className="emergency-source">Numéros confirmés par les sources publiques béninoises et consulaires. Appels selon disponibilité de votre réseau.</p></Modal>{toastState && <div className={`toast-message ${toastState.type}`} role="status"><span>{toastState.type === "success" ? <Check size={17} /> : <AlertCircle size={17} />}</span>{toastState.message}<button onClick={() => setToastState(null)} aria-label="Fermer"><X size={16} /></button></div>}</div>;
}
