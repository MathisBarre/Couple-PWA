# Cycle à deux

PWA de suivi des règles partagée entre deux comptes. On l'installe sur l'écran d'accueil (iPhone et Android), on note le flux et la douleur en un appui, et on reçoit des rappels pour ne pas oublier le début, la suite et la fin des règles.

- **Aujourd'hui** : où en est le cycle, et la saisie rapide (« Ça continue » / « C'est fini » en un appui, aujourd'hui, hier ou avant-hier en un geste).
- **Calendrier** : historique, règles prévues en pointillés, modifier n'importe quel jour passé.
- **Analyse** : durée du cycle et des règles, prochaines règles, jours abondants et douloureux, spotting, symptômes fréquents, points à surveiller, export CSV.
- **Réglages** : notifications, heure des rappels, date de pose du stérilet, code d'invitation.

Le pourquoi de ces choix (effets du stérilet au cuivre, fonctions des autres applis) est dans [docs/RECHERCHE.md](docs/RECHERCHE.md).

## Architecture

- **Front** : React + Vite + `vite-plugin-pwa` (manifeste, service worker, cache hors ligne, icônes, écrans de démarrage iOS).
- **Données et comptes** : [Supabase](https://supabase.com) (offre gratuite) : comptes e-mail / mot de passe, base Postgres, sécurité par lignes (chacun ne voit que les données de son couple), temps réel (la saisie de l'autre apparaît tout de suite).
- **Notifications** : Web Push. Une fonction Supabase (`supabase/functions/send-reminders`) tourne toutes les heures et envoie au plus un rappel par jour, à l'heure choisie, aux deux téléphones.
- **Logique de cycle** : un seul fichier, `supabase/functions/_shared/cycles.ts`, utilisé par l'app et par la fonction de rappels.

Les rappels envoyés :

| Situation | Rappel |
|---|---|
| Règles en cours, jour pas encore noté | « Jour N des règles : ça continue ? » |
| Rien noté depuis 2 à 4 jours après un saignement | « Les règles sont terminées ? » |
| 2 jours avant la date prévue | « Règles prévues dans ~2 jours » |
| Jour prévu | « Règles prévues aujourd'hui » |
| Retard de 2, 5 et 8 jours | « Règles en retard de N jours » |

## Mise en place (une seule fois, ~20 minutes)

### 1. Créer le projet Supabase

1. Créer un compte sur [supabase.com](https://supabase.com) puis un projet (région Europe, ex. Paris).
2. **SQL Editor** → coller le contenu de `supabase/migrations/20261109000000_init.sql` → Run.
3. **Authentication → Sign In / Providers → Email** : laisser activé. Pour aller plus vite, vous pouvez désactiver « Confirm email » (sinon il faut cliquer le lien reçu avant de se connecter).
4. **Project Settings → API** : noter l'URL du projet et la clé `anon` (publique).

### 2. Générer les clés de notification (VAPID)

```bash
npx web-push generate-vapid-keys
```

Garder la clé publique et la clé privée.

### 3. Déployer la fonction de rappels

Avec la [CLI Supabase](https://supabase.com/docs/guides/cli) :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<clé publique> \
  VAPID_PRIVATE_KEY=<clé privée> \
  VAPID_SUBJECT=mailto:<votre e-mail> \
  CRON_SECRET=<une longue chaîne aléatoire>
npx supabase functions deploy send-reminders --no-verify-jwt
```

### 4. Planifier les rappels (toutes les heures)

Dans **Database → Extensions**, activer `pg_cron` et `pg_net`, puis dans le SQL Editor :

```sql
select cron.schedule(
  'send-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<ref-du-projet>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
```

La fonction vérifie elle-même l'heure de rappel de chaque couple (réglable dans l'app, 20 h par défaut, heure de Paris).

### 5. Héberger l'app (HTTPS obligatoire)

Le plus simple : [Vercel](https://vercel.com) (gratuit). Importer le dépôt GitHub, laisser les réglages Vite par défaut et ajouter les variables d'environnement :

```
VITE_SUPABASE_URL=https://<ref-du-projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
VITE_VAPID_PUBLIC_KEY=<clé publique VAPID>
```

Netlify ou Cloudflare Pages marchent aussi (commande `npm run build`, dossier `dist`).

### 6. Installer sur les téléphones

1. **iPhone** : ouvrir le site dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. Ouvrir l'app depuis l'icône (les notifications ne marchent sur iPhone que depuis l'app installée, iOS 16.4 ou plus).
2. **Android** : ouvrir dans Chrome → menu → **Installer l'application**.
3. Chacun crée son compte. L'un appuie sur **Créer notre espace**, l'autre saisit le **code** affiché dans les Réglages du premier.
4. Dans **Réglages**, activer les notifications sur chaque téléphone et appuyer sur « Envoyer une notification de test ».

## Développement

```bash
cp .env.example .env.local   # puis remplir les valeurs
npm install
npm run dev                  # app en local
npm test                     # tests de la logique de cycle
npm run build                # build de production (dist/)
npm run icons                # régénère icônes et écrans de démarrage depuis public/logo.svg
```

Pour forcer l'envoi des rappels sans attendre l'heure :

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/send-reminders \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"force":true}'
```

Cette application n'est pas un dispositif médical : les prévisions et alertes sont indicatives.
