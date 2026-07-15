# Form Filling Bot

A TypeScript automation bot that fills a Microsoft Form for many users with Puppeteer.

Target form: *"Aprendamos sobre la diversidad y la inclusión: Perspectiva de género"* (ARL SURA training feedback). The bot handles its full structure:

*   A **gating** first question (`¿Es usted una persona Sorda?`). Answering it reveals the rest of the survey; the fill loop waits for the reveal.
*   Text inputs, a **dropdown** (`Tipo de documento`), Yes/No and consent radios.
*   Numeric scales in three shapes: 1–5 Likert, 1–5 stars, and a 0–10 NPS. All map by the number in each option's `aria-label`.
*   Accent- and case-insensitive matching, so `"Cedula de ciudadania"` in data still selects `"Cédula de ciudadanía"` on the form.

Field-to-question mapping lives in `buildQuestions()` in `src/index.ts`. Questions are matched by a substring of their visible text, so update those strings if the form wording changes.

## Prerequisites

*   Node.js 22
*   pnpm

## Installation

```bash
pnpm install
```

## Configuration

**Environment variables** — create `.env` (see `.env.example`):

```env
FORM_URL='https://forms.office.com/pages/responsepage.aspx?id=...'
HEADLESS=false
DRY_RUN=false
```

*   `FORM_URL`: the Microsoft Form to fill.
*   `HEADLESS`: `true` runs the browser in the background, `false` shows it.
*   `DRY_RUN`: `true` fills every form and saves a `dryrun-<documentNumber>.png` screenshot **without submitting**. Use it to check the fill before sending real responses. Defaults to `false` (submits).

**User database** — `database.json` is an array of people. `comment` is optional; every other field is required by the form:

```json
[
  {
    "isDeaf": "No",
    "fullName": "John Doe",
    "documentType": "Cédula de ciudadanía",
    "documentNumber": "123456789",
    "email": "john@example.com",
    "jobTitle": "Developer",
    "companyNit": "900123456",
    "companyName": "Tech Corp",
    "department": "Antioquia",
    "phoneNumber": "3001234567",
    "ratings": {
      "facilitator": 5,
      "trainingUtility": 5,
      "tools": 5,
      "arlSatisfaction": 5,
      "trainingSatisfaction": 5,
      "difficulty": 5,
      "recommendation": 10
    },
    "comment": "Optional free text"
  }
]
```

Rating ranges: `facilitator`, `trainingUtility`, `tools`, `arlSatisfaction`, `trainingSatisfaction`, `difficulty` are 1–5; `recommendation` (NPS) is 0–10. `documentType` must be one of the form's options, e.g. `Cédula de ciudadanía`, `Tarjeta de identidad`, `Cédula de Extranjería`, `Registro Civil`, `Pasaporte`. `isDeaf` is `"Si"` or `"No"` (`"Si"` submits without the rest of the survey).

## Usage

Dry run first to confirm the fill, then submit for real:

```bash
DRY_RUN=true pnpm start   # fills + screenshots, no submit
pnpm start                # submits one response per person
```

One browser tab is opened per person; progress and any unfilled questions are logged to the console.

## Troubleshooting

*   **Timeouts**: check the network connection; adjust the timeouts in `src/index.ts` if needed.
*   **Unfilled question warning**: the console logs any question left blank and the reason. If the form wording changed, update the match strings in `buildQuestions()`.
*   **Selectors**: on error the bot saves `error-*.png` in the project root. Dry runs save `dryrun-*.png`.
