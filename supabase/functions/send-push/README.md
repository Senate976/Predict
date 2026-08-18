# Envoi des notifications push

Cette fonction expédie les notifications en attente vers les téléphones. Elle
tourne **sur Supabase**, pas dans l'application : lire les jetons de tous les
destinataires est précisément ce que la RLS interdit à un utilisateur connecté.

## Mise en service (une seule fois)

1. **Lier un projet EAS**, sinon aucun jeton push ne peut être délivré :
   ```
   npx eas init
   ```
   Cela ajoute `extra.eas.projectId` dans `app.json`, que `lib/push.ts` lit.

2. **Déployer la fonction** :
   ```
   npx supabase functions deploy send-push
   ```
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement
   par Supabase à l'exécution — rien à configurer.

3. **La déclencher régulièrement.** Dans le dashboard Supabase, *Integrations →
   Cron*, créer une tâche toutes les 5 minutes qui appelle la fonction. À défaut
   de cron, n'importe quel planificateur externe qui sait faire une requête HTTP
   fait l'affaire.

## Sans cette mise en service

L'application continue de fonctionner exactement comme avant : les notifications
restent visibles dans l'onglet Notifications, générées à l'ouverture du Fil.
Elles n'arrivent simplement pas sur l'écran verrouillé.

## Vérifier que ça marche

```
curl -X POST "https://<projet>.supabase.co/functions/v1/send-push" \
  -H "Authorization: Bearer <clé anon>"
```
Répond `{"sent": N}` — `N` valant 0 s'il n'y a rien en attente, ce qui est le
cas normal la plupart du temps.
