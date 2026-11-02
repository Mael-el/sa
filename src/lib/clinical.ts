export function checkInteractions(medications: { name: string }[]) {
  const names = medications.map((item) => item.name.toLocaleLowerCase("fr").trim());
  const pairs = [
    { a: "warfarine", b: "aspirine", warning: "Warfarine et aspirine : risque accru de saignement. Vérifiez la prescription." },
    { a: "warfarine", b: "ibuprofène", warning: "Warfarine et ibuprofène : risque accru de saignement. Vérifiez la prescription." },
    { a: "aspirine", b: "ibuprofène", warning: "Aspirine et ibuprofène : interaction possible. Vérifiez les doses et horaires." },
    { a: "losartan", b: "spironolactone", warning: "Losartan et spironolactone : surveillez la kaliémie." },
    { a: "amoxicilline", b: "méthotrexate", warning: "Amoxicilline et méthotrexate : toxicité potentiellement augmentée." },
  ];
  return pairs.filter((pair) => names.some((name) => name.includes(pair.a)) && names.some((name) => name.includes(pair.b))).map((pair) => pair.warning);
}

export type SymptomAssessment = { level: "urgence" | "rapide" | "conseil"; title: string; summary: string; recommendations: string[] };

export function assessSymptoms(input: string): SymptomAssessment {
  const text = input.toLocaleLowerCase("fr");
  if (/douleur thoracique|mal à la poitrine|difficulté.*respir|ne respire|perte de connaissance|inconscient|convulsion|saignement abondant|paralysie|avc|suicide/.test(text)) {
    return { level: "urgence", title: "Une prise en charge urgente est recommandée", summary: "Certains symptômes décrits peuvent nécessiter une évaluation immédiate. Cette orientation automatique ne constitue pas un diagnostic.", recommendations: ["Appelez immédiatement les secours (SAMU : 112).", "Ne vous déplacez pas seul(e) si vous vous sentez faible.", "Préparez votre NPI et les informations sur vos traitements en cours."] };
  }
  if (/fièvre|fievre|vomissement|douleur intense|vertige|infection|essoufflement|diarrhée|maux de tête sévères|maux de tete severes/.test(text)) {
    return { level: "rapide", title: "Un avis médical est conseillé rapidement", summary: "Vos symptômes méritent une discussion avec un professionnel de santé, surtout s'ils persistent ou s'aggravent.", recommendations: ["Prenez rendez-vous avec un médecin dans les prochaines 24 à 48 heures.", "Hydratez-vous et notez l'évolution de vos symptômes.", "En cas d'aggravation soudaine, contactez les urgences."] };
  }
  return { level: "conseil", title: "Échangez avec un professionnel de santé", summary: "Les informations fournies ne permettent pas d'établir un diagnostic. Un professionnel pourra vous orienter selon votre situation.", recommendations: ["Décrivez depuis quand les symptômes ont commencé.", "Notez leur fréquence et leur intensité.", "Prenez rendez-vous si les symptômes persistent ou vous inquiètent."] };
}

export function clinicalSuggestions(input: string) {
  const text = input.toLocaleLowerCase("fr");
  const suggestions: string[] = [];
  if (/tension|hypertension|céphalée|maux de tête/.test(text)) suggestions.push("Pensez à contrôler la tension artérielle et à revoir les antécédents cardiovasculaires.");
  if (/fièvre|fievre|infection/.test(text)) suggestions.push("Recherchez les signes de gravité et envisagez un bilan infectieux selon l'examen clinique.");
  if (/douleur thoracique|poitrine/.test(text)) suggestions.push("Évaluez les signes d'urgence et envisagez un ECG si indiqué.");
  if (/diabète|glycémie|glycemie/.test(text)) suggestions.push("Vérifiez la glycémie et les traitements en cours.");
  return suggestions.length ? suggestions : ["Documentez les signes vitaux, les antécédents et l'examen clinique avant de conclure."];
}
