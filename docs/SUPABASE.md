# Mettre en service le backend Supabase

Le site fonctionne d’abord en démonstration locale. Ce backend indépendant est
préparé pour un **nouveau projet Supabase dédié**, distinct d’un éventuel backend
Lovable. Les fichiers SQL sont volontairement dans `database/`, conformément aux
consignes du dépôt ; aucune migration Lovable n’est modifiée.

## 1. Créer le projet gratuit

1. Créer un compte sur [Supabase](https://supabase.com/dashboard), puis un nouveau
   projet dans une organisation **Free**. Choisir la région la plus proche des
   visiteuses et conserver le mot de passe de base dans un gestionnaire privé.
2. Attendre que le projet soit prêt. Ouvrir **SQL Editor**, coller et exécuter
   `database/setup.sql`. Le fichier est transactionnel et peut être rejoué : il
   préserve les données, les réponses déjà configurées et l’identité de Manuella.
3. Exécuter `database/verify.sql`. Les contrôles `ok` doivent être vrais. Au départ,
   `configured_question_count = 0` est normal : aucune bonne réponse de
   démonstration n’est automatiquement chargée. Le calcul des scores reste bloqué
   tant que les cinq réponses réelles ne sont pas configurées.
4. Dans **Realtime → Settings**, conserver l’accès aux canaux publics autorisé.
   Ne pas activer **Postgres Changes** sur les tables métier. Les triggers envoient
   uniquement un Broadcast public sur `birthday-wall`, événement `changed`,
   contenu `{}`. Le navigateur recharge ensuite les données par RPC.
5. Dans **Connect** ou **Settings → API Keys**, relever l’URL du projet et la clé
   publique `sb_publishable_…`. Créer une clé `sb_secret_…` pour la configuration
   administrative et les notifications, si nécessaire. Les anciennes clés `anon`
   et `service_role` correspondent aux anciennes versions de ces clés.

Les six tables métier ont RLS activé et aucun accès direct pour les rôles
`anon` et `authenticated`. Aucun UUID de joueuse, hash de code ou indicateur de
notification n’est renvoyé par les lectures publiques. `service_role` garde les
droits administratifs nécessaires aux scripts.

## 2. Brancher le site et fournir les vrais contenus

Créer `.env.local` à la racine, avec ses valeurs réelles, sans le versionner :

```dotenv
VITE_SUPABASE_URL=https://VOTRE_REFERENCE.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VOTRE_CLE_PUBLIQUE
SUPABASE_URL=https://VOTRE_REFERENCE.supabase.co
SUPABASE_SECRET_KEY=sb_secret_VOTRE_CLE_PRIVEE
```

Les deux valeurs `VITE_` seront publiques dans le navigateur. Les deux dernières
servent au script administratif local ; ne jamais préfixer la clé secrète par
`VITE_`. Redémarrer le serveur local après changement des variables.

Compléter d’abord les cinq questions et options publiques dans
`src/app/questions.json`. Créer ensuite le fichier ignoré `birthday.private.json`
à partir du modèle fourni, puis renseigner :

- `correctAnswers` : pour chaque clé `q1` à `q5`, l’indice de la bonne option,
  **en commençant à zéro** ; les `null` du modèle doivent être remplacés.
- `manuellaText` : le véritable message romantique privé.
- `manuellaPhotoUrl` : facultatif ; pour le premier lancement, l’omettre.

Configurer la base depuis le terminal du projet :

```powershell
npm run configure:backend -- birthday.private.json
```

Le script vérifie les indices contre les options publiques, génère un code de
32 octets aléatoires cryptographiques et envoie à la RPC administrative les
**textes exacts** des bonnes options et uniquement le SHA-256 du code. Il conserve
le lien dans `manuella-link.private.json`, ignoré par Git, et réutilise ce code lors
des reconfigurations. Il ne journalise ni le code, ni la lettre, ni les clés.
Garder ce fichier privé dans un emplacement sûr. L’URL publique prévue est
`https://aboudjafar.github.io/BirthdayManu/` ; le lien spécial utilise `#/m-CODE`.

Alternative : `database/configure.example.sql` donne le contrat SQL à exécuter
comme administrateur, après substitution de tous les placeholders dans une copie
privée. Son hash invalide empêche un chargement accidentel du modèle. Ne jamais
remplacer les placeholders dans le fichier suivi par Git.

Le message privé est chargé exclusivement après validation du code. Une photo
placée dans un bucket public reste accessible à toute personne possédant son URL,
même si celle-ci vient du message privé. Une photo réellement protégée demanderait
un bucket privé et une URL temporaire signée côté serveur après contrôle du code ;
ce supplément n’est pas nécessaire au parcours texte livré.

## 3. Identité spéciale de Manuella et contrat des RPC

La configuration crée une seule identité serveur pour Manuella, différente des
UUID conservés dans les navigateurs des amies. Elle est liée au code et son nom
est toujours **`Manuella l'Anniversaireuse`**. Ses parties apparaissent au classement,
dans une seule entrée ; rejouer conserve son meilleur score. Ce nom est réservé
et refusé dans le parcours public. La reconfiguration ou la rotation du hash ne
change pas son identité, ses scores ou ses mots.

Les RPC suivantes sont exécutables par `anon` et `authenticated` :

| RPC et paramètres | Réponse |
| --- | --- |
| `submit_quiz(p_player_id uuid, p_first_name text, p_answers jsonb)` | `{score, best}` |
| `get_my_best(p_player_id uuid)` | `{first_name, best_score}` ou `null` |
| `get_leaderboard()` | Lignes `{first_name, best_score, updated_at}` |
| `get_messages()` | Lignes `{first_name, body, created_at}`, mots visibles seulement |
| `post_message(p_player_id uuid, p_first_name text, p_body text)` | `void` |
| `get_manuella_content(p_code text)` | `{text, photoUrl?, bestScorePercent}` ou `null` |
| `submit_manuella_quiz(p_code text, p_answers jsonb)` | `{score, best}` |
| `post_manuella_message(p_code text, p_body text)` | `void` |

`p_answers` contient exactement `q1` à `q5`, avec les **textes des options**, et non
les indices. `bestScorePercent` est `null` avant la première partie de Manuella.
Un mauvais code renvoie `null` pour la lecture privée ; les deux écritures privées
le refusent. L’UUID réservé à Manuella n’est renvoyé par aucune RPC.

La seule RPC administrative, réservée à `service_role`, est :

```text
configure_birthday(
  p_correct_answers jsonb,
  p_code_hash text,
  p_manuella_text text,
  p_manuella_photo_url text DEFAULT NULL
) -> void
```

Le hash attendu contient 64 caractères hexadécimaux minuscules. Le code réel doit
être généré par une source cryptographique : sa seule longueur ne garantit pas sa
sécurité. Le serveur accepte les codes base64url de 43 à 128 caractères.

Les prénoms ont de 2 à 30 caractères après normalisation. Les mots ont de 1 à 280
caractères après normalisation des espaces ; le prénom enregistré en base est
utilisé, même si l’appelant transmet un autre prénom. Il faut avoir joué avant de
poster dans le parcours public. Le quota est de trois mots par identité et de
30 secondes entre deux mots, y compris pour Manuella. Les mots masqués comptent
encore dans ce quota. Un verrou sur la joueuse empêche deux appels simultanés de
contourner ces contrôles. Un petit filtre modifiable dans
`birthday_private.save_message` refuse quelques insultes courantes.

## 4. GitHub Pages, notifications et prise en main

Dans le dépôt GitHub, configurer les variables publiques utilisées par le build :
`VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

Dans **Settings → Secrets and variables → Actions → Secrets**, préparer :

- `SUPABASE_URL` et `SUPABASE_SECRET_KEY` pour les notifications ;
- les identifiants du service mail retenu, l’expéditeur, `OWNER_EMAIL` et
  `MANUELLA_EMAIL`, conformément au workflow de notifications ;
- `MANUELLA_SECRET_LINK` seulement si le lien doit être envoyé dans le premier mail.

Le script de notifications utilise les colonnes `notified_owner` et
`notified_manuella` de `public.messages`, avec `hidden = false`. Les requêtes faites
par la clé secrète passent avec le rôle `service_role`, qui contourne RLS.

Pour me laisser terminer la connexion, tu peux transmettre dans le chat le **nom
du projet, sa référence, son URL et sa clé publique**. Renseigne la clé secrète
directement dans `.env.local` et/ou dans les secrets GitHub, puis indique que c’est
fait. Pour une intervention via le tableau de bord, ouvre une session Supabase
authentifiée dans un navigateur accessible à Codex et indique le projet cible.
Ne transmets pas ton mot de passe, le code de Manuella ou une clé administrative
dans le chat. Un accès au dépôt GitHub authentifié permet ensuite de configurer
ses variables et de lancer les workflows sans exposer ces valeurs.

## 5. Vérifications avant diffusion

`database/test.sql` contient des essais **synthétiques** transactionnels terminés
par `ROLLBACK` : accès directs interdits, configuration vide, réponses mal formées,
score parfait puis moins bon, retour d’une joueuse, code privé incorrect/correct,
identité unique de Manuella, prénom réservé, normalisation, temporisation, quota
et masquage des mots. Le fichier peut être exécuté comme administrateur après
`setup.sql`, sans conserver ses données de test.

Compléter avec les essais sur le vrai projet : deux téléphones, nouveau mot visible
sur l’autre écran, masquage/suppression retirés du mur, classement actualisé après
une partie, perte du WebSocket avec polling toutes les 15 secondes, notifications
de l’auteur, aucun email de Manuella avant le 12 décembre 2026 à Douala. Inspecter
les réponses HTTP et les événements WebSocket : ils ne doivent contenir aucun
`player_id`, bonne réponse, code ou contenu privé sans son code.

Le SQL a été testé sur un PostgreSQL embarqué avec les rôles Supabase et un stub
de `realtime.send` ; cela vérifie le SQL, les permissions et le comportement des
RPC, mais pas le service WebSocket ou les emails distants. Les tests de concurrence
sur plusieurs connexions et les essais Supabase réels restent à faire à la connexion
du projet. Ne pas supprimer les données réelles en voulant nettoyer les essais.

Sans authentification, un UUID de navigateur est une possession locale, pas une
identité vérifiée : créer de nouveaux UUID contourne les quotas globaux. Les essais
répétés du quiz permettent aussi d’inférer des réponses à partir des scores, même
si la table des réponses reste inaccessible. Le filtre lexical reste sommaire.

Le cron qui interroge régulièrement la base réduit le risque de pause de l’offre
Free ; Supabase ne promet pas qu’une quantité précise de requêtes évite toute
pause. Surveiller les emails de pause et vérifier le projet avant le départ.

Documentation officielle : [clés API](https://supabase.com/docs/guides/getting-started/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[fonctions](https://supabase.com/docs/guides/database/functions),
[Broadcast](https://supabase.com/docs/guides/realtime/broadcast),
[pause Free](https://supabase.com/docs/guides/platform/free-project-pausing).
