import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { assessSymptoms, clinicalSuggestions } from "@/lib/clinical";
import { sameOrigin, withinRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine non autorisée." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!(await withinRateLimit(request, "assistant", 20, 3600, String(user.id)))) return Response.json({ error: "Limite d'utilisation atteinte. Réessayez plus tard." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const symptoms = String(body.symptoms || "").trim();
  if (symptoms.length < 10 || symptoms.length > 1500) return Response.json({ error: "Décrivez vos symptômes en 10 à 1 500 caractères." }, { status: 400 });
  const assessment = assessSymptoms(symptoms);
  let aiAdvice: string | null = null;
  if (body.aiConsent === true && process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, max_output_tokens: 280, instructions: user.role === "doctor" ? "Tu es un outil d'aide clinique en français pour un médecin au Bénin. Fournis seulement 3 points de vigilance et questions à vérifier, sans diagnostic certain, sans prescription, sans inventer de faits. En urgence, recommande les secours. Ne reproduis aucune donnée personnelle." : "Tu es un outil d'orientation santé en français au Bénin. Réponds en 3 phrases prudentes sans diagnostic ni prescription; suggère un professionnel, et le SAMU 112 en cas de danger. Ne reproduis aucune donnée personnelle.", input: symptoms }), signal: AbortSignal.timeout(8000) });
      if (response.ok) { const result = await response.json() as { output?: { content?: { type: string; text?: string }[] }[] }; aiAdvice = result.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join(" ").slice(0, 1500) || null; }
    } catch { /* The local safety rules remain available when the provider is unavailable. */ }
  }
  await db.insert(auditLogs).values({ userId: user.id, action: "Utilisation de l'assistant", resource: "Orientation santé", details: aiAdvice ? "IA externe utilisée avec accord explicite ; symptômes non journalisés" : "Orientation locale ; symptômes non journalisés" });
  return Response.json({ assessment, suggestions: user.role === "doctor" ? clinicalSuggestions(symptoms) : undefined, aiAdvice: assessment.level === "urgence" ? null : aiAdvice, mode: aiAdvice ? "ai" : "local", disclaimer: "Orientation indicative sans diagnostic. En cas d'urgence, appelez le SAMU au 112." }, { headers: { "Cache-Control": "private, no-store" } });
}
