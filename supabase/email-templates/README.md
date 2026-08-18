# Modèles d'emails

Supabase envoie ces emails, pas l'application : leur contenu se règle dans le
dashboard, **Authentication → Emails**, et non dans ce dépôt. Les fichiers ici
sont la version de référence, à recopier dans le dashboard — les garder
versionnés évite de redécouvrir un jour un texte qu'on n'a plus nulle part.

| Fichier | Modèle Supabase correspondant |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset password |

Les variables `{{ .ConfirmationURL }}` et `{{ .SiteURL }}` sont remplacées par
Supabase à l'envoi ; ne pas les renommer.

Deux réglages vont avec, dans **Authentication → URL Configuration** :

- *Site URL* : l'adresse du site (aujourd'hui `https://predict-orpin-five.vercel.app`),
  sans quoi le lien de confirmation renvoie vers `localhost`.
- *Redirect URLs* : y ajouter la même adresse, sinon le lien est refusé.
