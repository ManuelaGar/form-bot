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

let failures = 0;

for (const [form, cases] of [['Salud mental', SALUD_MENTAL], ['Perspectiva de género', PERSPECTIVA_GENERO]] as const) {
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
  ...walk(PERSPECTIVA_GENERO.map(([title]) => title))
].map(r => r.id));
for (const entry of CATALOG) {
  if (!reached.has(entry.id)) {
    failures++;
    console.error(`Catalog entry never matched by any known form: ${entry.id}`);
  }
}

assert.strictEqual(failures, 0, `${failures} resolution failure(s)`);
console.log('All question titles resolve to the expected field.');
