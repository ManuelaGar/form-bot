import assert from 'assert';
import { CATALOG, resolveEntry } from './questions';

// Titles read live from the form on 2026-08-18.
const SALUD_MENTAL: Array<[string, 1 | 2, string]> = [
  ['Nombre', 1, 'fullName'],
  ['Numero de Cedula', 1, 'documentNumber'],
  ['Correo electronico', 1, 'email'],
  ['Empresa', 1, 'companyName'],
  ['¿Cómo calificarías la calidad de la información proporcionada durante el curso?', 1, 'infoQuality'],
  ['¿El contenido del curso cumplió con tus expectativas?', 1, 'metExpectations'],
  ['¿El facilitador fue claro y conciso al presentar el contenido del curso?', 1, 'facilitatorClarity'],
  ['¿Consideras que el curso te proporcionó conocimientos prácticos y útiles para aplicar en tu entorno laboral?', 1, 'practicalKnowledge'],
  ['En una escala del 0 al 10, ¿Qué tan probable o improbable es que recomiendes el plan de educación para los clientes ARL SURA a tus colegas, amigos o familiares?', 1, 'recommendation'],
  ['¿Tienes algún comentario o sugerencia?', 1, 'comment'],
  ['Al marcar esta casilla autorizas a SURA  para tratar tus datos personales.', 1, 'dataConsent'],
  ['¿En cuáles de los siguientes aspectos, tu empresa puede requerir servicios de SURA para la protección de la información y continuidad de la operación del negocio?', 1, 'cybersecurityServices'],
  ['Eres la persona que debemos contactar:', 1, 'isContactPerson'],
  ['Nombre completo', 2, 'contactFullName'],
  ['Rol:', 2, 'contactRole'],
  ['Correo Electrónico', 2, 'contactEmail'],
  ['Numero de contacto', 2, 'contactPhone']
];

// Titles of the previous form, taken from mock_form.html. NOT verified against
// the live form: it was already retired when this catalog was written.
const PERSPECTIVA_GENERO: Array<[string, 1 | 2, string]> = [
  ['Nombre y apellidos', 1, 'fullName'],
  ['Tipo de documento', 1, 'documentType'],
  ['Numero de documento', 1, 'documentNumber'],
  ['Correo electronico', 1, 'email'],
  ['Cargo', 1, 'jobTitle'],
  ['Nit de la Empresa', 1, 'companyNit'],
  ['Nombre de la Empresa', 1, 'companyName'],
  ['¿En qué departamento te encuentras actualmente?', 1, 'department'],
  ['Numero de celular', 1, 'phoneNumber'],
  ['¿Es usted una persona Sorda?', 1, 'isDeaf'],
  ['Califique la capacidad del facilitador', 2, 'facilitatorClarity'],
  ['¿La formación te brindó las capacidades necesarias?', 2, 'metExpectations'],
  ['Calidad de las herramientas de aprendizaje', 2, 'infoQuality'],
  ['¿Qué tan satisfecho te has sentido con ARL SURA?', 2, 'arlSatisfaction'],
  ['¿Qué tan satisfecho te sentiste con la formación?', 2, 'practicalKnowledge'],
  ['¿Qué tan fácil o difícil fue recibir la formación?', 2, 'difficulty'],
  ['¿Qué tan probable es que recomiendes ARL SURA?', 2, 'recommendation'],
  ['¿autorizas a SURA el tratamiento de tus datos?', 2, 'dataConsent']
];

let failures = 0;

for (const [form, cases] of [['Salud mental', SALUD_MENTAL], ['Perspectiva de género', PERSPECTIVA_GENERO]] as const) {
  for (const [title, page, expected] of cases) {
    const entry = resolveEntry(title, page);
    if (entry?.id !== expected) {
      failures++;
      console.error(`[${form}] "${title.slice(0, 60)}" -> ${entry?.id ?? 'null'} (expected ${expected})`);
    }
  }
  console.log(`[${form}] ${cases.length} questions checked`);
}

// Every catalog entry must be reachable from at least one known form.
const reached = new Set([...SALUD_MENTAL, ...PERSPECTIVA_GENERO]
  .map(([title, page]) => resolveEntry(title, page)?.id)
  .filter(Boolean));
for (const entry of CATALOG) {
  if (!reached.has(entry.id)) {
    failures++;
    console.error(`Catalog entry never matched by any known form: ${entry.id}`);
  }
}

assert.strictEqual(failures, 0, `${failures} resolution failure(s)`);
console.log('All question titles resolve to the expected field.');
