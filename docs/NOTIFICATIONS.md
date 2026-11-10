# Notifications du mur

Le workflow `Notifications du mur` interroge Supabase toutes les 30 minutes. Il envoie au maximum un récapitulatif à l'auteur et un à Manuella par exécution, uniquement s'il existe de nouveaux messages visibles. Les réponses du quiz et le message romantique ne font jamais partie de ces mails.

Avant la configuration de Gmail et de la clé serveur, l'URL et la clé publique suffisent au maintien de l'activité : le script appelle une seule fois la RPC publique `get_leaderboard`, ignore les données reçues et n'envoie aucun mail. Cette étape ne nécessite aucun accès privilégié et fonctionne même si le site est encore en mode démo. Le backend SQL doit déjà être installé.

Les mails à Manuella commencent le **12 décembre 2026 à 00 h 00, heure de Douala**. Cette date correspond au 11 décembre à 23 h 00 UTC. Les messages déposés avant son anniversaire restent en attente pour elle. Aucun lien secret n'est inclus dans les mails ; sa diffusion reste manuelle.

## Configurer un compte Gmail dédié

1. Créer ou choisir un compte Gmail réservé à ce projet.
2. Activer la validation en deux étapes dans le compte Google.
3. Créer un **mot de passe d'application**, avec un nom tel que « Notifications du mur ». Utiliser ce mot de passe, jamais le mot de passe principal du compte.
4. Dans le dépôt GitHub, ouvrir **Settings → Secrets and variables → Actions → Secrets**, puis ajouter les valeurs ci-dessous. Ne les mettre ni dans un fichier suivi par Git, ni dans une variable commençant par `VITE_`.

| Secret GitHub | Valeur attendue |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SECRET_KEY` | Clé serveur Supabase ; une clé publique/publishable ne suffit pas |
| `SMTP_USER` | Adresse complète du compte Gmail dédié |
| `SMTP_PASS` | Mot de passe d'application Google |
| `MAIL_FROM` | Même adresse Gmail, éventuellement au format `Le mur <adresse>` |
| `OWNER_EMAIL` | Adresse seule de l'auteur, sans nom d'affichage |
| `MANUELLA_EMAIL` | Adresse seule de Manuella, sans nom d'affichage |

Le nom historique `SUPABASE_SERVICE_ROLE_KEY` est également accepté lorsque `SUPABASE_SECRET_KEY` n'est pas renseigné. Ces clés serveur contournent les protections publiques de la base : elles doivent rester dans les Secrets GitHub ou dans le fichier local ignoré par Git.

Pour le maintien de l'activité avec la clé publique seule, le workflow utilise les variables de dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. Le Secret `SUPABASE_URL`, s'il existe, remplace cette URL publique. En local, les noms correspondants sont `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. Quand la clé serveur est ajoutée, elle prend automatiquement le relais et le traitement habituel des notifications est activé.

Dans l'onglet **Variables**, on peut ajouter `MANUELLA_NOTIFY_FROM`, au format `AAAA-MM-JJ`. Sans variable, le script utilise `2026-12-12`. Le fuseau est toujours `Africa/Douala`.

