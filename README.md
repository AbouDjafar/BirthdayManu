# BirthdayManu 🎂

Le quiz des amies de Manuella : cinq questions, une surprise, des petits mots et
un classement. Interface française, pensée pour le téléphone, sans compte.

**Site : https://aboudjafar.github.io/BirthdayManu/**

L’interface initiale et ses images viennent de `prompt-and-portrait`. Ce dépôt est
une application autonome Vite + React + TypeScript ; aucun serveur n’est requis.
L’historique du dépôt privé d’origine n’a pas été importé.

**État installé le 10 novembre 2026 :** GitHub Pages et les deux workflows sont
actifs. Le backend est installé sur le projet Supabase `yjgasdkboahgwvdgbksp` ;
les variables publiques GitHub et `.env.local` sont renseignées. La démo reste
active volontairement : aucune réponse réelle, lettre privée ou identité de
Manuella n’a encore été configurée en base.

Pour passer en réel, il reste à fournir les contenus définitifs et à renseigner
les secrets Gmail/Supabase privilégiés décrits ci-dessous. Il n’est pas nécessaire
de recréer le projet ni les tables.

## Tester immédiatement

Node.js **22.12 minimum**, npm, puis :

```sh
npm ci
npm run dev
```

Ouvrir **http://127.0.0.1:5173/**. Sans configuration, le mode **démo** est actif.
Les scores et mots sont fictifs et stockés dans le navigateur, conservés après
rechargement et partagés entre ses onglets. Ils ne sont pas partagés entre
appareils et ne sont jamais transférés vers Supabase.

Le lien **Tester l’accès Manuella** ouvre `#/m-demo`, une lettre fictive et son
parcours sans saisie de prénom. Son nom au classement est automatiquement
**Manuella l’Anniversaireuse**. Une amie utilisant le même navigateur conserve
son identité ; le bouton « Quitter l’accès Manuella » quitte le mode Manuella.

Les questions, les réponses de démonstration, la lettre fictive et les photos
doivent être validées ou remplacées avant la diffusion réelle. Pour repartir
de zéro en démo, effacer les données du site dans le navigateur.

## GitHub Pages

Le workflow **Publier sur GitHub Pages** vérifie les types, exécute les tests et
déploie `dist/` à chaque push sur `main`. GitHub **Settings → Pages → Source**
doit être réglé sur **GitHub Actions**. Le routage utilise `#/…` et le build la
base `/BirthdayManu/` ; images, CSS et liens fonctionnent dans ce sous-dossier.

Pour reproduire le build hébergé :

```sh
npm run typecheck
npm run test:all
npm run build
npm run preview
```

Ouvrir alors **http://127.0.0.1:4173/BirthdayManu/**.

## Brancher Supabase

Suivre **[le guide Supabase](docs/SUPABASE.md)** pour créer le projet gratuit,
installer `database/setup.sql`, vérifier les permissions et configurer les
contenus définitifs. L’installation n’ajoute aucune vraie réponse ni lettre.

1. Copier `.env.example` en `.env.local` et renseigner l’URL et la clé
   `sb_publishable_…` du projet.
2. Appliquer le SQL puis configurer les bonnes réponses et la lettre avec
   `npm run configure:backend -- birthday.private.json` (modèle :
   `birthday.example.json`). Les indices commencent à **0**. Cette commande
   utilise `SUPABASE_SECRET_KEY` côté Node uniquement et génère un code aléatoire
   dont le lien est sauvegardé dans `manuella-link.private.json`, ignoré par Git.
3. Pour un test local réel, mettre `VITE_DATA_MODE=supabase` dans `.env.local`,
   puis redémarrer le serveur.
4. Pour activer les données réelles sur Pages, créer les **variables GitHub**
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` et
   `VITE_DATA_MODE=supabase`, puis relancer le workflow de publication.

Le build Supabase exclut les réponses et la lettre de démonstration. Une
configuration absente empêche le build ; une panne réseau affiche une erreur
et permet de réessayer, sans retour silencieux aux données fictives.

Le classement et les messages sont publics, sans UUID de participante. Les
tables sont fermées au public ; toutes les lectures et écritures passent par
les RPC. Realtime diffuse seulement un signal de changement, avec repli toutes
les 15 secondes si la connexion tombe. La modération se fait depuis Supabase
avec `messages.hidden = true`.

Pour que l’agent prenne la main : connecter la session Supabase/MCP au projet.
L’URL du projet, sa référence et sa clé publishable peuvent être communiquées.
Les clés privilégiées et le mot de passe Gmail doivent être renseignés dans
les secrets GitHub ou dans `.env.local`, qui n’est pas versionné.

## Notifications Gmail

Le workflow **Notifications du mur** tourne toutes les 30 minutes. Il reste
sans envoi tant que ses paramètres ne sont pas renseignés. Le déclenchement
manuel simule les envois par défaut. Voir **[la configuration Gmail](docs/NOTIFICATIONS.md)**.

Secrets GitHub : `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`, `OWNER_EMAIL`, `MANUELLA_EMAIL`.

Les mails de Manuella commencent le **12 décembre 2026 à 00 h 00, heure de
Douala**. Aucun lien privé n’est envoyé automatiquement par mail. Les retards
du cron GitHub sont possibles ; les requêtes régulières réduisent le risque de
pause du projet Supabase gratuit, sans garantie de disponibilité absolue.

## Avant le partage

- Valider les cinq questions/options, les bonnes réponses et la lettre privée.
- Tester les deux parcours sur iPhone et Android, puis depuis deux navigateurs.
- Vérifier le meilleur score, les homonymes, les mots et la modération.
- Lancer les tests SQL du guide et une simulation des notifications.
- Tester un vrai mail vers le propriétaire après configuration de Gmail.
- Nettoyer les scores et messages de test depuis Supabase avant diffusion.
- Partager les liens le 11 décembre ; aucune ouverture automatique ni compte à rebours.

Sans compte utilisateur, changer de navigateur ou effacer le stockage crée une
nouvelle participante. Les limites par UUID ne constituent pas une identité
vérifiée. Le site et ses images publiques restent accessibles à quiconque en
connaît l’adresse ; la lettre réelle exige le lien privé.
