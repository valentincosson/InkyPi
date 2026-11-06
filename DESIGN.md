# Design d'InkyPi

Référence visuelle de la nouvelle interface. Le code de la maquette se trouve dans `design/prototype/`.

## Principes

- **Sobre, sérieux, moderne, rassurant.** Une interface d'outil, au niveau de finition de Vercel ou Linear.
- **Une seule couleur d'accent.** Le reste est neutre, et la couleur vient du contenu réel de l'écran.
- **Peu de texte, des images.** Le catalogue montre une illustration et un nom. La description reste au survol et sert à la recherche.
- **L'écran est le héros.** Son cadre et son contenu sont l'élément le plus grand de l'accueil.
- **Dire la vérité sur l'état.** Aperçu à jour ou non, envoi en cours, dessin lent de l'écran : rien n'est laissé à deviner. Une panne ne doit jamais ressembler à un écran vide, et une heure ancienne porte sa date.

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

Les couleurs d'état sont réservées à leur rôle : ambre pour un avertissement, rouge pour une erreur ou une action destructive. Une action destructive reste un bouton à contour avec un texte rouge, et demande toujours confirmation.

## Typographie

Geist seule, hébergée localement. Corps en 15 px, contrôles en 14 px, titre de page en 26 px, titre de section en 18 px. Chiffres tabulaires pour les heures.

## Mise en page

- Navigation en haut, fixe à partir de 1024 px, jamais fixe sur mobile pour laisser la place au contenu. Sous 640 px, elle affiche le texte sans les icônes.
- Contenu sur 1132 px au maximum, avec 20 px de marge, en grille de 4 colonnes avec 24 px de gouttière.
- Accueil : l'écran sur trois colonnes, l'état et les actions sur la quatrième, puis ce qui suit. Rien n'affirme que l'écran est branché : aucun signal matériel ne le permet.
- Formulaire : 520 px de réglages à gauche, aperçu et actions fixes à droite.
- Mobile : aperçu en haut et barre d'actions fixe en bas.
- Playlists : la frise de la journée d'abord, une ligne par playlist avec son nom dans la première colonne, puis chaque playlist et ses entrées. Le trait plein indique ce qui passe à l'écran, la trame ce qu'une autre playlist prend, le contour une playlist vide qui bloque l'écran.
- Réglages : titre de section dans la première colonne, champs sur 640 px au maximum dans les suivantes. La barre d'enregistrement ne reste fixe que s'il y a quelque chose à dire ou à enregistrer.

## Illustrations

Dessinées en SVG avec quatre niveaux de gris (`--art-bg`, `--art-1`, `--art-2`, `--art-ink`), un trait de 3 unités sur une base de 200×120 et un fond unique. Ne jamais les obtenir par un filtre sur des dessins en couleur.

## Aperçu

L'aperçu montre l'image propre avant le tramage du pilote, recadrée comme l'écran la recadrera, sans promettre un rendu fidèle des couleurs. Il se met à jour avec le bouton **Update preview**, jamais tout seul, car chaque rendu HTML lance Chromium sur le Pi et certains plugins sont facturés. Il est marqué périmé seulement si ce que le formulaire enverrait diffère de ce qui a produit l'image affichée.

Avant le premier aperçu, le cadre montre l'illustration du plugin, ou la dernière image d'une entrée existante avec sa date. Après **Show on screen**, il montre ce qui vient de partir à l'écran. Une panne laisse l'image précédente en place, marquée périmée si le formulaire a changé depuis. Une image périmée est atténuée, et sur téléphone la barre du bas le signale et propose la mise à jour, car l'aperçu est alors hors de vue.
