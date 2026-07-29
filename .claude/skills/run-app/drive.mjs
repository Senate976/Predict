import { chromium } from 'playwright';

const URL = 'http://localhost:8081';
const OUT = '/tmp/driver/shots';
const errors = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const step = async (name, fn) => {
  try { await fn(); console.log(`OK   ${name}`); }
  catch (e) { console.log(`FAIL ${name} :: ${e.message.split('\n')[0]}`); }
};

console.log('nav', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

// Premier paint : Metro compile a la demande, ca peut prendre longtemps.
await step('login screen rendu (titre "Créer un compte")', () =>
  page.getByText('Créer un compte', { exact: true }).waitFor({ timeout: 120000 }));

await step('champ Pseudo present en mode inscription', () =>
  page.getByText('Pseudo', { exact: true }).waitFor({ timeout: 5000 }));

await page.screenshot({ path: `${OUT}/1-signup.png` });

// Validation locale : submit a vide.
await step('erreur de validation sur submit vide', async () => {
  await page.getByText('Créer mon compte').click();
  await page.getByText('Renseigne ton adresse email.').waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/2-validation-vide.png` });

// Validation locale : mot de passe trop court.
await step('erreur "mot de passe trop court"', async () => {
  await page.locator('input').nth(0).fill('joueur_test');
  await page.locator('input').nth(1).fill('test@exemple.com');
  await page.locator('input').nth(2).fill('123');
  await page.getByText('Créer mon compte').click();
  await page.getByText(/au moins 6 caractères/).waitFor({ timeout: 5000 });
});
await page.screenshot({ path: `${OUT}/3-mdp-court.png` });

// Validation locale : pseudo avec caracteres interdits.
await step('erreur "caracteres interdits dans le pseudo"', async () => {
  await page.locator('input').nth(0).fill('bad pseudo!');
  await page.locator('input').nth(2).fill('motdepasse123');
  await page.getByText('Créer mon compte').click();
  await page.getByText(/que des lettres, chiffres/).waitFor({ timeout: 5000 });
});

// Bascule vers le mode connexion.
await step('bascule vers "Se connecter"', async () => {
  await page.getByText('Déjà un compte ? Se connecter').click();
  await page.getByText('Se connecter', { exact: true }).first().waitFor({ timeout: 5000 });
});
await step('champ Pseudo masque en mode connexion', async () => {
  const n = await page.getByText('Pseudo', { exact: true }).count();
  if (n !== 0) throw new Error(`Pseudo encore visible (${n} occurrences)`);
});
await page.screenshot({ path: `${OUT}/4-signin.png` });

// Appel reseau reel vers le placeholder : doit echouer proprement et afficher l'erreur.
await step('erreur réseau traduite en français', async () => {
  await page.locator('input').nth(0).fill('test@exemple.com');
  await page.locator('input').nth(1).fill('motdepasse123');
  await page.getByText('Se connecter', { exact: true }).last().click();
  await page.locator('text=/Connexion au serveur impossible/').first()
    .waitFor({ timeout: 20000 });
});
await page.screenshot({ path: `${OUT}/5-erreur-reseau.png` });

console.log('\n--- console errors (' + errors.length + ') ---');
console.log(errors.slice(0, 12).join('\n') || '(aucune)');

await browser.close();
