# Notice

Ce projet est une version modifiée d'[InkyPi](https://github.com/fatihak/InkyPi), créé par fatihak, et distribué sous la licence GPL-3.0 (voir [LICENSE](./LICENSE)).

## Modifications par rapport au projet d'origine

Ce fork refond l'interface web, à partir de novembre 2026.

| Élément | Modification | Date |
|---|---|---|
| `src/ui/` | Nouvelle interface web, servie sur `/ui/` | Novembre 2026 |
| `src/inkypi.py` | Enregistrement de la nouvelle interface, configuration de développement | Novembre 2026 |
| `src/config.py` | Écriture atomique de la configuration | Novembre 2026 |
| `src/blueprints/playlist.py`, `src/blueprints/plugin.py` | Les images ajoutées rejoignent les images existantes à la copie d'une entrée et à l'affichage immédiat | Novembre 2026 |
| `src/blueprints/plugin.py` | La suppression d'une entrée garde les fichiers qu'une autre entrée utilise encore | Novembre 2026 |
| `src/utils/app_utils.py` | Dossier d'enregistrement facultatif pour les fichiers reçus, utilisé par l'aperçu de la nouvelle interface | Novembre 2026 |
| `src/blueprints/main.py` | La page d'accueil `/` mène à la nouvelle interface | Novembre 2026 |
| `src/utils/image_utils.py` | Densité de pixels facultative pour les rendus HTML, utilisée par l'aperçu de la nouvelle interface | Novembre 2026 |
| `src/blueprints/apikeys.py` | Écriture sûre du fichier `.env`, valeurs relues à l'identique, clé supprimée retirée de l'environnement | Novembre 2026 |
| `tests/`, `scripts/dev.sh`, `pytest.ini`, `.gitignore`, `install/requirements-test.txt`, `docs/development.md`, `docs/attribution.md` | Tests, environnement de développement, attributions | Novembre 2026 |
| `README.md`, `NOTICE.md`, `roadmap.md`, `DESIGN.md`, `CLAUDE.md` | Documents de la refonte | Novembre 2026 |

L'historique git donne le détail de chaque changement.

## Composants tiers

La nouvelle interface utilise des composants sous licences MIT, Apache-2.0, ISC, Unlicense et OFL : voir la section dédiée de [docs/attribution.md](./docs/attribution.md) et le fichier [THIRD_PARTY_LICENSES.txt](./src/ui/static/bundle/THIRD_PARTY_LICENSES.txt).
