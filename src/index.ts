import 'dotenv/config';
import puppeteer, { ElementHandle, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Person } from './types';

const DATABASE_PATH = path.join(__dirname, '../database.json');

type QuestionType = 'text' | 'radio' | 'dropdown' | 'scale';

interface Question {
  type: QuestionType;
  text: string;
  value: string | number | undefined;
  optional?: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Accent- and case-insensitive comparison. The form renders "Cédula de
// ciudadanía" while the database may hold "Cedula de ciudadania".
const NORMALIZE = `(s) => (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ').trim()`;

function buildQuestions(person: Person): Question[] {
  return [
    // Gating question: answering it reveals the rest of the survey.
    { type: 'radio', text: 'persona Sorda', value: person.isDeaf },
    { type: 'text', text: 'Nombre y apellidos', value: person.fullName },
    { type: 'dropdown', text: 'Tipo de documento', value: person.documentType },
    { type: 'text', text: 'Numero de documento', value: person.documentNumber },
    { type: 'text', text: 'Correo electronico', value: person.email },
    { type: 'text', text: 'Cargo', value: person.jobTitle },
    { type: 'text', text: 'Nit de la Empresa', value: person.companyNit },
    { type: 'text', text: 'Nombre de la Empresa', value: person.companyName },
    { type: 'text', text: '¿En qué departamento te encuentras actualmente?', value: person.department },
    { type: 'text', text: 'Numero de celular', value: person.phoneNumber },
    { type: 'scale', text: 'capacidad del facilitador', value: person.ratings.facilitator },
    { type: 'scale', text: 'formación te brindó las capacidades', value: person.ratings.trainingUtility },
    { type: 'scale', text: 'herramientas de aprendizaje', value: person.ratings.tools },
    { type: 'scale', text: 'satisfecho te has sentido con ARL SURA', value: person.ratings.arlSatisfaction },
    { type: 'scale', text: 'satisfecho te sentiste con la formación', value: person.ratings.trainingSatisfaction },
    { type: 'scale', text: 'fácil o difícil fue recibir la formación', value: person.ratings.difficulty },
    { type: 'scale', text: 'probable es que recomiendes ARL SURA', value: person.ratings.recommendation },
    { type: 'text', text: 'comentario o sugerencia', value: person.comment, optional: true },
    { type: 'radio', text: 'autorizas a SURA', value: 'Acepto' }
  ];
}

async function main() {
  console.log('Starting Form Bot...');

  if (!fs.existsSync(DATABASE_PATH)) {
    console.error(`Database file not found at ${DATABASE_PATH}`);
    process.exit(1);
  }
  const people: Person[] = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf-8'));
  console.log(`Loaded ${people.length} people from database.`);

  const formUrl = process.env.FORM_URL;
  if (!formUrl) {
    console.error('FORM_URL is not defined in .env file');
    process.exit(1);
  }

  const headless = process.env.HEADLESS === 'true';
  const dryRun = process.env.DRY_RUN === 'true';
  if (dryRun) {
    console.log('DRY_RUN is on: forms will be filled but NOT submitted.');
  }

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    for (const person of people) {
      console.log(`Processing: ${person.fullName}`);
      const page = await browser.newPage();
      try {
        await page.goto(formUrl, { waitUntil: 'networkidle0' });
        await fillForm(page, person);
        await submitForm(page, person, dryRun);
      } catch (err) {
        console.error(`Error processing ${person.fullName}:`, err);
        await page.screenshot({ path: `error-${person.documentNumber}.png` });
      } finally {
        await page.close();
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
    console.log('Bot finished.');
  }
}

async function fillForm(page: Page, person: Person) {
  const findQuestionByText = async (text: string) => {
    const handle = await page.evaluateHandle((searchText) => {
      const all = Array.from(document.querySelectorAll('div[data-automation-id="questionItem"]'));
      return all.find(q => q.textContent?.toLowerCase().includes(searchText.toLowerCase()));
    }, text) as unknown as ElementHandle<Element>;
    return handle.asElement() ? handle : null;
  };

  const isVisible = (el: ElementHandle<Element>) => page.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(node).display !== 'none';
  }, el);

