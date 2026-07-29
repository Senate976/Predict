---
name: run-app
description: Lance l'app Expo Predict et la pilote dans un Chromium headless pour vérifier qu'un écran rend correctement. À utiliser pour "lance l'app", "démarre le projet", "vérifie que l'écran X marche", ou pour valider un changement d'UI autrement que par typecheck.
---

# Lancer et piloter Predict

Projet **Expo SDK 57 + expo-router + Supabase**. Entrypoint `expo-router/entry`,
routes dans `app/`. Il n'y a ni `App.tsx` ni `index.ts` — ne les recrée pas.

Doc de référence imposée par `AGENTS.md` : https://docs.expo.dev/versions/v57.0.0/

## 1. Variables d'environnement

L'app **throw au démarrage** si `EXPO_PUBLIC_SUPABASE_URL` ou
`EXPO_PUBLIC_SUPABASE_ANON_KEY` manquent (garde-fou dans `lib/supabase.ts`).

Pour un simple test de rendu, injecte des valeurs factices en ligne de commande
plutôt que de créer un `.env` — ça évite de laisser un fichier trompeur :

```bash
EXPO_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="placeholder-anon-key" \
npx expo start --web --port 8081 > /tmp/expo-web.log 2>&1 &
```

Les `EXPO_PUBLIC_*` sont **inlinées au build** et mises en cache par Metro :
après tout changement de valeur, relance avec `--clear`.

Avec des clés factices, tout le parcours **non authentifié** est testable
(rendu, validation locale, messages d'erreur). Le parcours authentifié
— `signUp`, insertion dans `profiles`, redirection vers `/` — demande un vrai
projet Supabase ; demande les clés à l'utilisateur, ne les invente pas.

## 2. Attendre le serveur, puis l'arrêter proprement

```bash
timeout 90 bash -c 'until curl -sf http://localhost:8081 >/dev/null; do sleep 2; done'
```

Ne fais pas `sleep N` : le premier bundle Metro prend ~30 s. Pour arrêter :

```bash
lsof -ti:8081 -sTCP:LISTEN | xargs -r kill
```

Tuer le wrapper npm ne libère pas le port — c'est le kill du listener qui compte.
N'utilise pas `pkill -f` avec un motif large, il peut tuer la session de l'agent.

## 3. Driver navigateur (première fois seulement)

`chromium-cli` n'est pas disponible ici, et le conteneur n'a **ni Playwright ni
les libs système** de Chromium. Installation hors du projet, pour ne pas polluer
`package.json` :

```bash
mkdir -p /tmp/driver && cd /tmp/driver && npm init -y && npm i playwright
npx playwright install chromium
sudo npx playwright install-deps chromium   # sans sudo : libatk-1.0.so.0 introuvable
```

Le `install-deps` est **obligatoire** : sans lui, `chromium.launch()` échoue sur
`error while loading shared libraries: libatk-1.0.so.0`. Le sudo sans mot de
passe fonctionne dans ce codespace.

Même cause pour l'erreur `React Native DevTools` au démarrage d'Expo : c'est
attendu dans ce conteneur, l'app n'en est pas affectée.

## 4. Piloter

`drive.mjs` (à côté de ce fichier) couvre l'écran d'auth de bout en bout :
rendu, bascule inscription/connexion, les trois validations locales, et le
message d'erreur réseau. Copie-le et lance-le :

```bash
cp .claude/skills/run-app/drive.mjs /tmp/driver/ && mkdir -p /tmp/driver/shots
cd /tmp/driver && node drive.mjs
```

Captures dans `/tmp/driver/shots/`. **Regarde-les** — une frame blanche est un
échec de rendu, même si les assertions passent.

## Pièges rencontrés

- **Textes accentués.** Les sélecteurs `getByText` doivent porter les accents
  exacts (`Créer un compte`, `Déjà un compte ?`). Un sélecteur sans accent ne
  matche pas.
- **`TextInput` React Native Web.** Cible-les par `page.locator('input').nth(n)`
  dans l'ordre du DOM ; en mode inscription l'index 0 est le pseudo, en mode
  connexion c'est l'email. `eval el.value = …` ne déclenche pas `onChangeText`,
  utilise `fill()`.
- **`console --errors` / erreurs console.** `net::ERR_NAME_NOT_RESOLVED` est
  normal avec l'URL Supabase factice. Toute autre erreur est à investiguer.
- **Le viewport.** `{ width: 420, height: 900 }` approche un écran mobile ; en
  viewport desktop la mise en page ne reflète pas la cible.
