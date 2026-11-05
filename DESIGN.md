# Design d'InkyPi

Référence visuelle de la nouvelle interface. Le code de la maquette se trouve dans `design/prototype/`.

## Principes

- **Sobre, sérieux, moderne, rassurant.** Une interface d'outil, au niveau de finition de Vercel ou Linear.
- **Une seule couleur d'accent.** Le reste est neutre, et la couleur vient du contenu réel de l'écran.
- **Peu de texte, des images.** Le catalogue montre une illustration et un nom. La description reste au survol et sert à la recherche.
- **L'écran est le héros.** Son cadre et son contenu sont l'élément le plus grand de l'accueil.
- **Dire la vérité sur l'état.** Aperçu à jour ou non, envoi en cours, dessin lent de l'écran : rien n'est laissé à deviner.

## Thèmes

Clair ou sombre selon le système, avec une bascule. Le choix est conservé sous la clé existante `inkypi-theme`.

| Rôle | Clair | Sombre |
|---|---|---|
| Fond | `#fafafa` | `#111318` |
| Surface | `#ffffff` | `#191c23` |
| Texte | `#18181b` | `#eceef2` |
| Texte secondaire | `#5f5f68` | `#a4aab6` |
| Action principale | `#18181b` | `#a9b8ff` |
| Filet | `#e4e4e7` | `#2a2e39` |
| Bordure de contrôle | `#d4d4d9` | `#3a3f4c` |
| Bordure de champ | `#8e8e98` | `#7c8494` |
| Focus | `#3f5bd9` | `#a9b8ff` |

Les couleurs d'état sont réservées à leur rôle : vert pour la connexion, ambre pour un aperçu périmé, rouge pour une erreur.

## Typographie

Geist seule, hébergée localement. Corps en 15 px, contrôles en 14 px, titre de page en 26 px, titre de section en 18 px. Chiffres tabulaires pour les heures.

## Mise en page

- Navigation en haut, fixe à partir de 1024 px, jamais fixe sur mobile pour laisser la place au contenu.
- Contenu sur 1132 px au maximum, grille de 4 colonnes avec 24 px de gouttière.
- Formulaire : 520 px de réglages à gauche, aperçu et actions fixes à droite.
- Mobile : aperçu en haut et barre d'actions fixe en bas.

## Illustrations

Dessinées en SVG avec quatre niveaux de gris (`--art-bg`, `--art-1`, `--art-2`, `--art-ink`), un trait de 3 unités sur une base de 200×120 et un fond unique. Ne jamais les obtenir par un filtre sur des dessins en couleur.

## Aperçu

L'aperçu montre l'image propre qu'InkyPi enregistre avant le tramage du pilote, sans promettre un rendu fidèle. Il se met à jour avec le bouton **Update preview**, car chaque rendu HTML lance Chromium sur le Pi. Il est marqué périmé seulement si une valeur diffère de celles de l'aperçu affiché.
