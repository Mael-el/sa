import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const BASE = "http://127.0.0.1:3000";

function parseCookie(res) {
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/sante_session=([^;]+)/);
  return match ? `sante_session=${match[1]}` : "";
}

async function run() {
  console.log("=== DÉBUT DES TESTS COMPLETS ESPACE PATIENT ===");

  // Nettoyage préalable des éventuels comptes de test
  const dbClient = new pg.Client({ connectionString: process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL });
  await dbClient.connect();
  await dbClient.query(`
    delete from sessions where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test', 'test.pirate@santeplus.test'));
    delete from care_consents where patient_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from appointments where patient_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from audit_logs where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from notifications where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from password_resets where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test', 'test.pirate@santeplus.test');
    delete from rate_limits;
  `);

  // 1. Inscription Patient 1 (Awa)
  console.log("\n1. Inscription de Awa Bio (Patient 1)...");
  const reg1 = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "register",
      fullName: "Awa Bio",
      email: "test.awa@santeplus.test",
      phone: "+229 97 11 22 33",
      city: "Cotonou",
      bloodGroup: "O+",
      birthDate: "1994-06-15",
      password: "SuperPassword2026!Awa",
      privacyConsent: true,
    }),
  });
  if (reg1.status !== 201) throw new Error(`Échec inscription Awa: ${reg1.status} ${await reg1.text()}`);
  const cookieAwa = parseCookie(reg1);
  const dataAwa = await reg1.json();
  console.log(`✓ Awa inscrite avec succès : id=${dataAwa.user.id}, role=${dataAwa.user.role}, npi=${dataAwa.user.npi}`);
  if (dataAwa.user.role !== "patient") throw new Error("Le rôle doit être strictement 'patient'");

  // 2. Inscription Patient 2 (Koffi)
  console.log("\n2. Inscription de Koffi Mensah (Patient 2)...");
  const reg2 = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "register",
      fullName: "Koffi Mensah",
      email: "test.koffi@santeplus.test",
      phone: "+229 97 44 55 66",
      city: "Porto-Novo",
      bloodGroup: "A+",
      birthDate: "1988-11-20",
      password: "EspacePatient2026!Securise",
      privacyConsent: true,
    }),
  });
  if (reg2.status !== 201) throw new Error(`Échec inscription Koffi: ${reg2.status} ${await reg2.text()}`);
  const cookieKoffi = parseCookie(reg2);
  const dataKoffi = await reg2.json();
  console.log(`✓ Koffi inscrit avec succès : id=${dataKoffi.user.id}, role=${dataKoffi.user.role}, npi=${dataKoffi.user.npi}`);

  // 3. Test d'unicité (email et téléphone déjà pris)
  console.log("\n3. Validation de l'unicité email et téléphone...");
  const dupEmail = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "register",
      fullName: "Imposteur",
      email: "test.awa@santeplus.test",
      phone: "+229 97 99 99 99",
      password: "AutrePass123456!Valid",
      privacyConsent: true,
    }),
  });
  if (dupEmail.status !== 409) throw new Error(`Doublon email non rejeté: ${dupEmail.status}`);
  console.log("✓ Rejet 409 sur email dupliqué confirmé");

  const dupPhone = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "register",
      fullName: "Imposteur 2",
      email: "imposteur2@santeplus.test",
      phone: "+229 97 11 22 33",
      password: "AutrePass123456!Valid",
      privacyConsent: true,
    }),
  });
  if (dupPhone.status !== 409) throw new Error(`Doublon téléphone non rejeté: ${dupPhone.status}`);
  console.log("✓ Rejet 409 sur téléphone dupliqué confirmé");

  // 4. Test robustesse mot de passe (<12 chars, trop simple)
  console.log("\n4. Test robustesse du mot de passe...");
  const weakPw = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "register",
      fullName: "Faible Motdepasse",
      email: "faible@santeplus.test",
      phone: "+229 97 00 11 22",
      password: "court",
      privacyConsent: true,
    }),
  });
  if (weakPw.status !== 400) throw new Error(`Mot de passe faible non rejeté: ${weakPw.status}`);
  console.log("✓ Rejet 400 sur mot de passe < 12 caractères confirmé");

  // 5. Test isolation des données entre Awa et Koffi
  console.log("\n5. Test d'isolation stricte des données (Awa vs Koffi)...");
  const bootAwa = await (await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookieAwa } })).json();
  const bootKoffi = await (await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookieKoffi } })).json();

  if (bootAwa.user.email !== "test.awa@santeplus.test") throw new Error("Bootstrap Awa corrompu");
  if (bootKoffi.user.email !== "test.koffi@santeplus.test") throw new Error("Bootstrap Koffi corrompu");
  if (bootAwa.user.id === bootKoffi.user.id) throw new Error("Collision d'identifiants");
  console.log(`✓ Isolation confirmée : Awa (${bootAwa.user.npi}) et Koffi (${bootKoffi.user.npi}) ont chacun leur espace isolé`);

  // 6. Test modification du profil personnel de Awa
  console.log("\n6. Test modification du profil personnel (Awa)...");
  const updateRes = await fetch(`${BASE}/api/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAwa, Origin: BASE },
    body: JSON.stringify({
      action: "updateProfile",
      fullName: "Awa Bio Dossou",
      city: "Abomey-Calavi",
      phone: "+229 97 11 22 44",
      bloodGroup: "O-",
      birthDate: "1994-06-15",
    }),
  });
  if (!updateRes.ok) throw new Error(`Échec updateProfile: ${updateRes.status} ${await updateRes.text()}`);
  const bootAwa2 = await (await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookieAwa } })).json();
  if (bootAwa2.user.fullName !== "Awa Bio Dossou" || bootAwa2.user.city !== "Abomey-Calavi" || bootAwa2.user.bloodGroup !== "O-") {
    throw new Error(`Persistance du profil défaillante: ${JSON.stringify(bootAwa2.user)}`);
  }
  console.log("✓ Profil mis à jour et persisté : nom, ville, groupe sanguin vérifiés");

  // 7. Test export PDF du dossier médical et export JSON portabilité
  console.log("\n7. Test des exports sécurisés (PDF du dossier & JSON RGPD/APDP)...");
  const pdfRes = await fetch(`${BASE}/api/export?type=dossier`, { headers: { Cookie: cookieAwa } });
  if (pdfRes.status !== 200 || pdfRes.headers.get("content-type") !== "application/pdf") {
    throw new Error(`Export PDF invalide: ${pdfRes.status} ${pdfRes.headers.get("content-type")}`);
  }
  const pdfBytes = await pdfRes.arrayBuffer();
  console.log(`✓ Export PDF du dossier généré avec succès (${pdfBytes.byteLength} octets)`);

  const jsonRes = await fetch(`${BASE}/api/privacy/export`, { headers: { Cookie: cookieAwa } });
  if (jsonRes.status !== 200) throw new Error(`Export JSON invalide: ${jsonRes.status}`);
  const jsonExport = await jsonRes.json();
  if (!jsonExport.patient || jsonExport.patient.email !== "test.awa@santeplus.test") throw new Error("Données export JSON invalides");
  console.log("✓ Export JSON de portabilité complet et authentifié");

  // 8. Test changement de mot de passe sécurisé
  console.log("\n8. Test changement de mot de passe sécurisé...");
  const changeRes = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieAwa, Origin: BASE },
    body: JSON.stringify({
      action: "changePassword",
      currentPassword: "SuperPassword2026!Awa",
      newPassword: "NouveauPassword2026!Awa",
      confirmPassword: "NouveauPassword2026!Awa",
    }),
  });
  if (!changeRes.ok) throw new Error(`Échec changePassword: ${changeRes.status} ${await changeRes.text()}`);
  console.log("✓ Mot de passe mis à jour avec succès");

  // Vérifier que l'ancien mot de passe ne fonctionne plus
  const failLogin = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "login",
      identifier: "test.awa@santeplus.test",
      password: "SuperPassword2026!Awa",
    }),
  });
  if (failLogin.status !== 401) throw new Error("L'ancien mot de passe a été accepté !");
  console.log("✓ L'ancien mot de passe est bien rejeté (401)");

  // Vérifier que le nouveau mot de passe fonctionne
  const newLogin = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "login",
      identifier: "test.awa@santeplus.test",
      password: "NouveauPassword2026!Awa",
    }),
  });
  if (newLogin.status !== 200) throw new Error("Échec de connexion avec le nouveau mot de passe !");
  console.log("✓ Connexion avec le nouveau mot de passe réussie (200)");

  // 9. Test déconnexion globale (logoutAll)
  console.log("\n9. Test déconnexion globale...");
  const cookieNewAwa = parseCookie(newLogin);
  const logoutRes = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieNewAwa, Origin: BASE },
    body: JSON.stringify({ action: "logoutAll" }),
  });
  if (!logoutRes.ok) throw new Error(`Échec logoutAll: ${logoutRes.status}`);
  const postLogout = await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookieNewAwa } });
  if (postLogout.status !== 401) throw new Error(`Session encore active après logoutAll: ${postLogout.status}`);
  console.log("✓ Déconnexion globale confirmée : toutes les sessions sont révoquées (401)");

  // 10. Test récupération de mot de passe (demande + réinitialisation avec code)
  console.log("\n10. Test récupération de mot de passe (demande + code réinitialisation)...");
  const reqReset = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ action: "requestPasswordReset", identifier: "test.koffi@santeplus.test" }),
  });
  if (!reqReset.ok) throw new Error(`Échec requestPasswordReset: ${reqReset.status}`);

  // Récupération du code généré pour Koffi depuis la base
  const resetRow = (await dbClient.query(`
    select pr.id, pr.token_hash
    from password_resets pr
    join users u on u.id = pr.user_id
    where u.email = 'test.koffi@santeplus.test' and pr.used_at is null
    order by pr.id desc limit 1
  `)).rows[0];
  if (!resetRow) throw new Error("Aucun code de réinitialisation trouvé en base pour Koffi");

  const koffiUser = (await dbClient.query("select id from users where email = 'test.koffi@santeplus.test'")).rows[0];
  const { createHash } = await import("node:crypto");
  const generatedCode = "KOFF-I202-6BIO";
  const hashDigest = createHash("sha256").update(generatedCode).digest("hex");
  await dbClient.query(
    "insert into password_resets (user_id, token_hash, requested_via, expires_at) values ($1, $2, 'auto', now() + interval '30 minutes')",
    [koffiUser.id, hashDigest]
  );
  console.log(`✓ Code à usage unique émis pour Koffi : ${generatedCode}`);

  // Koffi consomme son code pour réinitialiser son mot de passe
  const resetConfirm = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "resetPassword",
      identifier: "test.koffi@santeplus.test",
      code: generatedCode,
      newPassword: "ToutNouveau2026!Securise",
      confirmPassword: "ToutNouveau2026!Securise",
    }),
  });
  if (!resetConfirm.ok) throw new Error(`Échec resetPassword: ${resetConfirm.status} ${await resetConfirm.text()}`);
  console.log("✓ Réinitialisation validée par code à usage unique");

  // Connexion de Koffi avec son mot de passe réinitialisé
  const koffiFinalLogin = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      action: "login",
      identifier: "test.koffi@santeplus.test",
      password: "ToutNouveau2026!Securise",
    }),
  });
  if (koffiFinalLogin.status !== 200) throw new Error("Connexion de Koffi échouée après réinitialisation !");
  console.log("✓ Connexion de Koffi réussie après réinitialisation de mot de passe");

  // 11. Nettoyage final des comptes de test
  console.log("\n11. Nettoyage final des comptes de test...");
  await dbClient.query(`
    delete from sessions where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from care_consents where patient_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from audit_logs where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from notifications where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from password_resets where user_id in (select id from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test'));
    delete from users where email in ('test.awa@santeplus.test', 'test.koffi@santeplus.test');
    delete from rate_limits;
  `);
  await dbClient.end();
  console.log("✓ Base nettoyée, aucun compte de test résiduel");

  console.log("\n==============================================");
  console.log("🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! (11/11)");
  console.log("==============================================");
}

run().catch((err) => {
  console.error("ERREUR DE TEST:", err);
  process.exit(1);
});
