"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, Bot, Send, Sparkles } from "lucide-react";
import { sessionHeaders } from "@/lib/session-client";

/**
 * AYABA — assistante de la plateforme, disponible dans tous les espaces.
 *
 * Deux modes de consultation : un panneau flottant, accessible depuis n'importe
 * quel écran, et une page complète pour les questions longues. Les réponses ne
 * sont jamais générées librement : elles proviennent de la base de connaissances
 * du dépôt, ce qui exclut d'inventer une règle de sécurité ou de consentement.
 */

type Topic = { id: string; title: string };
type Message = { from: "ayaba" | "user"; text: string; related?: Topic[]; suggestions?: Topic[]; needsLogin?: boolean };

/** Rendu minimal du gras `**texte**` et des retours à la ligne, sans innerHTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, lineIndex) => (
        <span key={lineIndex} className="ayaba-line">
          {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, partIndex) => {
            if (part.startsWith("**") && part.endsWith("**")) return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
            // L'italique souligne une distinction (« consulter » vs « modifier »).
            if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={partIndex}>{part.slice(1, -1)}</em>;
            return <span key={partIndex}>{part}</span>;
          })}
          {lineIndex < text.split("\n").length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

export function AyabaPanel({
  open,
  onClose,
  visitor = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Visiteur non connecté : la base de connaissances commune reste accessible. */
  visitor?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Charger l'accueil à la première ouverture : la liste des sujets dépend du rôle.
  useEffect(() => {
    if (!open || messages.length) return;
    let active = true;
    fetch("/api/ayaba", { method: "POST", headers: sessionHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({}) })
      .then((response) => response.json())
      .then((result) => {
        if (!active) return;
        setMessages([{ from: "ayaba", text: result.greeting || "Bonjour, je suis AYABA.", related: result.topics?.slice(0, 6) }]);
        setTopics(result.topics || []);
      })
      .catch(() => { if (active) setError("Impossible de charger l'assistante."); });
    return () => { active = false; };
  }, [open, messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const ask = async (question: string) => {
    const clean = question.trim();
    if (!clean || loading) return;
    setInput(""); setError(""); setLoading(true);
    setMessages((previous) => [...previous, { from: "user", text: clean }]);
    try {
      const response = await fetch("/api/ayaba", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ question: clean }),
      });
      const result = await response.json();
      if (response.status === 401) {
        // Un visiteur peut parcourir la base commune sans compte ; une question
        // personnelle (« où en est mon rendez-vous ? ») exige une session.
        setMessages((previous) => [...previous, {
          from: "ayaba",
          text: "Cette question touche à un dossier personnel : connectez-vous pour que je puisse y répondre. Sans compte, je reste disponible sur le fonctionnement général de la plateforme.",
        }]);
        return;
      }
      if (!response.ok) throw new Error(result.error || "Réponse indisponible.");
      setMessages((previous) => [...previous, {
        from: "ayaba",
        text: result.answer,
        related: result.found ? result.related : result.suggestions,
        needsLogin: Boolean(result.needsLogin),
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réponse indisponible.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="ayaba-panel" role="dialog" aria-label="AYABA, assistante SANTÉ+">
      <header className="ayaba-header">
        <div className="ayaba-avatar"><Sparkles size={18} /></div>
        <div>
          <strong>AYABA</strong>
          <span>{visitor ? "Assistante SANTÉ+ · fonctionnement de la plateforme" : "Assistante SANTÉ+ · réponses issues du guide de la plateforme"}</span>
        </div>
        <button className="ayaba-close" onClick={onClose} aria-label="Fermer AYABA">✕</button>
      </header>

      <div className="ayaba-messages" ref={scroller}>
        {messages.map((message, index) => (
          <div className={`ayaba-message ${message.from}`} key={index}>
            {message.from === "ayaba" && <div className="ayaba-bubble-avatar"><Bot size={14} /></div>}
            <div className="ayaba-bubble">
              <RichText text={message.text} />
              {message.needsLogin && (
                <div className="ayaba-login-cta">
                  <a href="/connexion">Se connecter</a>
                  <a href="/inscription">Créer un compte</a>
                </div>
              )}
              {message.related && message.related.length > 0 && (
                <div className="ayaba-chips">
                  {message.related.map((topic) => (
                    <button key={topic.id} onClick={() => ask(topic.title)}>{topic.title}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="ayaba-message ayaba"><div className="ayaba-bubble"><span className="typing-dots">AYABA réfléchit…</span></div></div>}
        {error && <p className="ayaba-error"><AlertCircle size={14} />{error}</p>}
      </div>

      <form className="ayaba-input" onSubmit={(event) => { event.preventDefault(); ask(input); }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Posez votre question sur la plateforme…"
          aria-label="Votre question à AYABA"
          maxLength={500}
        />
        <button className="btn btn-primary btn-sm" disabled={loading || !input.trim()} aria-label="Envoyer">
          <Send size={15} />
        </button>
      </form>
      {topics.length > 0 && messages.length <= 1 && (
        <div className="ayaba-footer-note">
          <BookOpen size={13} />
          <span>AYABA ne remplace pas un soignant. En cas d&apos;urgence, appelez le 112.</span>
        </div>
      )}
    </div>
  );
}

/** Page complète : utile pour lire une réponse longue ou explorer les sujets. */
export function AyabaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/ayaba", { method: "POST", headers: sessionHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({}) })
      .then((response) => response.json())
      .then((result) => {
        if (!active) return;
        setMessages([{ from: "ayaba", text: result.greeting || "Bonjour, je suis AYABA." }]);
        setTopics(result.topics || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const ask = async (question: string) => {
    const clean = question.trim();
    if (!clean || loading) return;
    setInput(""); setLoading(true);
    setMessages((previous) => [...previous, { from: "user", text: clean }]);
    try {
      const response = await fetch("/api/ayaba", { method: "POST", headers: sessionHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ question: clean }) });
      const result = await response.json();
      setMessages((previous) => [...previous, { from: "ayaba", text: result.answer || "Réponse indisponible.", related: result.found ? result.related : result.suggestions }]);
    } catch {
      setMessages((previous) => [...previous, { from: "ayaba", text: "Je ne parviens pas à répondre pour le moment. Réessayez dans un instant." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">ASSISTANTE DE LA PLATEFORME</span>
          <h1>AYABA</h1>
          <p>Posez vos questions sur SANTÉ+ : compte, NPI, rendez-vous, dossier, consentements, droits. Réponses issues du guide officiel de la plateforme.</p>
        </div>
      </div>

      <div className="ayaba-page-grid">
        <section className="card ayaba-page-chat">
          <div className="ayaba-messages ayaba-messages-tall">
            {messages.map((message, index) => (
              <div className={`ayaba-message ${message.from}`} key={index}>
                {message.from === "ayaba" && <div className="ayaba-bubble-avatar"><Bot size={14} /></div>}
                <div className="ayaba-bubble">
                  <RichText text={message.text} />
                  {message.related && message.related.length > 0 && (
                    <div className="ayaba-chips">
                      {message.related.map((topic) => <button key={topic.id} onClick={() => ask(topic.title)}>{topic.title}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="ayaba-message ayaba"><div className="ayaba-bubble"><span className="typing-dots">AYABA réfléchit…</span></div></div>}
          </div>
          <form className="ayaba-input" onSubmit={(event) => { event.preventDefault(); ask(input); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Par exemple : comment révoquer l'accès d'un médecin ?" maxLength={500} aria-label="Votre question à AYABA" />
            <button className="btn btn-primary" disabled={loading || !input.trim()}>Envoyer<ArrowRight size={16} /></button>
          </form>
        </section>

        <aside className="card card-pad ayaba-page-topics">
          <h2>Questions fréquentes</h2>
          <p className="ayaba-topics-note">Sélectionnez un sujet pour obtenir la réponse détaillée.</p>
          <div className="ayaba-topic-list">
            {topics.map((topic) => (
              <button key={topic.id} onClick={() => ask(topic.title)}>
                <span>{topic.title}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
