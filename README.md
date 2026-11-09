# Lumen — lire et comprendre ses documents

Lumen lit vos documents à voix haute et vous aide à les comprendre.

- **Lecture à voix haute** : PDF, Word (.docx), texte, Markdown, HTML, et même **photos de pages** ou **PDF scannés** (lus par l'IA).
  - La phrase lue est surlignée et le texte défile tout seul. Cliquez sur une phrase pour reprendre la lecture à cet endroit.
  - Vitesse réglable, reprise là où vous vous êtes arrêté, contrôles casque et écran verrouillé.
  - **Voix** : par défaut, la meilleure voix de votre appareil est choisie automatiquement (dans Microsoft Edge, les voix « Natural » sont excellentes et gratuites). Pour une voix vraiment naturelle, ajoutez une clé **ElevenLabs** ou **OpenAI**.
- **Comprendre**, un peu comme NotebookLM :
  - **Discussion** avec vos sources : les réponses citent les passages exacts ; cliquez sur une citation pour la retrouver dans le texte.
  - **Vue d'ensemble** automatique et questions suggérées.
  - Sélectionnez un passage dans le texte → **« Expliquer ce passage »**.
  - **Studio** : résumé, points clés, explication simple, guide d'étude, **quiz** interactif, **fiches** de révision, **carte mentale**, FAQ, glossaire, chronologie.
  - **Podcast audio** : deux voix (Léa et Hugo) discutent de vos documents pour vous les expliquer. Téléchargeable en MP3 avec une voix premium.
  - Tout ce que vous générez est rangé dans **Notes**.
- Fonctionne sur ordinateur et sur téléphone.

## Installation

Il faut [Node.js](https://nodejs.org) 20.12 ou plus récent.

```bash
npm install
cp .env.example .env   # puis ouvrez .env et collez votre clé ANTHROPIC_API_KEY
npm start
```

Ouvrez ensuite http://localhost:3000.

Sans clé `ANTHROPIC_API_KEY`, la lecture à voix haute fonctionne quand même ; seules la discussion, le studio et la lecture des photos sont désactivés.

## Configuration (`.env`)

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | Active l'IA (Claude) : discussion, studio, podcast, lecture des images et PDF scannés. |
| `CLAUDE_MODEL` | Modèle Claude (défaut `claude-opus-5-5`). |
| `CLAUDE_FALLBACKS` | `off` pour désactiver le repli automatique vers un autre modèle si une demande est refusée par les filtres de sécurité. |
| `ELEVENLABS_API_KEY` | Voix premium ElevenLabs (`ELEVENLABS_MODEL`, défaut `eleven_multilingual_v2`). |
| `OPENAI_API_KEY` | Voix premium OpenAI (`OPENAI_TTS_MODEL`, défaut `gpt-4o-mini-tts`). |
| `PORT` | Port du serveur (défaut 3000). |
| `DATA_DIR` | Dossier où sont stockés documents et notes (défaut `./data`). |

Les documents et les notes sont enregistrés localement dans `data/` (fichiers JSON).

## Organisation du code

```
server/index.js    API HTTP (documents, notes, discussion, studio, voix)
server/extract.js  extraction du texte (PDF, Word, HTML, texte, OCR par l'IA)
server/ai.js       appels à Claude : discussion avec citations, studio, OCR
server/tts.js      voix premium ElevenLabs / OpenAI
public/            interface (HTML/CSS/JS sans étape de build)
  narrator.js      moteur de lecture à voix haute (voix navigateur + premium)
  app.js           interface : sources, lecteur, discussion, studio, notes
```

## Raccourcis

- `Espace` : lecture / pause
- `←` / `→` : phrase précédente / suivante
- `Ctrl+V` : coller une image ou un fichier pour l'ajouter
