"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { ARTICLES, type Article } from "@/lib/news";

export function NewsPageClient() {
  const [category, setCategory] = useState<string>("tous");
  const [search, setSearch] = useState<string>("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const categories = [
    ["tous", "Toutes"],
    ["Campagne nationale", "Campagnes"],
    ["Prévention & Conseils", "Prévention"],
    ["Don de sang", "Don de sang"],
    ["Réseau Santé+", "Réseau"],
    ["Droits & Sécurité", "Sécurité"],
  ];

  const filtered = useMemo(() => {
    return ARTICLES.filter((article) => {
      const matchCat = category === "tous" || article.category === category;
      const matchQuery =
        !search ||
        `${article.title} ${article.excerpt} ${article.author}`
          .toLowerCase()
          .includes(search.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [category, search]);

  return (
    <div className="public-site">
      <header className="public-header">
        <Link href="/" className="public-logo">
          <span className="brand-mark">
            <Plus size={24} strokeWidth={3.5} />
          </span>
          <strong>SANTÉ<span>+</span></strong>
        </Link>
        <nav>
          <Link href="/">Accueil</Link>
          <Link href="/actualites" className="active">Actualités</Link>
          <Link href="/inscription">Inscription</Link>
          <Link href="/confidentialite">Confidentialité</Link>
        </nav>
        <div className="public-header-actions">
          <Link href="/inscription" className="btn btn-outline">
            Créer un compte
          </Link>
          <Link href="/connexion" className="btn btn-primary">
            Accéder à mon espace <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <main className="actualites-main">
        <section className="actualites-hero">
          <div className="actualites-hero-inner">
            <Link href="/" className="auth-back">
              <ArrowLeft size={15} /> Retour à l’accueil
            </Link>
            <div className="public-kicker">
              <span />INFORMATIONS & SANTÉ PUBLIQUE
            </div>
            <h1>Actualités médicales et conseils de prévention</h1>
            <p>
              Suivez les initiatives de santé publique, les campagnes nationales de prévention
              et les évolutions du réseau médical Santé+ en République du Bénin.
            </p>
          </div>
        </section>

        <section className="actualites-content">
          <div className="actualites-toolbar">
            <div className="tabs">
              {categories.map(([key, label]) => (
                <button
                  key={key}
                  className={category === key ? "active" : ""}
                  onClick={() => setCategory(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une actualité..."
              />
            </div>
          </div>

          <div className="news-cards-grid">
            {filtered.length ? (
              filtered.map((article) => (
                <article className="news-full-card" key={article.id}>
                  <div className="news-full-head">
                    <span className={`type-tag ${article.categoryBadge}`}>
                      {article.category.toUpperCase()}
                    </span>
                    <div className="news-full-time">
                      <span><CalendarDays size={13} /> {article.date}</span>
                      <span><Clock3 size={13} /> {article.readTime}</span>
                    </div>
                  </div>

                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>

                  {article.keyPoints && (
                    <ul className="news-points-list">
                      {article.keyPoints.slice(0, 2).map((point, i) => (
                        <li key={i}>
                          <CheckCircle2 size={14} /> {point}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="news-full-foot">
                    <span className="news-author">
                      <UserRound size={14} /> {article.author}
                    </span>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelectedArticle(article)}
                    >
                      Lire l’article <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                <BookOpen size={40} />
                <h3>Aucun article ne correspond à votre recherche</h3>
                <p>Essayez avec d’autres mots-clés ou réinitialisez les filtres.</p>
                <button className="btn btn-soft" onClick={() => { setCategory("tous"); setSearch(""); }}>
                  Réinitialiser
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Modal lecteur d'article complet */}
        {selectedArticle && (
          <div className="modal-backdrop" onClick={() => setSelectedArticle(null)}>
            <div
              className="modal-panel modal-article-reader"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <span className={`type-tag ${selectedArticle.categoryBadge}`}>
                    {selectedArticle.category.toUpperCase()}
                  </span>
                  <h2>{selectedArticle.title}</h2>
                  <div className="modal-article-meta">
                    <span><CalendarDays size={14} /> {selectedArticle.date}</span>
                    <span><Clock3 size={14} /> {selectedArticle.readTime}</span>
                    <span><UserRound size={14} /> {selectedArticle.author}</span>
                  </div>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setSelectedArticle(null)}
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body modal-article-body">
                {selectedArticle.keyPoints && (
                  <div className="article-key-takeaways">
                    <strong>À retenir :</strong>
                    <ul>
                      {selectedArticle.keyPoints.map((pt, i) => (
                        <li key={i}>
                          <CheckCircle2 size={16} /> {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="article-paragraphs">
                  {selectedArticle.content.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>

                <div className="article-cta-box">
                  <div className="list-icon mint"><HeartPulse size={24} /></div>
                  <div>
                    <strong>Prenez soin de votre santé au quotidien</strong>
                    <p>Ouvrez votre espace patient pour planifier vos consultations et conserver vos documents médicaux.</p>
                  </div>
                  <Link href="/inscription" className="btn btn-primary btn-sm">
                    Créer mon compte patient
                  </Link>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => setSelectedArticle(null)}
                >
                  Fermer
                </button>
                <Link href="/inscription" className="btn btn-primary">
                  Rejoindre Santé+ <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="public-footer">
        <span>© {new Date().getFullYear()} SANTÉ+ Bénin · Plateforme nationale de santé numérique</span>
        <Link href="/confidentialite">Confidentialité & droits des patients</Link>
        <a href="tel:112">Urgence médicale : 112</a>
      </footer>
    </div>
  );
}
