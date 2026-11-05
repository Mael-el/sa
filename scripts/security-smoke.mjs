const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, redirect: "manual" });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json") ? await response.json() : null;
  return { response, data };
}
const post = (body) => call("/api/auth", { method: "POST", body: JSON.stringify(body) });

const anonymous = await call("/api/bootstrap");
assert(anonymous.response.status === 401, "Un visiteur anonyme n'obtient aucune donnée de santé");
const config = await post({ action: "config" });
assert(config.response.status === 200 && config.data.registrationsOpen === true, "L'inscription patient est ouverte");
const consentRefus = await post({ action: "register", fullName: "Test Refus", email: "refus@example.bj", phone: "+22990000999", password: "MotDePasseTest2026!", privacyConsent: false });
assert(consentRefus.response.status === 400, "Une inscription sans consentement de confidentialité est refusée");
const weakPassword = await post({ action: "register", fullName: "Test Faible", email: "faible@example.bj", phone: "+22990000998", password: "court", privacyConsent: true });
assert(weakPassword.response.status === 400, "Un mot de passe de moins de 12 caractères est refusé");
const invalidEmail = await post({ action: "register", fullName: "Test Invalide", email: "pas-un-email", phone: "+22990000996", password: "MotDePasseTest2026!", privacyConsent: true });
assert(invalidEmail.response.status === 400, "Une inscription avec un email invalide est refusée");
const demo = await post({ action: "demo", role: "admin" });
assert(demo.response.status === 403, "Le mode démonstration est désactivé");
const wrong = await post({ action: "login", identifier: "admin@santeplus.bj", password: "mot-de-passe-invalide" });
assert(wrong.response.status === 401, "Un mot de passe administrateur invalide est refusé");
const action = await call("/api/actions", { method: "POST", body: JSON.stringify({ action: "createUser" }) });
assert(action.response.status === 401, "La création de compte exige une session authentifiée");
const home = await fetch(base);
assert(home.status === 200, "La page publique répond");
assert(home.headers.get("x-content-type-options") === "nosniff", "En-tête nosniff présent");
assert(home.headers.get("referrer-policy") === "no-referrer", "En-tête referrer-policy présent");
assert((home.headers.get("content-security-policy") || "").includes("default-src 'self'"), "CSP présente");
console.log("Tests de fumée terminés. Aucun compte de démonstration n'est utilisé.");
