import assert from 'assert';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';
import { Person } from './types';
import { clickSubmit, fillForm } from './form';

// Drives the real fill logic against the local mocks in ../mocks and asserts
// what each form actually received. Nothing leaves the machine.

const PERSON: Person = {
  fullName: 'Manuela García',
  documentNumber: '1038415763',
  email: 'manugarcia100@hotmail.com',
  companyName: 'Inversiones Hoyos Y García',
  documentType: 'Cédula de ciudadanía',
  jobTitle: 'Subgerente',
  companyNit: '900473191',
  department: 'Antioquia',
  phoneNumber: '3216439960',
  isDeaf: 'No',
  comment: 'Todo muy bien',
  ratings: {
    infoQuality: 5,
    metExpectations: 3,
    facilitatorClarity: 4,
    practicalKnowledge: 5,
    recommendation: 8,
    arlSatisfaction: 4,
    difficulty: 5
  }
};

const DELEGATING_PERSON: Person = {
  ...PERSON,
  isContactPerson: 'No',
  contact: { fullName: 'Alba Luz Hoyos', role: 'Gerente', email: 'alhoyos@e-a.co', phone: '3104483654' }
};

interface Case {
  name: string;
  mock: string;
  person: Person;
  expect: Record<string, string | string[]>;
}

