# BirthdayManu

Application d’anniversaire de Manuella, en production :
https://birthdaymanu.vercel.app/

L’ancienne adresse https://aboudjafar.github.io/BirthdayManu/ reste accessible
comme secours, à sa dernière version publiée. Elle n’est plus redéployée.

Cinq questions posées par Manuella, un score, six portraits selon le résultat,
une photo surprise commune, un mur et un classement partagés. Les résultats
peuvent être partagés sous forme de carte PNG avec prénom, portrait et score,
accompagnée d’un message et du lien public. Si le partage natif est indisponible,
la carte peut être téléchargée et le lien copié.

## Développement local

Node.js 22, version 22.12 minimum. Copier .env.example en .env.local si ce fichier n’existe
pas, puis renseigner l’URL et la clé publishable Supabase. Le projet local est
déjà configuré. Il n’existe plus de mode démonstration.

    npm ci
    npm run dev

Ouvrir http://127.0.0.1:5173/ . Les données sont réelles et partagées avec le site.

## Vérification et publication

    npm run typecheck
    npm run test:all
    npm run build
    npm run preview

Avec VITE_BASE_PATH=/, le build local se consulte sur http://127.0.0.1:4173/ .
Le workflow GitHub Actions CI exécute les vérifications sur main et les pull requests.
Vercel importe AbouDjafar/BirthdayManu et publie automatiquement les commits de main.
Le projet birthdaymanu utilise Vite, Node.js 22, npm ci et la sortie dist.
Vercel attend le succès du contrôle GitHub « BirthdayManu CI » avant la promotion
en production. Son build exécute npm run build ; les tests restent dans GitHub Actions.

Les variables publiques VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
VITE_BASE_PATH=/ et VITE_PUBLIC_SITE_URL=https://birthdaymanu.vercel.app/ sont
configurées dans Vercel pour Production et Preview. Les partages, y compris ceux
d’une preview, utilisent l’adresse publique de production. Aucun secret Supabase
ni contenu privé n’est nécessaire au build. Le cron reste dans GitHub Actions.

Le changement de domaine crée un stockage navigateur distinct. Les scores et
messages restent partagés en base, mais les identités locales ne sont pas
transférées automatiquement de GitHub Pages vers Vercel.

## Supabase et contenus privés

Le backend du projet yjgasdkboahgwvdgbksp est installé et configuré. Les bonnes
réponses et la lettre romantique sont uniquement en base ; aucun marquage des
bonnes options n’est publié dans les questions. Le lien privé réel est conservé
localement dans manuella-link.private.json, ignoré par Git.

Voir [le guide Supabase](docs/SUPABASE.md) pour la configuration et la modération.
Le classement de Manuella utilise automatiquement Manuella l’Anniversaireuse,
sans saisie de prénom et sans remplacer l’identité d’une amie sur le navigateur.

## Maintien actif

Le workflow Maintenir Supabase actif fait une lecture publique en base tous les
deux jours. Le cron se déclenche à 07 h 17, heure de Douala ; un contrôle de date
évite une opération les jours intermédiaires et conserve l’intervalle au passage
d’un mois à l’autre. GitHub peut retarder ses tâches planifiées.

    npm run keepalive:now

Le déclenchement manuel du workflow permet aussi une vérification immédiate.
Aucun mail n’est envoyé : cette fonctionnalité et ses dépendances ont été retirées.

## Images et entretien

Seuls les portraits WebP optimisés et la photo surprise sont publiés dans
public/assets. Les images originales fournies sont conservées localement dans
assets-originaux, ignoré par Git. Chaque score possible (0, 20, 40, 60, 80, 100)
a un portrait distinct ; la photo surprise est identique pour tout le monde.
Les portraits existent en 160, 320 et 480 pixels, choisis selon la taille affichée
et la densité de l’écran ; les images secondaires sont chargées à la demande.
Les polices sont hébergées localement et le premier affichage utilise une police
de secours. `scripts/optimize-assets.py` régénère les images depuis les originaux.

Le favicon est un monogramme M propre à l’application. Les modals restent
parcourables par défilement sans afficher de barre. La signature du Vizir est
affichée en italique dans les pieds de page.
Elle n’apparaît pas dans les modals.

Le score validé s’affiche immédiatement, sans attendre l’animation ni les images.
La carte PNG est dessinée localement avec un monogramme si le portrait tarde,
puis actualisée quand il arrive. Réponses, UUID de tentative et résultat sont
sauvegardés : recharger la page permet de reprendre la partie et de retrouver
le score confirmé. Les réessais réseau réutilisent le même UUID et ne comptent
pas comme une nouvelle participation. Une première validation nécessite une
connexion à Supabase ; aucune réponse correcte n’est embarquée dans le navigateur.

Les messages publics peuvent être masqués dans Supabase en passant hidden à
true. Il n’existe pas de compte utilisateur : changer de navigateur ou effacer
le stockage local crée une nouvelle participante.
