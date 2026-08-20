import { ElementHandle, Page } from 'puppeteer';
import { Person } from './types';
import { AnswerType, CatalogEntry, optionCandidates, resolveEntry } from './questions';

const QUESTION_SELECTOR = 'div[data-automation-id="questionItem"]';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

// Answering a question makes the form re-render, which orphans the handles read
// before it. Retrying is safe: every answer helper is idempotent.
const isStaleHandle = (err: Error): boolean =>
  /detached|not clickable|no longer|Node is either/i.test(err.message);

export interface FillReport {
  answered: string[];
  missingValue: string[];
  unknown: string[];
  failed: string[];
}

interface RenderedQuestion {
  handle: ElementHandle<Element>;
  title: string;
}

// The title of a question is its heading minus the "1." ordinal prefix.
async function readQuestions(page: Page): Promise<RenderedQuestion[]> {
  const handles = await page.$$(QUESTION_SELECTOR);
  const questions: RenderedQuestion[] = [];

  for (const handle of handles) {
    const title = await handle.evaluate((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return '';
      const heading = item.querySelector('[data-automation-id="questionTitle"] [role="heading"]');
      if (!heading) return '';
      const ordinal = heading.querySelector('[data-automation-id="questionOrdinal"]');
      return (heading.textContent ?? '').replace(ordinal?.textContent ?? '', '').trim();
    });
    if (title !== '') questions.push({ handle, title });
  }

  return questions;
}

// NPS options are 1px-wide native radios hidden under their label, so they are
// clicked through the label. Div-based options are clicked directly.
async function clickOption(option: ElementHandle<Element>): Promise<void> {
  const target = await option.evaluateHandle((node) => {
    if (node.tagName !== 'INPUT' || !node.id) return node;
    return document.querySelector(`label[for="${CSS.escape(node.id)}"]`) ?? node;
  }) as unknown as ElementHandle<Element>;
  await target.click();
}

async function findOption(
  item: ElementHandle<Element>,
  role: 'radio' | 'checkbox',
  values: string[]
): Promise<ElementHandle<Element> | null> {
  const option = await item.evaluateHandle((el, wantedRole, wanted) => {
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const options = Array.from(el.querySelectorAll(`[role="${wantedRole}"]`));
    const labelOf = (o: Element) => norm(o.getAttribute('aria-label') ?? o.closest('label')?.textContent ?? '');
    for (const candidate of wanted) {
      const target = norm(candidate);
      const hit = options.find(o => labelOf(o) === target) ?? options.find(o => labelOf(o).startsWith(target));
      if (hit) return hit;
    }
    return null;
  }, role, values) as unknown as ElementHandle<Element>;

  return option.asElement() !== null ? option : null;
}

async function answerText(page: Page, item: ElementHandle<Element>, value: string): Promise<void> {
  const input = await item.$('input[data-automation-id="textInput"], textarea[data-automation-id="textInput"], input[type="text"], textarea');
  if (!input) throw new Error('no text input found');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(value);
}

async function answerRadio(item: ElementHandle<Element>, value: string): Promise<void> {
  const option = await findOption(item, 'radio', optionCandidates(value));
  if (!option) throw new Error(`option '${value}' not found`);
  await clickOption(option);
}

async function answerCheckbox(page: Page, item: ElementHandle<Element>, values: string[]): Promise<void> {
  for (const value of values) {
    const option = await findOption(item, 'checkbox', [value]);
    if (!option) throw new Error(`option '${value}' not found`);
    const alreadyChecked = await page.evaluate(
      el => el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true,
      option
    );
    if (!alreadyChecked) await clickOption(option);
  }
}

// Some forms render the same choice question as a dropdown whose options are
// portaled to <body>; others render it as plain radios.
async function answerDropdown(page: Page, item: ElementHandle<Element>, value: string): Promise<void> {
  const trigger = await item.$('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], [role="button"], button');
  if (!trigger) {
    await answerRadio(item, value);
    return;
  }

  await trigger.click();
  await sleep(500);

  const option = await page.evaluateHandle((wanted) => {
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const target = norm(wanted);
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    return options.find(o => norm(o.textContent ?? '') === target) ??
      options.find(o => norm(o.textContent ?? '').includes(target)) ??
      null;
  }, value) as unknown as ElementHandle<Element>;

  if (option.asElement() === null) {
    await page.keyboard.press('Escape');
    throw new Error(`dropdown option '${value}' not found`);
  }
  await option.click();
}

async function answer(page: Page, item: ElementHandle<Element>, type: AnswerType, value: unknown): Promise<void> {
  if (type === 'text') await answerText(page, item, String(value));
  else if (type === 'radio') await answerRadio(item, String(value));
  else if (type === 'checkbox') await answerCheckbox(page, item, value as string[]);
  else if (type === 'dropdown') await answerDropdown(page, item, String(value));
  else await answerScale(item, Number(value));
}

