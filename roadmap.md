# Roadmap de la refonte de l'interface

Ce fork de [fatihak/InkyPi](https://github.com/fatihak/InkyPi) refond l'interface web en gardant le moteur d'affichage et les plugins.

## Décisions validées

- **Front :** une application React, avec Vite, shadcn, Base UI et Tailwind.
- **Build :** Node reste sur la machine de développement. Le bundle compilé est versionné, et le Pi n'a besoin que de `git pull`.
- **Emplacement :** tout le nouveau code vit dans `src/ui/`. `src/templates/`, le moteur et les dossiers de plugins restent intacts autant que possible.
- **Transition :** la nouvelle interface vit sur `/ui/`, et les pages pas encore portées ouvrent l'ancienne interface à son adresse habituelle. La page d'accueil `/` basculera quand les écrans principaux seront portés.
- **Formulaires de plugins :** une description par plugin dans `src/ui/`, rendue par un moteur générique. Un plugin sans description ouvre l'ancienne page.
- **Langue :** anglais par défaut, interface traduisible.
- **Design :** interface sobre, thèmes Graphite (clair) et Nuit (sombre), navigation en haut, vignettes en mini-illustrations grises, bouton Update preview. Voir `DESIGN.md`. Chaque lot visuel repasse par une review `impeccable`.
- **Validation :** sur Mac uniquement, avec l'écran simulé.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 0. Filet de sécurité | Roadmap, tests, capture des formulaires, environnement Mac, écriture atomique de la configuration | Terminé |
| 1. Design | Propositions construites sur shadcn, choix, review | Terminé |
| 2. Socle | `src/ui/` servi sur `/ui/`, React, routeur, client API, traductions, `NOTICE.md`, crédit à InkyPi, attributions | Terminé |
| 3. Réglages et clés d'API | Pages `/ui/settings` et `/ui/api-keys`, choix de la langue, enregistrement sûr des clés | Terminé |
| 4. Formulaires de plugins | Moteur générique, les 20 plugins portés sur `/ui/plugin/<id>`, catalogue provisoire sur `/ui/plugins`, repli sur l'ancienne page | Terminé |
| 5. Accueil | État de l'écran, catalogue, tri | À faire |
| 6. Playlists | Frise sur 24 h, priorité visible, réordonnancement, bugs corrigés | À faire |
| 7. Aperçu sans envoi à l'écran | Génération seule d'une image | À faire |

## Défauts relevés par la capture des formulaires

Les captures de `tests/snapshots/plugin_forms/` décrivent l'ancienne interface, défauts compris. Ces défauts restent dans l'ancienne page et sont corrigés dans la nouvelle :

- **Option désactivée sans le vouloir :** dans `rss`, `ai_image`, `image_album` et `image_upload`, une option activée se réaffiche cochée mais garde la valeur `false`. Réenregistrer sans y toucher la désactive.
- **`weather` :** `graphIconStep` n'est pas restauré à la réouverture et revient à `2`.
- **`newspaper` :** `locationSearch` n'est pas restauré à la réouverture.
- **`image_album` :** `updateTitleOptions` est appelée mais n'est définie nulle part.

`src/ui/frontend/src/forms/contract.test.ts` compare chaque description aux captures et à son `settings.html` : un champ ajouté par upstream fait échouer ce test, et un réglage inconnu de la description repart tel quel à l'enregistrement. Les lignes dynamiques et les fichiers sont couverts par `tests/test_ui_plugin_forms.py`.

## À reprendre de la review de la maquette

- **Lot 5 (accueil) :** construire un vrai signal pour « Screen connected », ou le remplacer par un état plus modeste.
- **Lot 7 (aperçu) :** brancher le bouton Update preview sur une vraie génération d'image.
- **Accessibilité et mobile :** tester sur un vrai téléphone et avec un lecteur d'écran.

## Limites connues de la transition

- L'ancienne interface n'a aucun lien vers `/ui/` : y revenir passe par le bouton Retour du navigateur ou l'adresse. Le passage à `/` les supprimera.
- Pendant un rendu, le serveur à un seul thread bloque aussi l'interface, fichiers statiques compris.
- La langue choisie ne concerne que la nouvelle interface : l'ancienne reste en anglais.
- La confirmation avant de quitter les réglages ne couvre pas le bouton Retour du navigateur à l'intérieur de la nouvelle interface. Les formulaires de plugins n'ont pas ce problème : ils gardent un brouillon, sauf pour les fichiers choisis.
- L'ancienne page des playlists ouvre encore l'ancien formulaire d'un plugin ; le lot 6 la remplace.
- Le catalogue `/ui/plugins` reste minimal jusqu'au lot 5.
- Comme dans l'ancienne page, les unités de Weather sont en °F par défaut.
- Une copie d'une entrée Image Upload partage ses fichiers avec l'original : supprimer l'une retire les images de l'autre, et deux images de même nom se remplacent. C'était déjà le cas dans l'ancienne page ; à revoir au lot 6, qui gère la suppression.
- Enregistrer une entrée Image Upload fait repartir sa rotation de la première image, comme dans l'ancienne page.
- Comme dans l'ancienne page, un réglage masqué n'est pas renvoyé : activer la date aléatoire d'APOD oublie la date saisie à l'enregistrement.
- L'avertissement sur une clé d'API ne regarde que `.env`. Il peut s'afficher à tort si la clé vient de l'environnement du service ; il ne bloque jamais l'envoi.
- Après un redémarrage demandé depuis les réglages, le message reste affiché : rien ne vérifie encore le retour de l'appareil.
- Le fichier `.env` est réécrit en entier à chaque changement : ses commentaires sont perdus, comme avec l'ancienne page.
- Une valeur de clé contenant `${NOM}` est interprétée par `python-dotenv` à la relecture.
- L'écriture sûre de `.env` demande le droit d'écrire dans le dossier du projet : sinon, l'enregistrement échoue avec une erreur et l'ancien fichier reste intact.
- Un intervalle qui n'est pas un multiple de 60 s, possible seulement en éditant `device.json` à la main, est arrondi à la minute au prochain enregistrement : `/save_settings` ne connaît que les minutes et les heures.

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
