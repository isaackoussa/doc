# Lumen — lire et comprendre ses documents

Lumen lit vos documents à voix haute et vous aide à les comprendre.

- **Lecture à voix haute** : PDF, Word (.docx), texte, Markdown, HTML, et même **photos de pages** ou **PDF scannés** (lus par l'IA).
  - La phrase lue est surlignée et le texte défile tout seul. Cliquez sur une phrase pour reprendre la lecture à cet endroit.
  - Vitesse réglable, reprise là où vous vous êtes arrêté, contrôles casque et écran verrouillé.
  - **Voix naturelles gratuites (Piper)** : calculées directement dans le navigateur, sans compte ni clé. Chaque voix est téléchargée une seule fois (30 à 75 Mo) puis fonctionne hors ligne. Voix françaises : Siwis, Tom, UPMC, MLS, Gilles ; aussi anglais, espagnol, allemand, italien.
  - Les voix du navigateur restent disponibles (dans Microsoft Edge, les voix « Natural » sont excellentes). Voix payantes ElevenLabs / OpenAI possibles en option.
- **Comprendre**, un peu comme NotebookLM :
  - **Discussion** avec vos sources : les réponses citent les passages exacts ; cliquez sur une citation pour la retrouver dans le texte.
  - **Vue d'ensemble** automatique et questions suggérées.
  - Sélectionnez un passage dans le texte → **« Expliquer ce passage »**.
  - **Studio** : résumé, points clés, explication simple, guide d'étude, **quiz** interactif, **fiches** de révision, **carte mentale**, FAQ, glossaire, chronologie.
  - **Podcast audio** : deux voix (Léa et Hugo) discutent de vos documents pour vous les expliquer. Téléchargeable (WAV) avec les voix Piper.
  - Tout ce que vous générez est rangé dans **Notes**.
- Fonctionne sur ordinateur et sur téléphone.

## 100 % gratuit

- **IA : Google Gemini**, offre gratuite (clé sur aistudio.google.com). Elle a des limites de requêtes par minute et par jour, largement suffisantes pour un usage personnel ; si la limite est atteinte, l'app vous demande de patienter un peu. ⚠️ Avec l'offre gratuite, Google peut utiliser les contenus envoyés pour améliorer ses produits : évitez les documents confidentiels.
- **Voix : Piper**, calculée sur votre appareil, gratuite et sans limite.
- **Hébergement : Netlify**, offre gratuite (fonctions, stockage et comptes inclus, dans les limites du plan gratuit).
- Claude (Anthropic) reste disponible en option si vous voulez passer à une IA payante plus tard.

## Comptes et historique

Chaque personne se connecte avec **son e-mail et un mot de passe** (Netlify Identity) : confirmation par e-mail et « mot de passe oublié » inclus. Les documents, les notes, l'historique des discussions, les sources cochées et la position de lecture de chaque document sont enregistrés dans son compte (Netlify Blobs) et la suivent sur tous ses appareils. Un compte ne voit jamais les données d'un autre.

## Mettre en ligne sur Netlify

1. Sur [app.netlify.com](https://app.netlify.com) : **Add new project → Import an existing project → GitHub**, puis choisissez le dépôt `isaackoussa/doc` et la branche `main`. Les réglages de build sont lus dans `netlify.toml` (rien à changer).
2. **Clé IA gratuite** : sur [aistudio.google.com](https://aistudio.google.com), connectez-vous avec un compte Google et cliquez **Get API key → Create API key** (gratuit, sans carte bancaire). Dans Netlify (*Project configuration → Environment variables*), ajoutez `GEMINI_API_KEY` avec cette clé, puis redéployez (*Deploys → Trigger deploy*).
3. **Activer la connexion par e-mail** : *Project configuration → Identity → Enable Identity*.
   - *Registration* : **Open** pour que tout le monde puisse créer un compte, ou **Invite only** pour un usage privé (vous invitez les adresses dans l'onglet *Users*).
   - Les e-mails de confirmation et de réinitialisation du mot de passe sont envoyés automatiquement.
4. Ouvrez l'adresse du site, créez votre compte, confirmez votre e-mail : c'est prêt.

## Développement local

Il faut [Node.js](https://nodejs.org) 20 ou plus et le [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`).

```bash
npm install
cp .env.example .env     # mettez votre clé et LUMEN_DEV_USER=votre@email
npm run dev              # http://localhost:8888
```

Netlify Identity ne fonctionne pas en local : `LUMEN_DEV_USER` simule un utilisateur connecté (uniquement sous `netlify dev`).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | **IA gratuite** (Google Gemini) : discussion, studio, podcast, lecture des images et PDF scannés. |
| `GEMINI_MODEL` | Modèle Gemini (défaut `gemini-flash-latest`). |
| `ANTHROPIC_API_KEY` | Optionnel, payant : Claude (Anthropic). Utilisé si `AI_PROVIDER=claude` ou s'il n'y a pas de clé Gemini. |
| `AI_PROVIDER` | `gemini` ou `claude` pour forcer le fournisseur. |
| `CLAUDE_MODEL` | Modèle Claude (défaut `claude-opus-5-5`). |
| `CLAUDE_FALLBACKS` | `off` pour désactiver le repli automatique vers un autre modèle si une demande est refusée par les filtres de sécurité. |
| `ELEVENLABS_API_KEY` | Optionnel, payant : voix ElevenLabs (`ELEVENLABS_MODEL`, défaut `eleven_multilingual_v2`). |
| `OPENAI_API_KEY` | Optionnel, payant : voix OpenAI (`OPENAI_TTS_MODEL`, défaut `gpt-4o-mini-tts`). |
| `LUMEN_DEV_USER` | Développement local uniquement : utilisateur simulé. |

## Organisation du code

```
netlify.toml              configuration Netlify (build, fonctions)
netlify/functions/        API (fonctions serverless)
  docs, notes, state      documents, notes et historique de l'utilisateur
  chat                    discussion avec citations (réponse en direct)
  jobs, jobs-run          tâches longues : studio, podcast, lecture d'images (arrière-plan)
  tts, config             voix premium, configuration
netlify/lib/              IA (Gemini par défaut, Claude en option), voix, stockage, authentification
public/                   interface (HTML/CSS/JS)
  extract.js              extraction du texte dans le navigateur (PDF, Word, HTML…)
  narrator.js             moteur de lecture à voix haute (Piper, navigateur, voix serveur)
  app.js                  interface : compte, sources, lecteur, discussion, studio, notes
scripts/build.mjs         copie les bibliothèques dans public/vendor
```

## Raccourcis

- `Espace` : lecture / pause
- `←` / `→` : phrase précédente / suivante
- `Ctrl+V` : coller une image ou un fichier pour l'ajouter
