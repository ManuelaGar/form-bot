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
            // Use XPath to find a div with data-automation-id="questionItem" that contains the text
            const questionHandle = await page.evaluateHandle((searchText) => {
                const allQuestions = Array.from(document.querySelectorAll('div[data-automation-id="questionItem"]'));
                return allQuestions.find(q => q.textContent?.includes(searchText));
            }, text) as unknown as ElementHandle<Element>;
            
            if (!questionHandle.asElement()) {
                console.error(`Question with text "${text}" not found.`);
                return null;
            }
            return questionHandle;
        };

        // Helper to type in a text input associated with a question text
        const answerTextInput = async (questionText: string, value: string) => {
             const questionItem = await findQuestionByText(questionText);
             if (!questionItem) return;

             // Try to find the input using data-automation-id which is robust
             let input = await questionItem.$('input[data-automation-id="textInput"]') as ElementHandle<Element> | null;
             
             if (!input) {
                 // Fallback: try placeholder (English and Spanish) or generic text input
                 input = await questionItem.$('input[placeholder="Enter your answer"], input[placeholder="Escriba su respuesta"], input[type="text"], textarea') as ElementHandle<Element> | null;
             }
             
             if (input) {
                 await input.type(value);
             } else {
                 console.error(`No input found for question "${questionText}"`);
             }
        };
        
        const answerRadioInput = async (questionText: string, value: string) => {
            const questionItem = await findQuestionByText(questionText);
            if (!questionItem) return;

            // Find the element containing the text. It's usually a span or label.
            const optionElement = await questionItem.evaluateHandle((el, text) => {
                const allElements = Array.from(el.querySelectorAll('span, label, div'));
                // Find exact match or close match
                return allElements.find(e => e.textContent?.trim() === text);
            }, value) as unknown as ElementHandle<Element>;

            if (optionElement && optionElement.asElement()) {
                await optionElement.click();
            } else {
                 console.error(`Option '${value}' not found in question "${questionText}"`);
            }
        };
        
         const answerRatingInput = async (questionText: string, rating: number) => {
            const questionItem = await findQuestionByText(questionText);
            if (!questionItem) return;

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
                 // Fallback: try to find by index in the rating group
                 const options = await questionItem.$$('.rating-option, [role="radio"]');
                 if (options.length >= rating) {
                     await options[rating - 1].click();
                 } else {
                     console.error(`Rating ${rating} not found in question "${questionText}"`);
                 }
            }
        };

        // 1. Nombre y apellidos
        await answerTextInput('Nombre y apellidos', person.fullName);

        // 2. Tipo de documento
        await answerRadioInput('Tipo de documento', person.documentType);

        // 3. Numero de documento
        await answerTextInput('Numero de documento', person.documentNumber);

        // 4. Correo electronico
        await answerTextInput('Correo electronico', person.email);

        // 5. Cargo
        await answerTextInput('Cargo', person.jobTitle);

        // 6. Nit de la Empresa
        await answerTextInput('Nit de la Empresa', person.companyNit);

        // 7. Nombre de la Empresa
        await answerTextInput('Nombre de la Empresa', person.companyName);

        // 8. Departamento
        await answerTextInput('¿En qué departamento te encuentras actualmente?', person.department);

        // 9. Celular
        await answerTextInput('Numero de celular', person.phoneNumber);

        // 10. Sorda
        await answerRadioInput('¿Es usted una persona Sorda?', person.isDeaf);

        // 11. Facilitator Rating
        await answerRatingInput('capacidad del facilitador', person.ratings.facilitator);

        // 12. Training Utility
        await answerRatingInput('formación te brindó las capacidades', person.ratings.trainingUtility);

        // 13. Tools
        await answerRatingInput('herramientas de aprendizaje', person.ratings.tools);

        // 14. ARL Satisfaction
        await answerRatingInput('satisfecho te has sentido con ARL SURA', person.ratings.arlSatisfaction);

        // 15. Training Satisfaction
        await answerRatingInput('satisfecho te sentiste con la formación', person.ratings.trainingSatisfaction);

        // 16. Difficulty
        await answerRatingInput('fácil o difícil fue recibir la formación', person.ratings.difficulty);

        // 17. Recommendation
        await answerRatingInput('probable es que recomiendes ARL SURA', person.ratings.recommendation);

        // Authorization
        await answerRadioInput('autorizas a SURA', "Acepto");

        // Submit
        // Find the submit button
        const submitBtn = await page.$('button[data-automation-id="submitButton"]');
        if (submitBtn) {
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
            console.error("Submit button not found!");
        }

      } catch (err) {
        console.error(`Error processing ${person.fullName}:`, err);
        // Take screenshot on error
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