// Scale options carry an aria-label whose first token is the number:
// "1 Muy Mala", "5 Totalmente De acuerdo", "0".."10" for the NPS.
async function answerScale(item: ElementHandle<Element>, value: number): Promise<void> {
  const option = await item.evaluateHandle((el, target) => {
    const radios = Array.from(el.querySelectorAll('[role="radio"]'));
    return radios.find(r => (r.getAttribute('aria-label') ?? '').trim().split(/\s+/)[0] === String(target)) ?? null;
  }, value) as unknown as ElementHandle<Element>;

  if (option.asElement() !== null) {
    await clickOption(option);
    return;
  }

  const radios = await item.$$('[role="radio"]');
  if (value >= 1 && value <= radios.length) {
    await clickOption(radios[value - 1]);
    return;
  }
  throw new Error(`scale value '${value}' not found`);
}

async function clickByText(page: Page, texts: string[], automationIds: string[], loose = false): Promise<boolean> {
  const btn = await page.evaluateHandle((labels, ids, allowPrefix) => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"], a'));
    return els.find(el => {
      const text = el.textContent?.trim().toLowerCase() ?? '';
      const id = el.getAttribute('data-automation-id') ?? '';
      const rect = el.getBoundingClientRect();
      const enabled = !el.hasAttribute('disabled') && !el.classList.contains('disabled');
      const visible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
      const matchesText = labels.some(l => text === l || (allowPrefix && text.startsWith(l)));
      return visible && enabled && (ids.includes(id) || matchesText);
    }) ?? null;
  }, texts, automationIds, loose) as unknown as ElementHandle<Element>;

  if (btn.asElement() === null) return false;
  await btn.click();
  return true;
}

const clickStart = (page: Page) =>
  clickByText(page, ['start now', 'iniciar ahora', 'comenzar', 'empezar'], [], true);

export const clickNext = (page: Page) =>
  clickByText(page, ['next', 'siguiente'], ['nextButton']);

export const clickSubmit = (page: Page) =>
  clickByText(page, ['submit', 'enviar'], ['submitButton']);

async function readBlockingAlert(page: Page): Promise<string> {
  return page.evaluate(() => Array.from(document.querySelectorAll('[role="alert"]'))
    .map(el => el.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' | '));
}

// Walks whatever questions the form renders and answers each one from the
// catalog, instead of hunting for a fixed list. That is what lets one bot fill
// several SURA forms without knowing in advance which one it landed on.
export async function fillForm(page: Page, person: Person): Promise<FillReport> {
  const report: FillReport = { answered: [], missingValue: [], unknown: [], failed: [] };
  const handled = new Set<string>();
  const answeredEntries = new Set<string>();
  // Incremented on every page transition, so the same title on a later page is
  // treated as a new question rather than one already handled.
  let step = 0;
  let attemptsRemaining = 25;

  while (attemptsRemaining > 0) {
    attemptsRemaining--;
    const questions = await readQuestions(page);
    let answeredAny = false;
    let staleHandles = false;

    for (const question of questions) {
      const key = `${step}::${question.title}`;
      if (handled.has(key)) continue;

      const entry: CatalogEntry | null = resolveEntry(question.title, answeredEntries);
      if (!entry) {
        handled.add(key);
        report.unknown.push(question.title);
        console.warn(`Unknown question: "${question.title}" — add it to CATALOG in src/questions.ts`);
        continue;
      }

      const value = entry.value(person);
      if (isEmpty(value)) {
        handled.add(key);
        if (entry.optional !== true) {
          report.missingValue.push(entry.id);
          console.warn(`No value for "${question.title}" (field: ${entry.id})`);
        }
        continue;
      }

      try {
        await answer(page, question.handle, entry.type, value);
        handled.add(key);
        answeredEntries.add(entry.id);
        report.answered.push(entry.id);
        answeredAny = true;
      } catch (err) {
        if (isStaleHandle(err as Error)) {
          staleHandles = true;
          break;
        }
        handled.add(key);
        report.failed.push(`${entry.id}: ${(err as Error).message}`);
        console.error(`Error filling "${question.title}": ${(err as Error).message}`);
      }
    }

    // Re-read the page immediately: nothing new rendered, the handles just aged.
    if (staleHandles) continue;

    // A gating question can reveal more questions on the same page.
    if (answeredAny) {
      await sleep(1000);
      continue;
    }

    if (await clickStart(page)) {
      step++;
      await sleep(1500);
      continue;
    }

    if (await clickNext(page)) {
      await sleep(1500);
      const titlesBefore = questions.map(q => q.title).join('|');
      const titlesAfter = (await readQuestions(page)).map(q => q.title).join('|');
      step++;
      if (titlesAfter === titlesBefore) {
        const alert = await readBlockingAlert(page);
        report.failed.push(alert !== '' ? `blocked: ${alert}` : 'blocked on the same page');
        console.warn(`Form is blocking the next page: ${alert !== '' ? alert : 'no reason given'}`);
        break;
      }
      continue;
    }

    break;
  }

  return report;
}

export async function visibleButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('button, div[role="button"]'))
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(el => el.textContent?.trim().slice(0, 30) ?? '')
    .filter(Boolean));
}
