"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATABASE_PATH = path_1.default.join(__dirname, '../database.json');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting Form Bot...');
        // 1. Load Data
        if (!fs_1.default.existsSync(DATABASE_PATH)) {
            console.error(`Database file not found at ${DATABASE_PATH}`);
            process.exit(1);
        }
        const rawData = fs_1.default.readFileSync(DATABASE_PATH, 'utf-8');
        const people = JSON.parse(rawData);
        console.log(`Loaded ${people.length} people from database.`);
        // 2. Initialize Browser
        const headless = process.env.HEADLESS === 'true';
        const browser = yield puppeteer_1.default.launch({
            headless: headless,
            defaultViewport: null,
            args: ['--start-maximized'] // Optional: Start maximized
        });
        try {
            for (const person of people) {
                console.log(`Processing: ${person.fullName}`);
                const page = yield browser.newPage();
                try {
                    // 3. Open Form
                    const formUrl = process.env.FORM_URL;
                    if (!formUrl) {
                        throw new Error('FORM_URL is not defined in .env file');
                    }
                    yield page.goto(formUrl, { waitUntil: 'networkidle0' });
                    // Helper to find a question container by its text content
                    const findQuestionByText = (text) => __awaiter(this, void 0, void 0, function* () {
                        // Use XPath to find a div with data-automation-id="questionItem" that contains the text
                        const questionHandle = yield page.evaluateHandle((searchText) => {
                            const allQuestions = Array.from(document.querySelectorAll('div[data-automation-id="questionItem"]'));
                            return allQuestions.find(q => { var _a; return (_a = q.textContent) === null || _a === void 0 ? void 0 : _a.includes(searchText); });
                        }, text);
                        if (!questionHandle.asElement()) {
                            console.error(`Question with text "${text}" not found.`);
                            return null;
                        }
                        return questionHandle;
                    });
                    // Helper to type in a text input associated with a question text
                    const answerTextInput = (questionText, value) => __awaiter(this, void 0, void 0, function* () {
                        const questionItem = yield findQuestionByText(questionText);
                        if (!questionItem)
                            return;
                        // Try to find the input using data-automation-id which is robust
                        let input = yield questionItem.$('input[data-automation-id="textInput"]');
                        if (!input) {
                            // Fallback: try placeholder (English and Spanish) or generic text input
                            input = (yield questionItem.$('input[placeholder="Enter your answer"], input[placeholder="Escriba su respuesta"], input[type="text"], textarea'));
                        }
                        if (input) {
                            yield input.type(value);
                        }
                        else {
                            console.error(`No input found for question "${questionText}"`);
                        }
                    });
                    const answerRadioInput = (questionText, value) => __awaiter(this, void 0, void 0, function* () {
                        const questionItem = yield findQuestionByText(questionText);
                        if (!questionItem)
                            return;
                        // Find the element containing the text. It's usually a span or label.
                        const optionElement = yield questionItem.evaluateHandle((el, text) => {
                            const allElements = Array.from(el.querySelectorAll('span, label, div'));
                            // Find exact match or close match
                            return allElements.find(e => { var _a; return ((_a = e.textContent) === null || _a === void 0 ? void 0 : _a.trim()) === text; });
                        }, value);
                        if (optionElement && optionElement.asElement()) {
                            yield optionElement.click();
                        }
                        else {
                            console.error(`Option '${value}' not found in question "${questionText}"`);
                        }
                    });
                    const answerRatingInput = (questionText, rating) => __awaiter(this, void 0, void 0, function* () {
                        const questionItem = yield findQuestionByText(questionText);
                        if (!questionItem)
                            return;
                        const ratingOption = yield questionItem.evaluateHandle((el, ratingVal) => {
                            const elements = Array.from(el.querySelectorAll('span, div, label'));
                            return elements.find(e => {
                                var _a;
                                const aria = e.getAttribute('aria-label');
                                const text = (_a = e.textContent) === null || _a === void 0 ? void 0 : _a.trim();
                                return (aria && aria.startsWith(ratingVal.toString())) || text === ratingVal.toString();
                            });
                        }, rating);
                        if (ratingOption && ratingOption.asElement()) {
                            yield ratingOption.click();
                        }
                        else {
                            // Fallback: try to find by index in the rating group
                            const options = yield questionItem.$$('.rating-option, [role="radio"]');
                            if (options.length >= rating) {
                                yield options[rating - 1].click();
                            }
                            else {
                                console.error(`Rating ${rating} not found in question "${questionText}"`);
                            }
                        }
                    });
                    // 1. Nombre y apellidos
                    yield answerTextInput('Nombre y apellidos', person.fullName);
                    // 2. Tipo de documento
                    yield answerRadioInput('Tipo de documento', person.documentType);
                    // 3. Numero de documento
                    yield answerTextInput('Numero de documento', person.documentNumber);
                    // 4. Correo electronico
                    yield answerTextInput('Correo electronico', person.email);
                    // 5. Cargo
                    yield answerTextInput('Cargo', person.jobTitle);
                    // 6. Nit de la Empresa
                    yield answerTextInput('Nit de la Empresa', person.companyNit);
                    // 7. Nombre de la Empresa
                    yield answerTextInput('Nombre de la Empresa', person.companyName);
                    // 8. Departamento
                    yield answerTextInput('¿En qué departamento te encuentras actualmente?', person.department);
                    // 9. Celular
                    yield answerTextInput('Numero de celular', person.phoneNumber);
                    // 10. Sorda
                    yield answerRadioInput('¿Es usted una persona Sorda?', person.isDeaf);
                    // 11. Facilitator Rating
                    yield answerRatingInput('capacidad del facilitador', person.ratings.facilitator);
                    // 12. Training Utility
                    yield answerRatingInput('formación te brindó las capacidades', person.ratings.trainingUtility);
                    // 13. Tools
                    yield answerRatingInput('herramientas de aprendizaje', person.ratings.tools);
                    // 14. ARL Satisfaction
                    yield answerRatingInput('satisfecho te has sentido con ARL SURA', person.ratings.arlSatisfaction);
                    // 15. Training Satisfaction
                    yield answerRatingInput('satisfecho te sentiste con la formación', person.ratings.trainingSatisfaction);
                    // 16. Difficulty
                    yield answerRatingInput('fácil o difícil fue recibir la formación', person.ratings.difficulty);
                    // 17. Recommendation
                    yield answerRatingInput('probable es que recomiendes ARL SURA', person.ratings.recommendation);
                    // Authorization
                    yield answerRadioInput('autorizas a SURA', "Acepto");
                    // Submit
                    // Find the submit button
                    const submitBtn = yield page.$('button[data-automation-id="submitButton"]');
                    if (submitBtn) {
                        const currentUrl = page.url();
                        yield submitBtn.click();
                        // Wait for success message, error, or URL change
                        try {
                            yield page.waitForFunction((initialUrl) => {
                                return document.querySelector('div[data-automation-id="thankYouMessage"]') ||
                                    document.querySelector('.form-submit-error') ||
                                    window.location.href !== initialUrl;
                            }, { timeout: 20000 }, currentUrl);
                            const successMsg = yield page.$('div[data-automation-id="thankYouMessage"]');
                            const errorMsg = yield page.$('.form-submit-error');
                            if (page.url() !== currentUrl || successMsg) {
                                console.log(`Successfully submitted for ${person.fullName}`);
                            }
                            else if (errorMsg) {
                                console.error(`Submission error for ${person.fullName}`);
                                yield page.screenshot({ path: `error-submit-${person.documentNumber}.png` });
                            }
                            else {
                                console.warn(`Timeout waiting for success/error after submit for ${person.fullName}`);
                                yield page.screenshot({ path: `error-timeout-${person.documentNumber}.png` });
                            }
                        }
                        catch (e) {
                            console.warn(`Timeout or error waiting for post-submit state for ${person.fullName}:`, e);
                            yield page.screenshot({ path: `error-wait-${person.documentNumber}.png` });
                        }
                    }
                    else {
                        console.error("Submit button not found!");
                    }
                }
                catch (err) {
                    console.error(`Error processing ${person.fullName}:`, err);
                    // Take screenshot on error
                    yield page.screenshot({ path: `error-${person.documentNumber}.png` });
                }
                finally {
                    yield page.close();
                }
            }
        }
        catch (error) {
            console.error("Fatal error:", error);
        }
        finally {
            yield browser.close();
            console.log('Bot finished.');
        }
    });
}
main();
