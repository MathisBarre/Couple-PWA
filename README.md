# Cycle à deux

PWA de suivi des règles partagée entre deux comptes. On l'installe sur l'écran d'accueil (iPhone et Android), on note le flux et la douleur en un appui, et on reçoit des rappels pour ne pas oublier le début, la suite et la fin des règles.

L'app est organisée en **espaces**, un par onglet dans la barre du bas :

- **Cycle** 💧, avec trois onglets en haut :
  - **Aujourd'hui** : où en est le cycle, et la saisie rapide (« Ça continue » / « C'est fini » en un appui, aujourd'hui, hier ou avant-hier en un geste).
  - **Calendrier** : historique, règles prévues en pointillés, modifier n'importe quel jour passé.
  - **Analyse** : durée du cycle et des règles, prochaines règles, jours abondants et douloureux, traces hors règles, symptômes fréquents, points à surveiller, export CSV.
- **Courses** 🛒 : liste de courses commune, ajout rapide (plusieurs articles d'un coup avec des virgules), cocher au magasin, vider le panier. Fonctionne hors ligne et se synchronise entre les deux téléphones.
- **Réglages** ⚙️ : notifications, date de pose du stérilet, durée de cycle par défaut, code d'invitation.

Chaque espace a sa couleur : rose pour le cycle, verdure pour les courses, neutre pour les réglages. Pour ajouter un espace (par exemple les séances de sport) : une entrée dans `src/modules.ts` (avec son thème, défini dans `src/index.css`) et son écran dans `src/App.tsx`. Au-delà de trois espaces, la barre du bas range automatiquement les suivants et les réglages dans un onglet « Plus ».

Le pourquoi de ces choix (effets du stérilet au cuivre, fonctions des autres applis) est dans [docs/RECHERCHE.md](docs/RECHERCHE.md).

## Architecture

Tout tourne sur **Vercel**, la base est un **SQLite hébergé chez Turso** (offre gratuite).

- **Front** : React, TypeScript, Vite, Tailwind CSS v4, [Base UI](https://base-ui.com), `vite-plugin-pwa` (manifeste, service worker, cache hors ligne, icônes, écrans de démarrage iOS).
- **API** : fonctions Vercel dans `api/` (format Web `Request`/`Response`).
  - `auth` : comptes e-mail + mot de passe (scrypt), session par cookie signé valable un an.
  - `couple` : créer l'espace, le rejoindre avec un code, réglages.
  - `logs` : lire, enregistrer, effacer les journées.
  - `groceries` : lire et modifier la liste de courses.
  - `push` : abonner un appareil aux notifications, envoyer un test.
  - `cron` : rappels quotidiens.
- **Base** : SQLite (libSQL / Turso). Les tables sont créées automatiquement au premier appel, il n'y a pas de migration à lancer.
- **Notifications** : Web Push. Une tâche planifiée Vercel appelle `/api/cron` une fois par jour vers 19 h (heure de Paris en hiver, 20 h en été) et envoie au plus un rappel aux deux téléphones.
- **Hors ligne** : l'app s'ouvre sans réseau, affiche les dernières données et met les saisies en attente jusqu'au retour du réseau. Les saisies de l'autre apparaissent à l'ouverture de l'app (et toutes les minutes tant qu'elle est ouverte).
- **Logique de cycle** : un seul fichier, `shared/cycles.ts`, utilisé par l'app et par la tâche de rappels, testé par `npm test`.

Les rappels envoyés :

| Situation | Rappel |
|---|---|
| Règles en cours, jour pas encore noté | « Jour N des règles : ça continue ? » |
| Rien noté depuis 2 à 4 jours après un saignement | « Les règles sont terminées ? » |
| 2 jours avant la date prévue | « Règles prévues dans ~2 jours » |
| Jour prévu | « Règles prévues aujourd'hui » |
| Retard de 2, 5 et 8 jours | « Règles en retard de N jours » |

## Mise en place (une seule fois, ~10 minutes)

### 1. Importer le projet dans Vercel

Sur [vercel.com/new](https://vercel.com/new), importer le dépôt GitHub `Couple-PWA`. Vercel détecte Vite tout seul : ne rien changer et déployer (le premier déploiement affichera une erreur de connexion tant que la base n'est pas branchée, c'est normal).

### 2. Brancher la base Turso

Dans le projet Vercel : **Storage → Create Database → Turso** (ou **Integrations → Marketplace → Turso**), offre gratuite, région Europe. Relier la base au projet : Vercel ajoute tout seul `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN`.

### 3. Ajouter les autres variables

Générer les clés de notification :

```bash
npx web-push generate-vapid-keys
```

Puis dans **Settings → Environment Variables** du projet Vercel :

| Variable | Valeur |
|---|---|
| `AUTH_SECRET` | une longue chaîne aléatoire (`openssl rand -hex 32`) |
| `VITE_VAPID_PUBLIC_KEY` | la clé publique générée |
| `VAPID_PRIVATE_KEY` | la clé privée générée |
| `VAPID_SUBJECT` | `mailto:` suivi de votre e-mail |
| `CRON_SECRET` | une autre chaîne aléatoire (Vercel l'utilise pour appeler `/api/cron`) |

Redéployer (**Deployments → … → Redeploy**). La tâche planifiée est déclarée dans `vercel.json` et apparaît dans **Settings → Cron Jobs**.

### 4. Installer sur les téléphones

1. **iPhone** : ouvrir le site dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. Ouvrir l'app depuis l'icône (les notifications ne marchent sur iPhone que depuis l'app installée, iOS 16.4 ou plus).
2. **Android** : ouvrir dans Chrome → menu → **Installer l'application**.
3. Chacun crée son compte. L'un appuie sur **Créer notre espace**, l'autre saisit le **code** affiché dans les Réglages du premier.
4. Dans **Réglages**, activer les notifications sur chaque téléphone et appuyer sur « Envoyer une notification de test ».

## Développement

```bash
cp .env.example .env.local   # facultatif : sans Turso, une base locale local.db est utilisée
npm install
npm run dev                  # app + API en local sur http://localhost:5173
npm test                     # tests de la logique de cycle
npm run build                # vérification des types + build de production (dist/)
npm run icons                # régénère icônes et écrans de démarrage (public/logo.svg et public/logo-full-bleed.svg)
```

**Mises à jour** : l'app installée vérifie s'il existe une nouvelle version à l'ouverture, à chaque retour sur l'app et toutes les heures. Elle s'installe toute seule : tout de suite si l'écran n'a pas encore été touché, sinon dès que l'app passe en arrière-plan (jamais en pleine saisie). En cas de souci, **Réglages → Forcer la mise à jour** retélécharge toute l'app ; la version affichée au-dessus permet de vérifier laquelle tourne.

Si vous changez le logo, les écrans de démarrage ou le thème : sur iPhone, l'icône et l'écran de démarrage sont copiés au moment de « Sur l'écran d'accueil ». Il faut supprimer l'app de l'écran d'accueil et la réajouter pour voir les nouveaux. Selon les versions d'iOS, l'écran de démarrage clair ou sombre peut aussi rester celui du thème actif au moment de l'ajout.

Pour déclencher les rappels à la main (en local ou en production) :

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<votre-app>.vercel.app/api/cron
```

Cette application n'est pas un dispositif médical : les prévisions et alertes sont indicatives.
