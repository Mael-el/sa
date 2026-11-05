"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileHeart,
  FileText,
  HeartPulse,
  Hospital,
  LockKeyhole,
  Menu,
  Newspaper,
  Phone,
  Plus,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
import { ARTICLES } from "@/lib/news";

export function WelcomeScreen({
  authOpen,
  authStage = "login",
  onAuthClose,
  onAuthOpen,
  onAuthenticated,
  toast,
}: {
  authOpen: boolean;
  authStage?: "login" | "register" | "access";
  onAuthClose: () => void;
  onAuthOpen: (stage?: "login" | "register" | "access") => void;
  onAuthenticated: () => Promise<void>;
  toast: (message: string, type?: "success" | "error") => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const featuredArticles = ARTICLES.slice(0, 3);

  return (
    <div className="public-site classic-site">
      {/* BANDEAU INSTITUTIONNEL RÉPUBLICAIN */}
      <div className="institution-topbar">
        <div className="institution-topbar-inner">
          <div className="institution-flag-wrap">
            <span className="flag-bar green" />
            <span className="flag-bar yellow" />
            <span className="flag-bar red" />
            <strong>RÉPUBLIQUE DU BÉNIN</strong>
            <span className="institution-sep">·</span>
            <span>MINISTÈRE DE LA SANTÉ</span>
          </div>
          <div className="institution-top-meta">
            <span><ShieldCheck size={13} /> Plateforme Nationale Sécurisée</span>
            <span className="institution-sep">·</span>
            <span><LockKeyhole size={13} /> Conforme Loi n° 2017-20 (APDP)</span>
          </div>
        </div>
      </div>

      {/* EN-TÊTE PRINCIPAL */}
      <header className="public-header classic-header">
        <Link href="/" className="public-logo classic-logo">
          <span className="brand-mark classic-mark">
            <Plus size={22} strokeWidth={3} />
          </span>
          <div className="logo-titles">
            <strong>SANTÉ<span>+</span></strong>
            <small>DOSSIER MÉDICAL PARTAGÉ & SOINS</small>
          </div>
        </Link>
        <nav className="classic-nav">
          <a href="#piliers">La plateforme</a>
          <a href="#actualites">Actualités</a>
          <a href="#securite">Sécurité & Droits</a>
          <a href="#inscription">Inscription</a>
          <button
            type="button"
            className="public-nav-link"
            onClick={() => onAuthOpen("access")}
          >
            Professionnels
          </button>
        </nav>
        <div className="public-header-actions">
          <button className="btn btn-outline" onClick={() => onAuthOpen("login")}>
            Se connecter
          </button>
          <button className="btn btn-primary" onClick={() => onAuthOpen("register")}>
            Ouvrir mon dossier <ArrowRight size={15} />
          </button>
        </div>
        <button
          type="button"
          className="classic-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu de navigation"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* TIROIR DE NAVIGATION MOBILE */}
      {mobileMenuOpen && (
        <div className="classic-mobile-drawer">
          <nav className="classic-mobile-nav">
            <a href="#piliers" onClick={() => setMobileMenuOpen(false)}>
              La plateforme
            </a>
            <a href="#actualites" onClick={() => setMobileMenuOpen(false)}>
              Actualités & Recommandations
            </a>
            <a href="#securite" onClick={() => setMobileMenuOpen(false)}>
              Sécurité & Cadre Légal (APDP)
            </a>
            <a href="#inscription" onClick={() => setMobileMenuOpen(false)}>
              Inscription Patient
            </a>
            <button
              type="button"
              className="mobile-nav-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                onAuthOpen("access");
              }}
            >
              Espace Professionnels (Médecins & Établissements)
            </button>
          </nav>
          <div className="classic-mobile-actions">
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                setMobileMenuOpen(false);
                onAuthOpen("register");
              }}
            >
              Créer mon compte patient <ArrowRight size={15} />
            </button>
            <button
              className="btn btn-outline btn-full"
              onClick={() => {
                setMobileMenuOpen(false);
                onAuthOpen("login");
              }}
            >
              Se connecter à mon espace
            </button>
          </div>
        </div>
      )}

      <main>
        {/* HÉROS INSTITUTIONNEL CLASSIQUE */}
        <section className="classic-hero">
          <div className="classic-hero-inner">
            <div className="classic-hero-text">
              <div className="classic-kicker">
                <span className="kicker-badge">SYSTÈME NATIONAL</span>
                <span>COORDINATION CLINIQUE & DOSSIER PARTAGÉ</span>
              </div>
              <h1>Le dossier médical partagé, confidentiel et souverain.</h1>
              <p className="classic-lead">
                SANTÉ+ relie les citoyens béninois, les praticiens et les établissements de
                soins autour d’un dossier médical unique. Vos consultations, ordonnances et
                résultats d’examens sont centralisés sous votre contrôle exclusif.
              </p>

              <div className="classic-hero-buttons">
                <button
                  className="btn btn-primary btn-classic-lg"
                  onClick={() => onAuthOpen("register")}
                >
                  Créer mon compte patient <ArrowRight size={16} />
                </button>
                <button
                  className="btn btn-outline btn-classic-lg"
                  onClick={() => onAuthOpen("login")}
                >
                  Accéder à mon espace
                </button>
              </div>

              <div className="classic-trust-strip">
                <div className="trust-item">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Secret médical garanti</strong>
                    <span>Consentement préalable et révocable</span>
                  </div>
                </div>
                <div className="trust-item">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>Chiffrement des données</strong>
                    <span>Conformité APDP & Loi n° 2017-20</span>
                  </div>
                </div>
                <div className="trust-item">
                  <FileHeart size={18} />
                  <div>
                    <strong>Identifiant NPI unique</strong>
                    <span>Délivré dès l’inscription en ligne</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="classic-hero-visual">
              <div className="visual-frame">
                <Image
                  src="/images/doctor-hero.jpg"
                  alt="Consultation médicale dans un centre hospitalier au Bénin"
                  width={600}
                  height={500}
                  priority
                  className="visual-img"
                />
                <div className="visual-caption">
                  <div className="caption-icon"><Hospital size={16} /></div>
                  <div>
                    <strong>Réseau hospitalier national</strong>
                    <small>Hôpitaux publics, cliniques agréées et centres de santé</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LES QUATRE PILIERS DU RÉSEAU */}
        <section className="classic-section" id="piliers">
          <div className="classic-section-head">
            <span className="section-eyebrow">ORGANISATION DU RÉSEAU</span>
            <h2>Quatre espaces dédiés pour une continuité optimale des soins</h2>
            <p>
              Chaque acteur de la chaîne de santé dispose d’un portail professionnel sécurisé,
              avec des prérogatives et des niveaux d’accès strictement réglementés.
            </p>
          </div>

          <div className="classic-grid-four">
            <article className="classic-feature-card">
              <div className="card-header-icon blue">
                <UserRound size={22} />
              </div>
              <h3>Espace Patient</h3>
              <p>
                Dossier médical unique, prise de rendez-vous en ligne, ordonnances
                téléchargeables en PDF officiel et gestion autonome de vos consentements.
              </p>
              <ul className="classic-card-points">
                <li><CheckCircle2 size={14} /> Identifiant Santé+ et QR code personnel</li>
                <li><CheckCircle2 size={14} /> Historique chronologique de vos soins</li>
                <li><CheckCircle2 size={14} /> Accès gratuit depuis tout navigateur</li>
              </ul>
            </article>

            <article className="classic-feature-card">
              <div className="card-header-icon navy">
                <Stethoscope size={22} />
              </div>
              <h3>Espace Médecin</h3>
              <p>
                Cabinet numérique sécurisé : consultation du dossier sous accord du patient,
                saisie clinique, détection des interactions médicamenteuses et télétransmission.
              </p>
              <ul className="classic-card-points">
                <li><CheckCircle2 size={14} /> Authentification 2FA obligatoire</li>
                <li><CheckCircle2 size={14} /> Émission d’ordonnances certifiées</li>
                <li><CheckCircle2 size={14} /> Validation du numéro d’ordre des médecins</li>
              </ul>
            </article>

            <article className="classic-feature-card">
              <div className="card-header-icon slate">
                <Hospital size={22} />
              </div>
              <h3>Espace Établissement</h3>
              <p>
                Gestion hospitalière intégrée : coordination des équipes de soins, suivi en temps
                réel de l’occupation des lits, pharmacie hospitalière et réserves de sang.
              </p>
              <ul className="classic-card-points">
                <li><CheckCircle2 size={14} /> Supervision des admissions et des lits</li>
                <li><CheckCircle2 size={14} /> Stocks pharmaceutiques et seuils d’alerte</li>
                <li><CheckCircle2 size={14} /> Traçabilité des règlements et reçus</li>
              </ul>
            </article>

            <article className="classic-feature-card">
              <div className="card-header-icon gold">
                <Building2 size={22} />
              </div>
              <h3>Administration Nationale</h3>
              <p>
                Régulation de l’infrastructure de santé numérique : vérification des demandes
                d’accès, audit immuable des consultations et pilotage des indicateurs nationaux.
              </p>
              <ul className="classic-card-points">
                <li><CheckCircle2 size={14} /> Contrôle rigoureux des habilitations</li>
                <li><CheckCircle2 size={14} /> Journalisation intégrale des accès</li>
                <li><CheckCircle2 size={14} /> Respect des normes sanitaires béninoises</li>
              </ul>
            </article>
          </div>
        </section>

        {/* ACTUALITÉS & COMMUNIQUÉS OFFICIELS */}
        <section className="classic-section classic-bg-soft" id="actualites">
          <div className="classic-section-head">
            <span className="section-eyebrow">COMMUNIQUÉS & SANTÉ PUBLIQUE</span>
            <h2>Actualités médicales et recommandations sanitaires</h2>
            <p>
              Consultez les informations officielles, les campagnes de prévention nationale et
              les avancées du réseau hospitalier Santé+ au Bénin.
            </p>
          </div>

          <div className="classic-news-grid">
            {featuredArticles.map((article) => (
              <article className="classic-news-card" key={article.id}>
                <div className="classic-news-meta">
                  <span className={`classic-tag tag-${article.categoryBadge}`}>
                    {article.category.toUpperCase()}
                  </span>
                  <span className="news-time">
                    <CalendarDays size={13} /> {article.date}
                  </span>
                </div>
                <h3>{article.title}</h3>
                <p>{article.excerpt}</p>
                <div className="classic-news-footer">
                  <span className="news-read-time">
                    <Clock3 size={13} /> {article.readTime}
                  </span>
                  <Link href="/actualites" className="classic-link">
                    Lire le communiqué <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="classic-center-action">
            <Link href="/actualites" className="btn btn-outline btn-classic">
              <Newspaper size={16} /> Accéder à tous les communiqués et conseils de santé <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        {/* CADRE LÉGAL & CONFIDENTIALITÉ PAR CONCEPTION */}
        <section className="classic-section" id="securite">
          <div className="classic-trust-banner">
            <div className="trust-banner-content">
              <span className="section-eyebrow white">CONFORMITÉ LÉGALE & DÉONTOLOGIQUE</span>
              <h2>La protection absolue de vos données médicales</h2>
              <p>
                La plateforme SANTÉ+ est conçue dans le respect strict du Code du numérique en
                République du Bénin (loi n° 2017-20) et des règles déontologiques de l’Ordre des
                Médecins. Aucune information médicale n’est cédée, monétisée ni accessible sans
                votre accord exprès.
              </p>
              <div className="trust-banner-actions">
                <Link href="/confidentialite" className="btn btn-white btn-classic">
                  <FileText size={16} /> Consulter le cadre légal et vos droits
                </Link>
              </div>
            </div>

            <div className="trust-banner-guarantees">
              <div className="guarantee-box">
                <ShieldCheck size={20} />
                <div>
                  <strong>Consentement révocable</strong>
                  <span>Vous autorisez et révoquez l’accès d’un praticien à tout instant.</span>
                </div>
              </div>
              <div className="guarantee-box">
                <LockKeyhole size={20} />
                <div>
                  <strong>Chiffrement fort AES-256</strong>
                  <span>Tous vos documents et ordonnances sont chiffrés en base de données.</span>
                </div>
              </div>
              <div className="guarantee-box">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Audit immuable des accès</strong>
                  <span>Chaque consultation de votre dossier fait l’objet d’un journal d’audit.</span>
                </div>
              </div>
              <div className="guarantee-box">
                <HeartPulse size={20} />
                <div>
                  <strong>Droit à la portabilité (APDP)</strong>
                  <span>Export complet de votre dossier en PDF ou format JSON en un clic.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* INSCRIPTION PATIENT EN 3 ÉTAPES */}
        <section className="classic-section classic-bg-soft" id="inscription">
          <div className="classic-section-head">
            <span className="section-eyebrow">OUVERTURE DE COMPTE</span>
            <h2>Créez votre dossier patient en trois étapes simples</h2>
            <p>
              L’auto-inscription est ouverte à tous les résidents. Munissez-vous simplement de
              vos coordonnées pour obtenir immédiatement votre NPI Santé+.
            </p>
          </div>

          <div className="classic-steps-grid">
            <div className="classic-step-box">
              <span className="step-numeral">I</span>
              <h3>Identification civile</h3>
              <p>
                Renseignez votre nom, prénoms, numéro de téléphone, adresse e-mail, ville et
                groupe sanguin (facultatif).
              </p>
            </div>
            <div className="classic-step-box">
              <span className="step-numeral">II</span>
              <h3>Sécurisation du compte</h3>
              <p>
                Définissez un mot de passe personnel robuste (≥12 caractères) et prenez
                connaissance de la politique de confidentialité.
              </p>
            </div>
            <div className="classic-step-box">
              <span className="step-numeral">III</span>
              <h3>Délivrance de l’Identifiant</h3>
              <p>
                Votre NPI Santé+ et votre QR code médical sont émis immédiatement. Votre
                tableau de bord personnel est opérationnel.
              </p>
            </div>
          </div>

          <div className="classic-center-action">
            <div className="classic-action-group">
              <button
                className="btn btn-primary btn-classic-lg"
                onClick={() => onAuthOpen("register")}
              >
                Créer mon compte patient <ArrowRight size={16} />
              </button>
              <button
                className="btn btn-outline btn-classic-lg"
                onClick={() => onAuthOpen("login")}
              >
                J’ai déjà un compte
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* PIED DE PAGE INSTITUTIONNEL */}
      <footer className="classic-footer">
        <div className="classic-footer-inner">
          <div className="footer-col brand-col">
            <div className="footer-logo">
              <span className="brand-mark classic-mark sm"><Plus size={18} strokeWidth={3} /></span>
              <strong>SANTÉ<span>+</span> BÉNIN</strong>
            </div>
            <p className="footer-desc">
              Plateforme nationale de santé numérique placée sous la supervision du Ministère
              de la Santé de la République du Bénin.
            </p>
            <div className="footer-national-tag">
              <span>RÉPUBLIQUE DU BÉNIN</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Espace Patients</h4>
            <ul>
              <li><Link href="/inscription">Créer un compte patient</Link></li>
              <li><Link href="/connexion">Connexion à mon espace</Link></li>
              <li><Link href="/actualites">Actualités & Conseils de santé</Link></li>
              <li><Link href="/mot-de-passe-oublie">Récupération d’accès</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Cadre réglementaire</h4>
            <ul>
              <li><Link href="/confidentialite">Protection des données (Loi 2017-20)</Link></li>
              <li><a href="https://apdp.bj" target="_blank" rel="noreferrer">Autorité de Protection (APDP)</a></li>
              <li><Link href="/confidentialite#droits">Exercice de vos droits</Link></li>
              <li><Link href="/confidentialite#securite">Chiffrement et audits</Link></li>
            </ul>
          </div>

          <div className="footer-col emergency-col">
            <h4>Services d’urgence</h4>
            <div className="footer-emergency-boxes">
              <a href="tel:112" className="emergency-pill samu">
                <strong>112</strong>
                <span>SAMU (Urgences médicales)</span>
              </a>
              <a href="tel:118" className="emergency-pill pompiers">
                <strong>118</strong>
                <span>Sapeurs-Pompiers</span>
              </a>
              <a href="tel:117" className="emergency-pill police">
                <strong>117</strong>
                <span>Police Républicaine</span>
              </a>
            </div>
          </div>
        </div>

        <div className="classic-footer-bottom">
          <div className="footer-bottom-inner">
            <p>© 2026 République du Bénin — Ministère de la Santé. Tous droits réservés.</p>
            <div className="footer-bottom-links">
              <Link href="/confidentialite">Mentions légales</Link>
              <span>·</span>
              <Link href="/confidentialite">Politique de confidentialité</Link>
              <span>·</span>
              <a href="mailto:contact@santeplus.bj">Assistance technique</a>
            </div>
          </div>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        initialStage={authStage}
        onClose={onAuthClose}
        onAuthenticated={onAuthenticated}
        toast={toast}
      />
    </div>
  );
}
