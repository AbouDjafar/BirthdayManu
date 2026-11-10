# Backend Supabase en production

Projet : yjgasdkboahgwvdgbksp. Le schéma et les contenus définitifs sont installés.
Les migrations utilisent database/setup.sql. Les contrôles de sécurité sont dans
database/verify.sql ; les tests synthétiques transactionnels sont dans
database/test.sql et se terminent par ROLLBACK.

## Sécurité

Les six tables ont RLS activé. Les visiteurs n’ont aucun accès direct aux tables ;
les RPC publiques ne renvoient aucun identifiant de participante, réponse correcte
ou contenu privé. Le calcul du score et les quotas de messages restent en base.
Les notifications Realtime diffusent seulement une invalidation vide, puis le
navigateur relit le mur. Un repli toutes les quinze secondes couvre les coupures.

La clé publishable est publique. La clé sb_secret locale est réservée à la
configuration administrative et ne doit jamais porter le préfixe VITE_. Le maintien
actif GitHub utilise uniquement la clé publique. Aucun service mail n’est configuré.

## Modifier les contenus

Les questions et options publiques se trouvent dans src/app/questions.json.
Les bonnes réponses et la lettre sont dans le fichier local birthday.private.json,
ignoré par Git. Les indices correctAnswers commencent à zéro. Après modification :

    npm run configure:backend -- birthday.private.json

Le script emploie SUPABASE_URL et SUPABASE_SECRET_KEY de .env.local, puis appelle
configure_birthday. Il conserve le code existant enregistré dans
manuella-link.private.json pour ne pas invalider un lien déjà partagé. Seul le hash
du code est enregistré en base. Le contenu de la lettre et le code ne sont jamais
compilés avec le front et ne doivent pas être collés dans un fichier versionné.

Le lien privé peut être ouvert depuis ce fichier local. Manuella peut lire sa
lettre, jouer sous son nom automatique et voir les mots et le classement.

## Modérer et tester

Passer messages.hidden à true masque un mot. Les contrôles en base limitent les
messages à trois par participante, espacés de trente secondes. Sans compte,
l’identité par UUID de navigateur reste une limite assumée.

Pour des essais réels, utiliser une identité de test distincte et retirer seulement
les données de cet essai avant diffusion. Ne pas effacer les participations réelles.
Les fichiers SQL de tests utilisent une transaction avec ROLLBACK et peuvent
vérifier les permissions, les scores, les quotas et les codes privés sans conserver
leurs données synthétiques.

Le workflow keepalive.yml utilise le calendrier de Douala et effectue une lecture
tous les deux jours. Il ne modifie aucune donnée et n’envoie aucun mail. Les colonnes
historiques de suivi de notification sont conservées en base pour compatibilité,
mais aucun traitement ne les utilise.
