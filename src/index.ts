import 'dotenv/config';
import puppeteer, { ElementHandle } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Person } from './types';

const DATABASE_PATH = path.join(__dirname, '../database.json');

async function main() {
  console.log('Starting Form Bot...');

  // 1. Load Data
  if (!fs.existsSync(DATABASE_PATH)) {
    console.error(`Database file not found at ${DATABASE_PATH}`);
    process.exit(1);
  }
  const rawData = fs.readFileSync(DATABASE_PATH, 'utf-8');
  const people: Person[] = JSON.parse(rawData);
  console.log(`Loaded ${people.length} people from database.`);

  // 2. Initialize Browser
  const headless = process.env.HEADLESS === 'true';
  const browser = await puppeteer.launch({
    headless: headless,
    defaultViewport: null,
    args: ['--start-maximized'] // Optional: Start maximized
  });

  try {
    for (const person of people) {
      console.log(`Processing: ${person.fullName}`);
      const page = await browser.newPage();
      
      try {
        // 3. Open Form
        const formUrl = process.env.FORM_URL;
        if (!formUrl) {
            throw new Error('FORM_URL is not defined in .env file');
        }
        await page.goto(formUrl, { waitUntil: 'networkidle0' });
        
        // Helper to find a question container by its text content
        const findQuestionByText = async (text: string) => {
            const questionHandle = await page.evaluateHandle((searchText) => {
                const allQuestions = Array.from(document.querySelectorAll('div[data-automation-id="questionItem"]'));
                return allQuestions.find(q => q.textContent?.toLowerCase().includes(searchText.toLowerCase()));
            }, text) as unknown as ElementHandle<Element>;
            
            if (!questionHandle.asElement()) {
                return null;
            }
            return questionHandle;
        };

        // Helper to type in a text input associated with a question
        const answerTextInput = async (questionItem: ElementHandle<Element>, questionText: string, value: string) => {
             let input = await questionItem.$('input[data-automation-id="textInput"]') as ElementHandle<Element> | null;
             
             if (!input) {
                 input = await questionItem.$('input[placeholder="Enter your answer"], input[placeholder="Escriba su respuesta"], input[type="text"], textarea') as ElementHandle<Element> | null;
             }
             
             if (input) {
                 await input.click({ clickCount: 3 });
                 await page.keyboard.press('Backspace');
                 await input.type(value);
             } else {
                 console.error(`No input found for question "${questionText}"`);
             }
        };
        
        const answerRadioInput = async (questionItem: ElementHandle<Element>, questionText: string, value: string) => {
            const optionElement = await questionItem.evaluateHandle((el, text) => {
                const allElements = Array.from(el.querySelectorAll('span, label, div'));
                return allElements.find(e => e.textContent?.trim() === text);
            }, value) as unknown as ElementHandle<Element>;

            if (optionElement && optionElement.asElement()) {
                await optionElement.click();
            } else {
                 console.error(`Option '${value}' not found in question "${questionText}"`);
            }
        };
        
        const answerRatingInput = async (questionItem: ElementHandle<Element>, questionText: string, rating: number) => {
            const ratingOption = await questionItem.evaluateHandle((el, ratingVal) => {
                const elements = Array.from(el.querySelectorAll('span, div, label'));
                return elements.find(e => {
                    const aria = e.getAttribute('aria-label');
                    const text = e.textContent?.trim();
                    return (aria && aria.startsWith(ratingVal.toString())) || text === ratingVal.toString();
                });
            }, rating) as unknown as ElementHandle<Element>;

            if (ratingOption && ratingOption.asElement()) {
                await ratingOption.click();
            } else {
                 const options = await questionItem.$$('.rating-option, [role="radio"]');
                 if (options.length >= rating) {
                     await options[rating - 1].click();
                 } else {
                     console.error(`Rating ${rating} not found in question "${questionText}"`);
                 }
            }
        };

        const questionsToFill = [
          { type: 'text', text: 'Nombre y apellidos', value: person.fullName },
          { type: 'radio', text: 'Tipo de documento', value: person.documentType },
          { type: 'text', text: 'Numero de documento', value: person.documentNumber },
          { type: 'text', text: 'Correo electronico', value: person.email },
          { type: 'text', text: 'Cargo', value: person.jobTitle },
          { type: 'text', text: 'Nit de la Empresa', value: person.companyNit },
          { type: 'text', text: 'Nombre de la Empresa', value: person.companyName },
          { type: 'text', text: '¿En qué departamento te encuentras actualmente?', value: person.department },
          { type: 'text', text: 'Numero de celular', value: person.phoneNumber },
          { type: 'radio', text: '¿Es usted una persona Sorda?', value: person.isDeaf },
          { type: 'rating', text: 'capacidad del facilitador', value: person.ratings.facilitator },
          { type: 'rating', text: 'formación te brindó las capacidades', value: person.ratings.trainingUtility },
          { type: 'rating', text: 'herramientas de aprendizaje', value: person.ratings.tools },
          { type: 'rating', text: 'satisfecho te has sentido con ARL SURA', value: person.ratings.arlSatisfaction },
          { type: 'rating', text: 'satisfecho te sentiste con la formación', value: person.ratings.trainingSatisfaction },
          { type: 'rating', text: 'fácil o difícil fue recibir la formación', value: person.ratings.difficulty },
          { type: 'rating', text: 'probable es que recomiendes ARL SURA', value: person.ratings.recommendation },
          { type: 'radio', text: 'autorizas a SURA', value: 'Acepto' }
        ];

        let completed = Array(questionsToFill.length).fill(false);
        let attemptsRemaining = 15; // safety limit to prevent infinite loops

        while (completed.includes(false) && attemptsRemaining > 0) {
            attemptsRemaining--;
            let filledAnyOnThisPage = false;

            // 1. Try to fill any unanswered question that is currently visible
            for (let i = 0; i < questionsToFill.length; i++) {
                if (completed[i]) continue;

                const q = questionsToFill[i];
                const questionItem = await findQuestionByText(q.text);
                if (questionItem) {
                    const isVisible = await page.evaluate((el) => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                    }, questionItem);

                    if (isVisible) {
                        console.log(`Filling visible question: "${q.text}"`);
                        try {
                            if (q.type === 'text') {
                                await answerTextInput(questionItem, q.text, q.value as string);
                            } else if (q.type === 'radio') {
                                await answerRadioInput(questionItem, q.text, q.value as string);
                            } else if (q.type === 'rating') {
                                await answerRatingInput(questionItem, q.text, q.value as number);
                            }
                            completed[i] = true;
                            filledAnyOnThisPage = true;
                        } catch (err) {
                            console.error(`Error filling question "${q.text}":`, err);
                        }
                    }
                }
            }

            // 2. If we filled all questions, we are done
            if (!completed.includes(false)) {
                break;
            }

            // 3. Look for landing page / "Start now" button if we haven't started filling anything and it's visible
            const startBtn = await page.evaluateHandle(() => {
                const els = Array.from(document.querySelectorAll('button, div[role="button"], a'));
                return els.find(el => {
                    const text = el.textContent?.trim().toLowerCase() || '';
                    return text.includes('start now') || text.includes('iniciar ahora') || text.includes('comenzar') || text.includes('comenzar ahora');
                });
            }) as ElementHandle<Element>;

            if (startBtn && startBtn.asElement()) {
                const isVisible = await page.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                }, startBtn);

                if (isVisible) {
                    console.log('Landing page start button found. Clicking it...');
                    await startBtn.click();
                    await new Promise(r => setTimeout(r, 1500)); // wait for transition
                    continue; // Re-evaluate questions on the new page
                }
            }

            // 4. Try to navigate to the next page
            const nextBtn = await page.evaluateHandle(() => {
                const els = Array.from(document.querySelectorAll('button, div[role="button"]'));
                return els.find(el => {
                    const text = el.textContent?.trim().toLowerCase() || '';
                    const id = el.getAttribute('data-automation-id') || '';
                    return id === 'nextButton' || text === 'next' || text === 'siguiente' || text === 'siguiente página';
                });
            }) as ElementHandle<Element>;

            if (nextBtn && nextBtn.asElement()) {
                const isVisibleAndEnabled = await page.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                    const isEnabled = !el.hasAttribute('disabled') && !el.classList.contains('disabled');
                    return isVisible && isEnabled;
                }, nextBtn);

                if (isVisibleAndEnabled) {
                    console.log('Next button found. Clicking it to navigate to the next section...');
                    await nextBtn.click();
                    await new Promise(r => setTimeout(r, 1500)); // wait for transition
                    continue;
                }
            }

            // If we didn't fill anything on this page, and we couldn't click "Start" or "Next", we might be stuck
            if (!filledAnyOnThisPage) {
                console.warn('Stuck: No visible unanswered questions found and no active next/start buttons found.');
                break;
            }
        }

        // 5. Submit the Form
        const submitBtn = await page.evaluateHandle(() => {
            const els = Array.from(document.querySelectorAll('button, div[role="button"]'));
            return els.find(el => {
                const text = el.textContent?.trim().toLowerCase() || '';
                const id = el.getAttribute('data-automation-id') || '';
                return id === 'submitButton' || text === 'submit' || text === 'enviar';
            });
        }) as ElementHandle<Element>;

        if (submitBtn && submitBtn.asElement()) {
            const isVisibleAndEnabled = await page.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                const isEnabled = !el.hasAttribute('disabled') && !el.classList.contains('disabled');
                return isVisible && isEnabled;
            }, submitBtn);

            if (isVisibleAndEnabled) {
                console.log(`Clicking Submit button...`);
                const currentUrl = page.url();
                await submitBtn.click();
                
                // Wait for success message, error, or URL change
                try {
                    await page.waitForFunction((initialUrl) => {
                        return document.querySelector('div[data-automation-id="thankYouMessage"]') || 
                               document.querySelector('.form-submit-error') || 
                               window.location.href !== initialUrl;
                    }, { timeout: 20000 }, currentUrl);

                    const successMsg = await page.$('div[data-automation-id="thankYouMessage"]');
                    const errorMsg = await page.$('.form-submit-error');

                    if (page.url() !== currentUrl || successMsg) {
                        console.log(`Successfully submitted for ${person.fullName}`);
                    } else if (errorMsg) {
                        console.error(`Submission error for ${person.fullName}`);
                        await page.screenshot({ path: `error-submit-${person.documentNumber}.png` });
                    } else {
                        console.warn(`Timeout waiting for success/error after submit for ${person.fullName}`);
                        await page.screenshot({ path: `error-timeout-${person.documentNumber}.png` });
                    }
                } catch (e) {
                    console.warn(`Timeout or error waiting for post-submit state for ${person.fullName}:`, e);
                    await page.screenshot({ path: `error-wait-${person.documentNumber}.png` });
                }
            } else {
                console.error("Submit button found but it is not visible or not enabled.");
            }
        } else {
            console.error("Submit button not found!");
        }

      } catch (err) {
        console.error(`Error processing ${person.fullName}:`, err);
        await page.screenshot({ path: `error-${person.documentNumber}.png` });
      } finally {
        await page.close();
      }
    }
  } catch (error) {
      console.error("Fatal error:", error);
  } finally {
    await browser.close();
    console.log('Bot finished.');
  }
}

main();