Le script se connecte à `smtp.gmail.com`, port `465`, avec TLS. L'authentification SMTP n'est initialisée que lorsqu'un envoi est nécessaire. Un mot de passe Google modifié révoque les mots de passe d'application ; certaines configurations de comptes ne permettent pas d'en créer. Voir [l'aide Google](https://support.google.com/accounts/answer/185833?hl=fr).

Un compte Gmail personnel peut envoyer jusqu'à 500 mails par jour selon la [documentation Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp). Ce projet prévoit au maximum 96 récapitulatifs par jour, hors lancements manuels. La réception effective et le classement dans les courriers indésirables doivent être vérifiés avant le départ.

## Tester sans envoyer de mail

Le backend Supabase doit être créé avant les tests réseau. Sans URL ou sans aucune clé, le script affiche une information et termine normalement. Avec la clé publique seule, il effectue uniquement la vérification d'activité décrite ci-dessus. Avec la clé serveur mais Gmail incomplet, il interroge la base, puis laisse les messages en attente sans envoyer ni les marquer.

Dans GitHub : **Actions → Notifications du mur → Run workflow**. Garder **dry_run** coché, ce qui est le choix par défaut pour les lancements manuels. Ce mode lit les messages et affiche uniquement leur nombre. Il n'envoie rien et ne change aucun indicateur. Les exécutions planifiées fonctionnent avec l'envoi activé lorsque tous les secrets sont renseignés.

En local avec Node 22, renseigner les mêmes variables dans `.env.local`, ignoré par Git, puis lancer :

```powershell
node --env-file-if-exists=.env.local scripts/notify.mjs --dry-run
node --test scripts/notify.test.mjs
```

La variable d'environnement `NOTIFY_DRY_RUN=true` active aussi la simulation. La commande sans `--dry-run` envoie réellement si les identifiants et destinataires sont configurés ; la livraison initiale ne déclenche aucun envoi réel.

Avant le départ, faire un essai réel uniquement avec une base de test et **les deux adresses de réception remplacées par des adresses de l'auteur**. Une date temporaire dans `MANUELLA_NOTIFY_FROM` permet d'exercer le second destinataire. Restaurer les adresses et la date de production après ce test. Ne jamais avancer la date sur la production avec l'adresse réelle de Manuella pour tester.

## Garanties et limites

- Seules les lignes `hidden = false` et dont l'indicateur du destinataire est `false` sont sélectionnées. Les pages sont lues jusqu'au bout, même au-delà de 1 000 messages. Une date de coupure fixe réserve les arrivées suivantes au prochain passage.
- Un seul mail récapitule tous les messages sélectionnés pour chaque destinataire. Le contenu est du texte brut. Après acceptation SMTP, seuls les IDs inclus sont marqués, par lots de 100. Les indicateurs auteur et Manuella sont indépendants.
- Un échec d'envoi laisse les indicateurs inchangés. Une erreur pour un destinataire ne bloque pas l'autre. Les erreurs techniques rendent le workflow rouge ; les logs ne contiennent ni adresses, ni noms des participantes, ni textes des messages, ni identifiants de message, ni détails bruts du fournisseur.
- La concurrence du workflow empêche deux exécutions GitHub de cette automatisation de travailler simultanément. Éviter de lancer parallèlement le script local en mode réel. Les indicateurs empêchent les renvois après un succès complet.
- Gmail SMTP ne permet pas de garantir un envoi exactement une fois. Si la connexion est interrompue après acceptation, ou si Supabase échoue pendant le marquage, le prochain passage peut renvoyer certains messages. Le `Message-ID` est stable pour un lot identique, mais sa déduplication dépend du destinataire. Le choix privilégie la relance d'un envoi non confirmé.
- Une requête réelle en base est effectuée à chaque exécution configurée, même sans nouveau message ou sans Gmail, afin de contribuer à l'activité du projet. L'offre gratuite Supabase peut mettre en pause les projets trop peu actifs sur une semaine ; quelques requêtes quotidiennes suffisent généralement, sans garantie absolue. Voir [Supabase](https://supabase.com/docs/guides/platform/free-project-pausing).
- Le cron GitHub peut démarrer en retard ou ne pas être exécuté en cas de forte charge : la réception « dans l'heure » est un objectif, pas un délai garanti. Il fonctionne uniquement sur la branche par défaut. Dans un dépôt public, il est désactivé après 60 jours sans activité du dépôt. Voir [GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- Le job utilise un runner Linux standard, n'a que la permission GitHub `contents: read` et dispose de 10 minutes au maximum. Les logs d'Actions sont accessibles selon la visibilité du dépôt. Les runners standards des dépôts publics sont gratuits ; pour un dépôt privé, surveiller l'allocation incluse du compte. Voir [facturation Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

La configuration ne prévoit ni prestataire mail externe, ni domaine à acheter, ni mail d'ouverture automatique avec le lien secret. Resend demanderait un domaine vérifié pour envoyer à une autre adresse que celle du propriétaire du compte ; Brevo reste une alternative à configurer séparément.
