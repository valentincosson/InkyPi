# Notice

Ce projet est une version modifiée d'[InkyPi](https://github.com/fatihak/InkyPi), créé par fatihak, et distribué sous la licence GPL-3.0 (voir [LICENSE](./LICENSE)).

## Modifications par rapport au projet d'origine

Ce fork refond l'interface web, à partir de novembre 2026.

| Élément | Modification | Date |
|---|---|---|
| `src/ui/` | Nouvelle interface web, servie sur `/ui/` | Novembre 2026 |
| `src/inkypi.py` | Enregistrement de la nouvelle interface, configuration de développement | Novembre 2026 |
| `src/config.py` | Écriture atomique de la configuration | Novembre 2026 |
| `tests/`, `scripts/dev.sh`, `pytest.ini`, `.gitignore`, `install/requirements-test.txt`, `docs/development.md`, `docs/attribution.md` | Tests, environnement de développement, attributions | Novembre 2026 |
| `README.md`, `NOTICE.md`, `roadmap.md`, `DESIGN.md`, `CLAUDE.md`, `design/` | Documents et maquette de la refonte | Novembre 2026 |

L'historique git donne le détail de chaque changement.

## Composants tiers

La nouvelle interface utilise des composants sous licences MIT, Apache-2.0, ISC, Unlicense et OFL : voir la section dédiée de [docs/attribution.md](./docs/attribution.md) et le fichier [THIRD_PARTY_LICENSES.txt](./src/ui/static/bundle/THIRD_PARTY_LICENSES.txt).
