import assert from 'assert';
import { CATALOG, resolveEntry } from './questions';

// Titles are resolved in the order the form renders them, with the entries
// already used excluded — the same walk fillForm does.
function walk(titles: string[]): Array<{ title: string, id: string | null }> {
  const answered = new Set<string>();
  return titles.map(title => {
    const entry = resolveEntry(title, answered);
    if (entry) answered.add(entry.id);
    return { title, id: entry?.id ?? null };
  });
}

// Titles read live from the form on 2026-08-18.
const SALUD_MENTAL: Array<[string, string]> = [
  ['Nombre', 'fullName'],
  ['Numero de Cedula', 'documentNumber'],
  ['Correo electronico', 'email'],
  ['Empresa', 'companyName'],
  ['¿Cómo calificarías la calidad de la información proporcionada durante el curso?', 'infoQuality'],
  ['¿El contenido del curso cumplió con tus expectativas?', 'metExpectations'],
  ['¿El facilitador fue claro y conciso al presentar el contenido del curso?', 'facilitatorClarity'],
  ['¿Consideras que el curso te proporcionó conocimientos prácticos y útiles para aplicar en tu entorno laboral?', 'practicalKnowledge'],
  ['En una escala del 0 al 10, ¿Qué tan probable o improbable es que recomiendes el plan de educación para los clientes ARL SURA a tus colegas, amigos o familiares?', 'recommendation'],
  ['¿Tienes algún comentario o sugerencia?', 'comment'],
  ['Al marcar esta casilla autorizas a SURA  para tratar tus datos personales.', 'dataConsent'],
  ['¿En cuáles de los siguientes aspectos, tu empresa puede requerir servicios de SURA para la protección de la información y continuidad de la operación del negocio?', 'cybersecurityServices'],
  ['Eres la persona que debemos contactar:', 'isContactPerson'],
  ['Nombre completo', 'contactFullName'],
  ['Rol:', 'contactRole'],
  ['Correo Electrónico', 'contactEmail'],
  ['Numero de contacto', 'contactPhone']
];

// Titles of the previous form, taken from mock_form.html. NOT verified against
// the live form: it was already retired when this catalog was written.
const PERSPECTIVA_GENERO: Array<[string, string]> = [
  ['Nombre y apellidos', 'fullName'],
  ['Tipo de documento', 'documentType'],
  ['Numero de documento', 'documentNumber'],
  ['Correo electronico', 'email'],
  ['Cargo', 'jobTitle'],
  ['Nit de la Empresa', 'companyNit'],
  ['Nombre de la Empresa', 'companyName'],
  ['¿En qué departamento te encuentras actualmente?', 'department'],
  ['Numero de celular', 'phoneNumber'],
  ['¿Es usted una persona Sorda?', 'isDeaf'],
  ['Califique la capacidad del facilitador', 'facilitatorClarity'],
  ['¿La formación te brindó las capacidades necesarias?', 'metExpectations'],
  ['Calidad de las herramientas de aprendizaje', 'infoQuality'],
  ['¿Qué tan satisfecho te has sentido con ARL SURA?', 'arlSatisfaction'],
  ['¿Qué tan satisfecho te sentiste con la formación?', 'practicalKnowledge'],
  ['¿Qué tan fácil o difícil fue recibir la formación?', 'difficulty'],
  ['¿Qué tan probable es que recomiendes ARL SURA?', 'recommendation'],
  ['¿autorizas a SURA el tratamiento de tus datos?', 'dataConsent']
];

// Titles read live from the form on 2026-08-21. Same shape as the retired form,
// different wording: star scales, native radios, and a consent title with a URL
// glued onto the end.
const MODULO_4: Array<[string, string]> = [
  ['Nombre y apellidos', 'fullName'],
  ['Tipo de documento', 'documentType'],
  ['Numero de documento', 'documentNumber'],
  ['Correo electronico', 'email'],
  ['Cargo', 'jobTitle'],
  ['Nit de la Empresa', 'companyNit'],
  ['Nombre de la Empresa', 'companyName'],
  ['¿En qué departamento te encuentras actualmente?', 'department'],
  ['Numero de celular', 'phoneNumber'],
  ['¿Es usted una persona Sorda?', 'isDeaf'],
  ['¿Cómo calificarías la capacidad del facilitador/a para dominar el tema y resolver inquietudes?', 'facilitatorClarity'],
  ['¿Consideras que la formación te brindó las capacidades útiles para aplicarlos en tu día a día?', 'metExpectations'],
  ['¿Las herramientas de aprendizaje fueron acordes para la apropiación del conocimiento?', 'infoQuality'],
  ['En general, ¿qué tan satisfecho te has sentido con ARL SURA?', 'arlSatisfaction'],
  ['En general, ¿qué tan satisfecho te sentiste con la formación ofrecida por ARL SURA?', 'practicalKnowledge'],
  ['¿Qué tan fácil o difícil fue recibir la formación ofrecida por ARL SURA?', 'difficulty'],
  ['¿Qué tan probable es que recomiendes ARL SURA a tus colegas, amigos o familiares?', 'recommendation'],
  ['¿Tienes algún comentario o sugerencia?', 'comment'],
  ['Al marcar esta casilla autorizas a SURA  para tratar tus datos personales.Ingresa al siguiente link para ver las políticas de tratamiento de datos https://www.example.com/politica', 'dataConsent']
];

// "Prevención del suicidio en el entorno laboral" (verified live 2026-08-24)
// repeats Modulo 4's wording except for the consent question, which uses a
// single space and a different link. Only the difference is listed; the rest of
// that form is covered end to end in e2e.test.ts.
const PREVENCION_SUICIDIO: Array<[string, string]> = [
  ['Al marcar esta casilla autorizas a SURA para tratar tus datos personales.Ingresa al siguiente link para ver las políticas de tratamiento de datos https://www.example.com/politica', 'dataConsent']
];

let failures = 0;

for (const [form, cases] of [['Salud mental', SALUD_MENTAL], ['Perspectiva de género', PERSPECTIVA_GENERO], ['Modulo 4', MODULO_4], ['Prevención del suicidio', PREVENCION_SUICIDIO]] as const) {
  const resolved = walk(cases.map(([title]) => title));
  resolved.forEach(({ title, id }, i) => {
    const expected = cases[i][1];
    if (id !== expected) {
      failures++;
      console.error(`[${form}] "${title.slice(0, 60)}" -> ${id ?? 'null'} (expected ${expected})`);
    }
  });
  console.log(`[${form}] ${cases.length} questions checked`);
}

// Every catalog entry must be reachable from at least one known form.
const reached = new Set([
  ...walk(SALUD_MENTAL.map(([title]) => title)),
  ...walk(PERSPECTIVA_GENERO.map(([title]) => title)),
  ...walk(MODULO_4.map(([title]) => title))
].map(r => r.id));
for (const entry of CATALOG) {
  if (!reached.has(entry.id)) {
    failures++;
    console.error(`Catalog entry never matched by any known form: ${entry.id}`);
  }
}

assert.strictEqual(failures, 0, `${failures} resolution failure(s)`);
console.log('All question titles resolve to the expected field.');