  const answerTextInput = async (item: ElementHandle<Element>, value: string) => {
    let input: ElementHandle<Element> | null = await item.$('input[data-automation-id="textInput"]');
    if (!input) {
      input = await item.$('input[placeholder="Enter your answer"], input[placeholder="Escriba su respuesta"], input[type="text"], textarea');
    }
    if (!input) {
      throw new Error('No text input found');
    }
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await input.type(value);
  };

  // Choice question rendered as radio buttons (e.g. Yes/No, consent).
  const answerRadioInput = async (item: ElementHandle<Element>, value: string) => {
    const option = await item.evaluateHandle((el, val, normSrc) => {
      const norm = eval(normSrc) as (s: string) => string;
      const radios = Array.from(el.querySelectorAll('[role="radio"]'));
      let found = radios.find(r => norm(r.getAttribute('aria-label') || '') === norm(val)) ||
        radios.find(r => norm(r.closest('label')?.textContent || '') === norm(val));
      if (!found) {
        const els = Array.from(el.querySelectorAll('label, span, div'));
        const match = els.find(e => norm(e.textContent || '') === norm(val));
        if (match) found = (match.closest('[role="radio"]') as Element) || match;
      }
      return found || null;
    }, value, NORMALIZE) as unknown as ElementHandle<Element>;

    if (!option.asElement()) {
      throw new Error(`Radio option '${value}' not found`);
    }
    await option.click();
  };

  // Choice question rendered as a dropdown ("Selecciona la respuesta").
  // Options are portaled to <body>, so they are queried at document level.
  const answerDropdownInput = async (item: ElementHandle<Element>, value: string) => {
    const trigger = await item.$('[role="button"], [aria-haspopup="listbox"], [aria-haspopup="true"], button');
    if (!trigger) {
      throw new Error('No dropdown trigger found');
    }
    await trigger.click();
    await sleep(500);

    const option = await page.evaluateHandle((val, normSrc) => {
      const norm = eval(normSrc) as (s: string) => string;
      const opts = Array.from(document.querySelectorAll('[role="option"]'));
      return opts.find(o => norm(o.textContent || '') === norm(val)) ||
        opts.find(o => norm(o.textContent || '').includes(norm(val))) || null;
    }, value, NORMALIZE) as unknown as ElementHandle<Element>;

    if (!option.asElement()) {
      await page.keyboard.press('Escape');
      throw new Error(`Dropdown option '${value}' not found`);
    }
    await option.click();
  };

  // Numeric scales: 1-5 Likert, 1-5 stars, and 0-10 NPS. Each option carries
  // an aria-label whose first token is the number ("4 Star", "3", "10").
  const answerScaleInput = async (item: ElementHandle<Element>, value: number) => {
    const option = await item.evaluateHandle((el, target) => {
      const radios = Array.from(el.querySelectorAll('[role="radio"]'));
      return radios.find(r => {
        const aria = (r.getAttribute('aria-label') || '').trim();
        return aria.split(/\s+/)[0] === String(target);
      }) || null;
    }, value) as unknown as ElementHandle<Element>;

    if (option.asElement()) {
      await option.click();
      return;
    }
    // Fallback: index into the radio list for a plain 1..N scale.
    const radios = await item.$$('[role="radio"]');
    if (value >= 1 && value <= radios.length) {
      await radios[value - 1].click();
    } else {
      throw new Error(`Scale value '${value}' not found`);
    }
  };

  const questions = buildQuestions(person);
  const completed = questions.map(q => q.optional === true && (q.value === undefined || q.value === ''));
  let attemptsRemaining = 15;

