# Predict

Une application sociale pour faire des prédictions entre amis. Publie une prédiction sur quelqu'un de ton cercle, choisis une date et une heure de révélation, et laisse tes amis réagir et commenter une fois qu'elle se dévoile.

## Concept

- Crée une prédiction visible seulement par toi jusqu'à sa révélation

- Choisis quand elle se révèle (date + heure)
- Une fois révélée, tes amis peuvent commenter
- Regarde si tu avais vu juste

## Stack technique

- **Frontend** : React Native (Expo) — une seule base de code pour web et mobile
- **Backend / Base de données / Authentification** : Supabase
- **Hébergement** : Vercel
- **Environnement de développement** : GitHub Codespaces
- **Assistant de code** : Claude Code

## État du projet

🚧 En cours de développement — projet personnel d'apprentissage.

## Lancer le projet en local

```bash
npx expo start
```

Puis appuyer sur `w` pour ouvrir la version web, ou scanner le QR code avec l'app Expo Go sur mobile.

Depuis un Codespace, le téléphone n'est pas sur le même réseau que le serveur :
lancer `npx expo start --tunnel`.

## Configuration Supabase

1. Copier `.env.example` en `.env` et renseigner `EXPO_PUBLIC_SUPABASE_URL` et
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Settings → API dans le dashboard).
2. Coller `supabase/schema.sql` dans le SQL Editor et l'exécuter. Le script est
   idempotent, il peut être relancé après chaque modification — et il **doit**
   l'être à chaque fois qu'il change, sinon l'app tourne contre un schéma
   incomplet. Symptôme : « Table `predictions` introuvable » sur l'accueil.
3. **Développement — désactiver la confirmation d'email** : Authentication →
   Sign In / Providers → Email → décocher « Confirm email ».

Le point 3 n'est pas un détail de confort. Avec la confirmation activée, le lien
reçu par email redirige vers le Site URL du projet, qui vaut `localhost:3000` par
défaut — inatteignable depuis un téléphone. Et un scheme personnalisé
(`predict://`) ne fonctionne pas dans Expo Go : les liens y sont de la forme
`exp://<host>:8081/--/`, dont le host change à chaque démarrage du tunnel. La
confirmation d'email demande donc un dev build pour être testable sur mobile.
À réactiver avant toute mise en production.