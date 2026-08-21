# Form Filling Bot

A TypeScript bot that fills Microsoft Forms for many people with Puppeteer. Built for ARL SURA training feedback forms, which change wording and structure every course.

## How it works

The bot does **not** hunt for a fixed list of questions. On each page it walks whatever questions the form renders, looks each one up in a catalog, and answers it. Two consequences:

*   The same bot fills several different forms. Point `FORM_URL` at one and run.
*   A form the bot has never seen still works, as long as its questions are already in the catalog. Anything unrecognised is logged by name so you know exactly what to add.

Everything form-specific lives in `src/questions.ts`:

| File | Job |
| --- | --- |
| `src/questions.ts` | The catalog: which question titles map to which field, and how to answer each. **This is the file you edit when a form changes.** |
| `src/form.ts` | Puppeteer mechanics: reading the rendered questions, clicking options, paging. Form-agnostic. |
| `src/index.ts` | Loads the database, drives the browser, submits, reports. |
| `src/questions.test.ts` | Asserts every known question title resolves to the field it should. |
| `src/e2e.test.ts` | Drives the bot against the local mocks and asserts what each form received. |
| `mocks/` | Local doubles of both forms. Same DOM shape as the real thing, nothing leaves the machine. |

Forms currently covered:

*   **Salud mental y la multitarea: cómo nos afecta en el entorno laboral** — verified live on 2026-08-18. 13 questions; `Eres la persona que debemos contactar` = `No` opens a second page asking for the contact person.
*   **Modulo 4 El poder del ejemplo en la vida laboral y personal** — verified live on 2026-08-21. 19 questions on a single page. Same field set as the retired form with different wording; needed no catalog changes.
*   **Aprendamos sobre la diversidad y la inclusión: Perspectiva de género** — retired. Its titles come from the old `mock_form.html`, **not verified against the live form**. If it comes back, dump its real structure before trusting the mapping.

## Prerequisites

*   Node.js 22
*   pnpm

```bash
pnpm install
```

## Configuration

**Environment variables** — create `.env` (see `.env.example`):

```env
FORM_URL='https://forms.cloud.microsoft/pages/responsepage.aspx?id=...'
HEADLESS=false
DRY_RUN=true
DELAY_MS=2000
```

*   `FORM_URL`: the form to fill. A URL passed as a CLI argument wins over this.
*   `HEADLESS`: `true` runs the browser in the background, `false` shows it.
*   `DRY_RUN`: `true` fills every form and saves a `dryrun-<documentNumber>.png` screenshot **without submitting**. Anything other than `true` submits for real.
*   `DELAY_MS`: pause between people, in milliseconds. Defaults to `2000`.

**User database** — `database.json` is an array of people. One database serves every form: each form takes the fields it asks for and ignores the rest.

```json
[
  {
    "fullName": "John Doe",
    "documentNumber": "123456789",
    "email": "john@example.com",
    "companyName": "Tech Corp",
    "ratings": {
      "infoQuality": 5,
      "metExpectations": 5,
      "facilitatorClarity": 5,
      "practicalKnowledge": 5,
      "recommendation": 10
    },
    "comment": "Optional free text"
  }
]
```

| Rating | Asked as | Range |
| --- | --- | --- |
| `infoQuality` | Calidad de la información / de las herramientas de aprendizaje | 1–5 |
| `metExpectations` | El contenido cumplió con tus expectativas / te brindó las capacidades | 1–5 |
| `facilitatorClarity` | El facilitador fue claro y conciso / capacidad del facilitador | 1–5 |
| `practicalKnowledge` | Conocimientos prácticos y útiles / satisfacción con la formación | 1–5 |
| `recommendation` | NPS: qué tan probable es que recomiendes | 0–10 |
| `arlSatisfaction` | Qué tan satisfecho te has sentido con ARL SURA | 1–5, only in the old form |
| `difficulty` | Qué tan fácil o difícil fue recibir la formación | 1–5, only in the old form |

Optional per person:

*   `comment` — free text.
*   `dataConsent` — `"Si"` (default) or `"No"`. `"Acepto"` is matched automatically where the form uses that label.
*   `cybersecurityServices` — array of exact option labels. Defaults to `["La empresa no requiere ninguno de los servicios anteriores."]`.
*   `isContactPerson` — `"Si"` (default) or `"No"`. `"No"` requires `contact`.
*   `contact` — `{ fullName, role, email, phone }` for the second page.
*   `documentType`, `jobTitle`, `companyNit`, `department`, `phoneNumber`, `isDeaf` — only asked by the old form.

A field a form asks for but the person lacks is reported as `no value for <field>`; it is never invented.

## Usage

```bash
pnpm test                  # checks the catalog resolves every known title
pnpm test:e2e              # fills and submits both local mocks, asserts what they received
pnpm mock:nuevo            # runs the bot against the local copy of the current form
pnpm mock:viejo            # same against the local copy of the retired one
pnpm mock:modulo4          # same against the local copy of Modulo 4
DRY_RUN=true pnpm start    # fills + screenshots the real form, no submit
DRY_RUN=false pnpm start   # submits one response per person
pnpm start '<other-url>'   # same run against a different form
```

Both `pnpm test` and `pnpm test:e2e` run offline. Use them before touching the real form: a bad run there burns real responses.

One tab per person. The end of the run prints every problem found, grouped by person.

## When SURA changes the form

1.  Run it once with `DRY_RUN=true`. The log names every question it did not recognise:

    ```
    Unknown question: "¿Recomendarías esta capacitación?" — add it to CATALOG in src/questions.ts
    ```

2.  Add the title to the matching entry in `src/questions.ts`, or add a new entry. Use `titles` for a full title and `contains` only for wordings long enough to be unambiguous — `"Empresa"` as a substring also matches the cybersecurity question.
3.  Add the title to `src/questions.test.ts` and run `pnpm test`.
4.  Add the question to the matching file in `mocks/` and run `pnpm test:e2e`, so the change is covered end to end before it touches SURA.

To dump a form's real structure, open it and run this in the browser console:

```js
Array.from(document.querySelectorAll('div[data-automation-id="questionItem"]')).map(q => {
  const h = q.querySelector('[data-automation-id="questionTitle"] [role="heading"]')
  const o = h.querySelector('[data-automation-id="questionOrdinal"]')
  const title = h.textContent.replace(o ? o.textContent : '', '').trim()
  const radios = [...q.querySelectorAll('[role="radio"]')].map(r => r.getAttribute('aria-label') || r.closest('label')?.textContent.trim())
  const checks = [...q.querySelectorAll('[role="checkbox"]')].map(c => c.closest('label')?.textContent.trim())
  const text = q.querySelector('[data-automation-id="textInput"]')
  return `${title} :: ${text ? 'TEXT' : radios.length ? 'RADIO[' + radios.join(' | ') + ']' : 'CHECK[' + checks.join(' | ') + ']'}`
}).join('\n')
```

## Troubleshooting

*   **`Submit button not found`**: the bot never reached the last page. The log lists the buttons it did see — `Siguiente` means a required question is still blank.
*   **`Form is blocking the next page: ...`**: Microsoft Forms itself names the questions it is waiting on.
*   **`Unknown question`**: the form asks something the catalog does not cover. See above.
*   **Screenshots**: errors save `error-*.png` in the project root, dry runs save `dryrun-*.png`.

## Known gotchas

*   Scales come in two flavours: plain 1-5 with `aria-label="3"` and stars with `aria-label="3 CheckMark"`. Matching on the first token of the label covers both.
*   The same question can be div-based options in one form and native `<input type="radio">` in another, and a choice question can be a dropdown in one form and radios in another. The answer helpers cover both; a `dropdown` entry falls back to radios when the question has no trigger.
*   A question title can have a URL glued to its end (the consent question of Modulo 4). That is why long titles are matched with `contains`, not exactly.
*   The NPS question is not a scale like the others: its options are 1px-wide native `<input type="radio">` hidden under their `<label>`. They are clicked through the label, and their state is `.checked`, not `aria-checked`.
*   A form re-renders when it is answered, which orphans element handles read before the click. The bot detects the stale handle, re-reads the page and retries; every answer helper is idempotent so retrying cannot double-fill.
*   `mocks/renderer.js` rebuilds the whole DOM on every choice click — harsher than the real React form, on purpose.
*   `mock_form.html` in the project root is superseded by `mocks/perspectiva-genero.html` and can be deleted.