  while (completed.includes(false) && attemptsRemaining > 0) {
    attemptsRemaining--;
    let filledAny = false;

    for (let i = 0; i < questions.length; i++) {
      if (completed[i]) continue;
      const q = questions[i];
      const item = await findQuestionByText(q.text);
      if (!item || !(await isVisible(item))) continue;

      try {
        if (q.type === 'text') await answerTextInput(item, String(q.value));
        else if (q.type === 'radio') await answerRadioInput(item, String(q.value));
        else if (q.type === 'dropdown') await answerDropdownInput(item, String(q.value));
        else if (q.type === 'scale') await answerScaleInput(item, Number(q.value));
        completed[i] = true;
        filledAny = true;
      } catch (err) {
        console.error(`Error filling "${q.text}":`, (err as Error).message);
      }
    }

    if (!completed.includes(false)) break;

    // Answering the gating question reveals more fields; let them render.
    if (filledAny) {
      await sleep(1200);
      continue;
    }

    if (await clickIfVisible(page, ['start now', 'iniciar ahora', 'comenzar', 'empezar ahora', 'empezar'])) {
      await sleep(1500);
      continue;
    }
    if (await clickNext(page)) {
      await sleep(1500);
      continue;
    }

    console.warn('Stuck: no visible unanswered questions and no start/next button.');
    break;
  }

  const missing = questions.filter((_, i) => !completed[i]).map(q => q.text);
  if (missing.length > 0) {
    console.warn(`Unfilled questions for ${person.fullName}: ${missing.join(', ')}`);
  }
}

async function clickIfVisible(page: Page, texts: string[]): Promise<boolean> {
  const btn = await page.evaluateHandle((labels) => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"], a'));
    return els.find(el => {
      const text = el.textContent?.trim().toLowerCase() || '';
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
      return visible && labels.some(l => text.includes(l));
    }) || null;
  }, texts) as unknown as ElementHandle<Element>;

  if (!btn.asElement()) return false;
  await btn.click();
  return true;
}

async function clickNext(page: Page): Promise<boolean> {
  const btn = await page.evaluateHandle(() => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"]'));
    return els.find(el => {
      const text = el.textContent?.trim().toLowerCase() || '';
      const id = el.getAttribute('data-automation-id') || '';
      const rect = el.getBoundingClientRect();
      const enabled = !el.hasAttribute('disabled') && !el.classList.contains('disabled');
      const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
      return visible && enabled && (id === 'nextButton' || text === 'next' || text === 'siguiente' || text === 'siguiente página');
    }) || null;
  }) as unknown as ElementHandle<Element>;

  if (!btn.asElement()) return false;
  await btn.click();
  return true;
}

async function submitForm(page: Page, person: Person, dryRun: boolean) {
  if (dryRun) {
    await page.screenshot({ path: `dryrun-${person.documentNumber}.png`, fullPage: true });
    console.log(`DRY_RUN: filled form for ${person.fullName} (screenshot saved, not submitted).`);
    return;
  }

  const submitBtn = await page.evaluateHandle(() => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"]'));
    return els.find(el => {
      const text = el.textContent?.trim().toLowerCase() || '';
      const id = el.getAttribute('data-automation-id') || '';
      const rect = el.getBoundingClientRect();
      const enabled = !el.hasAttribute('disabled') && !el.classList.contains('disabled');
      const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
      return visible && enabled && (id === 'submitButton' || text === 'submit' || text === 'enviar');
    }) || null;
  }) as unknown as ElementHandle<Element>;

  if (!submitBtn.asElement()) {
    console.error('Submit button not found or not enabled.');
    await page.screenshot({ path: `error-nosubmit-${person.documentNumber}.png` });
    return;
  }

  const currentUrl = page.url();
  await submitBtn.click();

  try {
    await page.waitForFunction((initialUrl) => {
      return document.querySelector('div[data-automation-id="thankYouMessage"]') ||
        document.querySelector('.form-submit-error') ||
        window.location.href !== initialUrl;
    }, { timeout: 20000 }, currentUrl);

    const success = await page.$('div[data-automation-id="thankYouMessage"]');
    const error = await page.$('.form-submit-error');

    if (page.url() !== currentUrl || success) {
      console.log(`Successfully submitted for ${person.fullName}`);
    } else if (error) {
      console.error(`Submission error for ${person.fullName}`);
      await page.screenshot({ path: `error-submit-${person.documentNumber}.png` });
    } else {
      console.warn(`Timeout waiting for confirmation for ${person.fullName}`);
      await page.screenshot({ path: `error-timeout-${person.documentNumber}.png` });
    }
  } catch (e) {
    console.warn(`Timeout waiting for post-submit state for ${person.fullName}:`, (e as Error).message);
    await page.screenshot({ path: `error-wait-${person.documentNumber}.png` });
  }
}

main();
