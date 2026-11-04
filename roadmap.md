# Roadmap de la refonte de l'interface

Ce fork de [fatihak/InkyPi](https://github.com/fatihak/InkyPi) refond l'interface web en gardant le moteur d'affichage et les plugins.

## Décisions validées

- **Front :** une application React, avec Vite, shadcn, Base UI et Tailwind.
- **Build :** Node reste sur la machine de développement. Le bundle compilé est versionné, et le Pi n'a besoin que de `git pull`.
- **Emplacement :** tout le nouveau code vit dans `src/ui/`. `src/templates/`, le moteur et les dossiers de plugins restent intacts autant que possible.
- **Formulaires de plugins :** une description par plugin dans `src/ui/`, rendue par un moteur générique. Un plugin sans description ouvre l'ancienne page.
- **Langue :** anglais par défaut, interface traduisible.
- **Design :** plusieurs propositions avec `frontend-design`, puis review avec `impeccable`.
- **Validation :** sur Mac uniquement, avec l'écran simulé.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 0. Filet de sécurité | Roadmap, tests, capture des formulaires, environnement Mac, écriture atomique de la configuration | En cours |
| 1. Design | Propositions construites sur shadcn, choix, review | À faire |
| 2. Socle | Surcouche, React, routeur, client API, traductions, `NOTICE.md`, crédit à InkyPi | À faire |
| 3. Réglages et clés d'API | Premières pages React | À faire |
| 4. Formulaires de plugins | Moteur générique, portage du plus simple au plus complexe, repli sur l'ancienne page | À faire |
| 5. Accueil | État de l'écran, catalogue, tri | À faire |
| 6. Playlists | Frise sur 24 h, priorité visible, réordonnancement, bugs corrigés | À faire |
| 7. Aperçu sans envoi à l'écran | Génération seule d'une image | À faire |

## Défauts relevés par la capture des formulaires

Les captures de `tests/snapshots/plugin_forms/` décrivent l'existant, défauts compris. Les formulaires du lot 4 ne doivent pas les reproduire :

- **Option désactivée sans le vouloir :** dans `rss`, `ai_image`, `image_album` et `image_upload`, une option activée se réaffiche cochée mais garde la valeur `false`. Réenregistrer sans y toucher la désactive.
- **`weather` :** `graphIconStep` n'est pas restauré à la réouverture et revient à `2`.
- **`newspaper` :** `locationSearch` n'est pas restauré à la réouverture.
- **`image_album` :** `updateTitleOptions` est appelée mais n'est définie nulle part.

La capture remplit seulement les champs présents à l'ouverture : les lignes ajoutées dynamiquement (`calendar`, `todo_list`) et les fichiers envoyés (`image_upload`) restent à couvrir au lot 4.

## Plus tard

- **Écran personnalisé :** choisir entre des zones remplies par des plugins existants, des éléments libres, ou les deux. Un essai sur Mac a assemblé trois plugins en zones sans modifier le moteur, mais certains plugins débordent à petite taille et le coût de rendu sur un Pi Zero 2 reste inconnu.
- **Serveur à plusieurs threads :** aujourd'hui, un rendu bloque toute l'interface (`src/inkypi.py`, `threads=1`). Le changement touche au cœur et demande un test sur le Pi.
- **Protection de `/shutdown` et de l'interface :** aucune authentification, et le serveur écoute sur tout le réseau local.
- **Pi personnel :** faire pointer `origin` vers le fork.

## À vérifier sur un vrai Pi (facultatif)

- Sauvegarder `src/config/device.json`, `.env` et `src/static/images/`.
- Mettre à jour avec `git pull`, puis `sudo bash install/update.sh`.
- Vérifier que les playlists, les réglages, les images et les clés d'API sont toujours là.
- Vérifier les couleurs réelles sur l'écran et le temps de chargement de l'interface.