const CASES: Case[] = [
  {
    name: 'Salud mental — respondent is the contact, single page',
    mock: 'salud-mental.html',
    person: PERSON,
    expect: {
      'Nombre': 'Manuela García',
      'Numero de Cedula': '1038415763',
      'Correo electronico': 'manugarcia100@hotmail.com',
      'Empresa': 'Inversiones Hoyos Y García',
      '¿Cómo calificarías la calidad de la información proporcionada durante el curso?': '5',
      '¿El contenido del curso cumplió con tus expectativas?': '3',
      '¿El facilitador fue claro y conciso al presentar el contenido del curso?': '4',
      '¿Consideras que el curso te proporcionó conocimientos prácticos y útiles para aplicar en tu entorno laboral?': '5',
      'En una escala del 0 al 10, ¿Qué tan probable o improbable es que recomiendes el plan de educación para los clientes ARL SURA a tus colegas, amigos o familiares?': '8',
      '¿Tienes algún comentario o sugerencia?': 'Todo muy bien',
      'Al marcar esta casilla autorizas a SURA  para tratar tus datos personales.': ['Si'],
      '¿En cuáles de los siguientes aspectos, tu empresa puede requerir servicios de SURA para la protección de la información y continuidad de la operación del negocio?': ['La empresa no requiere ninguno de los servicios anteriores.'],
      'Eres la persona que debemos contactar:': ['Si']
    }
  },
  {
    name: 'Salud mental — someone else is the contact, branches to page 2',
    mock: 'salud-mental.html',
    person: DELEGATING_PERSON,
    expect: {
      'Correo electronico': 'manugarcia100@hotmail.com',
      'Eres la persona que debemos contactar:': ['No'],
      'Nombre completo': 'Alba Luz Hoyos',
      'Rol:': 'Gerente',
      'Correo Electrónico': 'alhoyos@e-a.co',
      'Numero de contacto': '3104483654'
    }
  },
  {
    name: 'Perspectiva de género — landing, gating, dropdown, two sections',
    mock: 'perspectiva-genero.html',
    person: PERSON,
    expect: {
      '¿Es usted una persona Sorda?': ['No'],
      'Nombre y apellidos': 'Manuela García',
      'Tipo de documento': 'Cédula de ciudadanía',
      'Numero de documento': '1038415763',
      'Correo electronico': 'manugarcia100@hotmail.com',
      'Cargo': 'Subgerente',
      'Nit de la Empresa': '900473191',
      'Nombre de la Empresa': 'Inversiones Hoyos Y García',
      '¿En qué departamento te encuentras actualmente?': 'Antioquia',
      'Numero de celular': '3216439960',
      'Califique la capacidad del facilitador': '4',
      '¿La formación te brindó las capacidades necesarias?': '3',
      'Calidad de las herramientas de aprendizaje': '5',
      '¿Qué tan satisfecho te has sentido con ARL SURA?': '4',
      '¿Qué tan satisfecho te sentiste con la formación?': '5',
      '¿Qué tan fácil o difícil fue recibir la formación?': '5',
      '¿Qué tan probable es que recomiendes ARL SURA?': '8',
      '¿autorizas a SURA el tratamiento de tus datos?': ['Acepto']
    }
  },
  {
    name: 'Modulo 4 — one page, star scales, native radios, no dropdown',
    mock: 'modulo-4.html',
    person: PERSON,
    expect: {
      'Nombre y apellidos': 'Manuela García',
      // The form spells it without the first accent; the database has it with.
      'Tipo de documento': 'Cedula de ciudadanía',
      'Numero de documento': '1038415763',
      'Correo electronico': 'manugarcia100@hotmail.com',
      'Cargo': 'Subgerente',
      'Nit de la Empresa': '900473191',
      'Nombre de la Empresa': 'Inversiones Hoyos Y García',
      '¿En qué departamento te encuentras actualmente?': 'Antioquia',
      'Numero de celular': '3216439960',
      '¿Es usted una persona Sorda?': 'No',
      '¿Cómo calificarías la capacidad del facilitador/a para dominar el tema y resolver inquietudes?': '4',
      '¿Consideras que la formación te brindó las capacidades útiles para aplicarlos en tu día a día?': '3',
      '¿Las herramientas de aprendizaje fueron acordes para la apropiación del conocimiento?': '5',
      'En general, ¿qué tan satisfecho te has sentido con ARL SURA?': '4',
      'En general, ¿qué tan satisfecho te sentiste con la formación ofrecida por ARL SURA?': '5',
      '¿Qué tan fácil o difícil fue recibir la formación ofrecida por ARL SURA?': '5',
      '¿Qué tan probable es que recomiendes ARL SURA a tus colegas, amigos o familiares?': '8',
      '¿Tienes algún comentario o sugerencia?': 'Todo muy bien',
      ['Al marcar esta casilla autorizas a SURA  para tratar tus datos personales.Ingresa al siguiente link para ver las políticas de tratamiento de datos https://www.example.com/politica-tratamiento-de-datos']: 'Acepto'
    }
  }
];

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: process.env.NO_SANDBOX === 'true' ? ['--no-sandbox'] : []
  });
  let failures = 0;

  for (const testCase of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1200 });
    await page.goto(pathToFileURL(path.join(__dirname, '../mocks', testCase.mock)).href, { waitUntil: 'networkidle0' });

    const report = await fillForm(page, testCase.person);
    const submitted = await clickSubmit(page);
    await new Promise(r => setTimeout(r, 500));
    const received = await page.evaluate(() => (window as unknown as { __submitted?: Record<string, unknown> }).__submitted ?? null);

    const errors: string[] = [];
    if (report.unknown.length > 0) errors.push(`unknown questions: ${report.unknown.join(' / ')}`);
    if (report.failed.length > 0) errors.push(`failed: ${report.failed.join(' / ')}`);
    if (report.missingValue.length > 0) errors.push(`no value for: ${report.missingValue.join(', ')}`);
    if (!submitted) errors.push('submit button not found');
    if (!received) errors.push('never reached the thank-you page');

    for (const [question, expected] of Object.entries(testCase.expect)) {
      const actual = received?.[question];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(`"${question.slice(0, 45)}" -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
      }
    }

    if (errors.length === 0) {
      console.log(`PASS  ${testCase.name} (${report.answered.length} answered)`);
    } else {
      failures++;
      console.error(`FAIL  ${testCase.name}`);
      errors.forEach(e => console.error(`        ${e}`));
    }
    await page.close();
  }

  await browser.close();
  assert.strictEqual(failures, 0, `${failures} case(s) failed`);
  console.log('Every mock form received exactly the expected answers.');
}

run();
