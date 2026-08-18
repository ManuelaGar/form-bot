import 'dotenv/config';
import puppeteer, { Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Person } from './types';
import { FillReport, clickSubmit, fillForm, visibleButtons } from './form';

const DATABASE_PATH = path.join(__dirname, '../database.json');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Starting Form Bot...');

  if (!fs.existsSync(DATABASE_PATH)) {
    console.error(`Database file not found at ${DATABASE_PATH}`);
    process.exit(1);
  }
  const people: Person[] = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf-8'));
  console.log(`Loaded ${people.length} people from database.`);

  const formUrl = process.argv[2] ?? process.env.FORM_URL;
  if (!formUrl) {
    console.error('No form URL: pass it as an argument or set FORM_URL in .env');
    process.exit(1);
  }

  const headless = process.env.HEADLESS === 'true';
  const dryRun = process.env.DRY_RUN === 'true';
  const delayBetweenPeople = Number(process.env.DELAY_MS ?? 2000);
  if (dryRun) {
    console.log('DRY_RUN is on: forms will be filled but NOT submitted.');
  }

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const problems: string[] = [];

  try {
    for (const [index, person] of people.entries()) {
      console.log(`[${index + 1}/${people.length}] Processing: ${person.fullName}`);
      const page = await browser.newPage();
      try {
        await page.goto(formUrl, { waitUntil: 'networkidle0' });
        if (index === 0) console.log(`Form: ${await page.title()}`);

        const report = await fillForm(page, person);
        problems.push(...describe(person, report));

        const submitted = await submitForm(page, person, dryRun);
        if (!submitted && !dryRun) problems.push(`${person.fullName}: not submitted`);
      } catch (err) {
        console.error(`Error processing ${person.fullName}:`, err);
        problems.push(`${person.fullName}: ${(err as Error).message}`);
        await page.screenshot({ path: `error-${person.documentNumber}.png`, fullPage: true });
      } finally {
        await page.close();
        if (delayBetweenPeople > 0) await sleep(delayBetweenPeople);
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await browser.close();
    if (problems.length > 0) {
      console.warn(`Finished with ${problems.length} problem(s):`);
      problems.forEach(p => console.warn(`  - ${p}`));
    } else {
      console.log('Bot finished with no errors.');
    }
  }
}

function describe(person: Person, report: FillReport): string[] {
  const problems: string[] = [];
  if (report.unknown.length > 0) problems.push(`${person.fullName}: unknown questions -> ${report.unknown.join(' / ')}`);
  if (report.missingValue.length > 0) problems.push(`${person.fullName}: no value for ${report.missingValue.join(', ')}`);
  if (report.failed.length > 0) problems.push(`${person.fullName}: ${report.failed.join(' / ')}`);
  return problems;
}

async function submitForm(page: Page, person: Person, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    await page.screenshot({ path: `dryrun-${person.documentNumber}.png`, fullPage: true });
    console.log(`DRY_RUN: filled form for ${person.fullName} (screenshot saved, not submitted).`);
    return false;
  }

  if (!(await clickSubmit(page))) {
    const buttons = await visibleButtons(page);
    console.error(`Submit button not found for ${person.fullName}. Visible buttons: ${buttons.join(' | ')}`);
    await page.screenshot({ path: `error-nosubmit-${person.documentNumber}.png`, fullPage: true });
    return false;
  }

  try {
    await page.waitForFunction(() => {
      return document.querySelector('div[data-automation-id="thankYouMessage"]') !== null ||
        document.querySelector('.form-submit-error') !== null ||
        document.querySelectorAll('div[data-automation-id="questionItem"]').length === 0;
    }, { timeout: 20000 });
  } catch {
    console.warn(`Timeout waiting for confirmation for ${person.fullName}`);
    await page.screenshot({ path: `error-timeout-${person.documentNumber}.png`, fullPage: true });
    return false;
  }

  if (await page.$('.form-submit-error')) {
    console.error(`Submission error for ${person.fullName}`);
    await page.screenshot({ path: `error-submit-${person.documentNumber}.png`, fullPage: true });
    return false;
  }

  console.log(`Successfully submitted for ${person.fullName}`);
  return true;
}

main();
