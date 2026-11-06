"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Building2, FileText, Search, ShieldCheck, ShieldX, Stethoscope, UserRound } from "lucide-react";
import { PatientDetailModal, StatusBadge } from "@/components/shared";

/**
 * Recherche d'une identité santé par NPI, nom ou téléphone.
 *
 * Le résultat distingue trois niveaux, affichés explicitement :
 * - « dossier ouvert » : le consentement de soins est valide, l'accès est possible ;
 * - « fiche seule » : l'identité existe mais le dossier reste clos ;
 * - « accès refusé » : le patient n'a rien accordé à cette structure.
 *
 * Un refus n'est pas une erreur : c'est le fonctionnement normal du consentement,
 * et l'interface doit le dire sans le présenter comme une panne.
 */

type SearchResult = {
  id: number;
  fullName: string;
  npi: string | null;
  role: string;
  city: string | null;
  hospital: { id: number; name: string; shortName: string; city: string } | null;
  doctor: { specialty: string; status: string; licenseNumber: string; yearsExperience: number } | null;
  isActive: boolean;
  access: "dossier" | "fiche" | "refus";
  reason: string;
  dossier: { appointments: number; detailUrl: string } | null;
};

const ROLE_LABELS: Record<string, string> = {
  patient: "Patient",
  doctor: "Médecin",
  hospital: "Établissement",
  admin: "Administrateur",
};

const ACCESS_LABELS: Record<SearchResult["access"], string> = {
  dossier: "Dossier ouvert",
  fiche: "Fiche seule",
  refus: "Accès refusé",
};

export function IdentitySearch({ role }: { role: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openPatient, setOpenPatient] = useState<number | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) { setError("Saisissez au moins 3 caractères (NPI, nom ou téléphone)."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/identity/search?q=${encodeURIComponent(query.trim())}`, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Recherche impossible.");
      setResults(payload.results || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recherche impossible.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">IDENTIFICATION SÉCURISÉE</span>
          <h1>Rechercher une identité</h1>
          <p>Retrouvez un patient par son NPI, son nom ou son téléphone, puis accédez à son dossier si le consentement de soins le permet.</p>
        </div>
      </div>

      <section className="card card-pad">
        <form onSubmit={submit} className="identity-search-form">
          <div className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="NPI (SP-2026-XXXXXX), nom ou téléphone"
              aria-label="Rechercher une identité par NPI, nom ou téléphone"
            />
          </div>
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Recherche..." : "Rechercher"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
        <p className="identity-search-note">
          <ShieldCheck size={14} />
          Chaque recherche est enregistrée dans le journal d’audit. Le dossier médical ne s’ouvre que si le patient a accordé son consentement à votre structure.
        </p>
        {error && <p className="identity-search-error"><AlertCircle size={15} />{error}</p>}
      </section>

      {results !== null && (
        results.length === 0 ? (
          <section className="card card-pad identity-empty">
            <div className="empty-icon"><UserRound size={24} /></div>
            <h3>Aucune identité trouvée</h3>
            <p>Vérifiez le NPI : il figure sur la carte SANTÉ+ du patient et sur ses documents. Un NPI comporte 12 caractères, au format SP-AAAA-XXXXXX.</p>
          </section>
        ) : (
          <div className="identity-results">
            {results.map((item) => (
              <article className={`card identity-card identity-${item.access}`} key={item.id}>
                <div className="identity-head">
                  <div className="list-icon mint">
                    {item.role === "doctor" ? <Stethoscope size={20} /> : item.role === "hospital" ? <Building2 size={20} /> : <UserRound size={20} />}
                  </div>
                  <div>
                    <h3>{item.fullName}</h3>
                    <span className="mono-text">{item.npi || "Sans NPI"}</span>
                  </div>
                  <span className={`identity-access identity-access-${item.access}`}>
                    {item.access === "dossier" ? <ShieldCheck size={13} /> : item.access === "refus" ? <ShieldX size={13} /> : <FileText size={13} />}
                    {ACCESS_LABELS[item.access]}
                  </span>
                </div>

                <div className="identity-meta">
                  <div><span>Rôle</span><strong>{ROLE_LABELS[item.role] || item.role}</strong></div>
                  <div><span>Ville</span><strong>{item.city || "—"}</strong></div>
                  <div><span>Établissement</span><strong>{item.hospital?.shortName || "—"}</strong></div>
                  {item.doctor && <div><span>Spécialité</span><strong>{item.doctor.specialty}</strong></div>}
                  <div><span>Statut</span><StatusBadge status={item.isActive ? "actif" : "inactif"} /></div>
                </div>

                <p className="identity-reason">{item.reason}</p>

                <div className="identity-actions">
                  {item.access === "dossier" ? (
                    <button className="btn btn-primary" onClick={() => setOpenPatient(item.id)}>
                      <FileText size={16} />Ouvrir le dossier
                    </button>
                  ) : (
                    <button className="btn btn-outline" disabled title={item.reason}>
                      <ShieldX size={16} />Dossier non accessible
                    </button>
                  )}
                  {item.access === "refus" && role !== "patient" && (
                    <span className="identity-hint">Demandez au patient d’accorder un accès depuis son espace « Confidentialité & Droits ».</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )
      )}

      <PatientDetailModal patientId={openPatient} onClose={() => setOpenPatient(null)} role={role} />
    </div>
  );
}
