import { Person } from './types';

export type AnswerType = 'text' | 'radio' | 'checkbox' | 'dropdown' | 'scale';

export interface CatalogEntry {
  id: string;
  type: AnswerType;
  // Matched against the whole question title, accents and case ignored.
  titles: string[];
  // Matched as a substring. Only for wordings long enough to be unambiguous:
  // "Empresa" as a substring would also match the cybersecurity question.
  contains?: string[];
  optional?: boolean;
  value: (person: Person) => string | number | string[] | undefined;
}

export const NO_CYBERSECURITY_SERVICE = 'La empresa no requiere ninguno de los servicios anteriores.';

export const normalize = (value: string): string =>
  (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// The same intent is labelled differently across SURA forms: the consent
// question offers "Acepto" in one and "Si" in another.
const OPTION_SYNONYMS: Record<string, string[]> = {
  si: ['Si', 'Sí', 'Acepto', 'Yes'],
  no: ['No', 'No acepto']
};

export function optionCandidates(value: string): string[] {
  const synonyms = OPTION_SYNONYMS[normalize(value)] ?? [];
  return [value, ...synonyms.filter(s => normalize(s) !== normalize(value))];
}

// One entry per question the bot knows how to answer, across every SURA form.
// A form is filled by walking the questions it renders and looking each one up
// here, so supporting another form usually means adding titles, not code.
export const CATALOG: CatalogEntry[] = [
  {
    id: 'fullName',
    type: 'text',
    titles: ['Nombre', 'Nombre y apellidos'],
    value: p => p.fullName
  },
  {
    id: 'documentType',
    type: 'dropdown',
    titles: ['Tipo de documento'],
    value: p => p.documentType
  },
  {
    id: 'documentNumber',
    type: 'text',
    titles: ['Numero de Cedula', 'Numero de documento'],
    value: p => p.documentNumber
  },
  {
    id: 'email',
    type: 'text',
    titles: ['Correo electronico'],
    value: p => p.email
  },
  {
    id: 'jobTitle',
    type: 'text',
    titles: ['Cargo'],
    value: p => p.jobTitle
  },
  {
    id: 'companyNit',
    type: 'text',
    titles: ['Nit de la Empresa'],
    value: p => p.companyNit
  },
  {
    id: 'companyName',
    type: 'text',
    titles: ['Empresa', 'Nombre de la Empresa'],
    value: p => p.companyName
  },
  {
    id: 'department',
    type: 'text',
    titles: ['¿En qué departamento te encuentras actualmente?'],
    contains: ['departamento te encuentras'],
    value: p => p.department
  },
  {
    id: 'phoneNumber',
    type: 'text',
    titles: ['Numero de celular'],
    value: p => p.phoneNumber
  },
  {
    id: 'isDeaf',
    type: 'radio',
    titles: ['¿Es usted una persona Sorda?'],
    contains: ['es usted una persona sorda'],
    value: p => p.isDeaf
  },
  {
    id: 'infoQuality',
    type: 'scale',
    titles: [
      '¿Cómo calificarías la calidad de la información proporcionada durante el curso?',
      'Calidad de las herramientas de aprendizaje'
    ],
    contains: ['calidad de la información proporcionada', 'herramientas de aprendizaje'],
    value: p => p.ratings.infoQuality
  },
  {
    id: 'metExpectations',
    type: 'scale',
    titles: [
      '¿El contenido del curso cumplió con tus expectativas?',
      '¿La formación te brindó las capacidades necesarias?'
    ],
    contains: ['contenido del curso cumplió con tus expectativas', 'formación te brindó las capacidades'],
    value: p => p.ratings.metExpectations
  },
  {
    id: 'facilitatorClarity',
    type: 'scale',
    titles: [
      '¿El facilitador fue claro y conciso al presentar el contenido del curso?',
      'Califique la capacidad del facilitador'
    ],
    contains: ['facilitador fue claro y conciso', 'capacidad del facilitador'],
    value: p => p.ratings.facilitatorClarity
  },
  {
    id: 'practicalKnowledge',
    type: 'scale',
    titles: [
      '¿Consideras que el curso te proporcionó conocimientos prácticos y útiles para aplicar en tu entorno laboral?',
      '¿Qué tan satisfecho te sentiste con la formación?'
    ],
    contains: ['conocimientos prácticos y útiles', 'satisfecho te sentiste con la formación'],
    value: p => p.ratings.practicalKnowledge
  },
  {
    id: 'arlSatisfaction',
    type: 'scale',
    titles: ['¿Qué tan satisfecho te has sentido con ARL SURA?'],
    contains: ['satisfecho te has sentido con ARL SURA'],
    value: p => p.ratings.arlSatisfaction
  },
  {
    id: 'difficulty',
    type: 'scale',
    titles: ['¿Qué tan fácil o difícil fue recibir la formación?'],
    contains: ['fácil o difícil fue recibir la formación'],
    value: p => p.ratings.difficulty
  },
  {
    id: 'recommendation',
    type: 'scale',
    titles: ['¿Qué tan probable es que recomiendes ARL SURA?'],
    contains: ['probable es que recomiendes', 'probable o improbable es que recomiendes'],
    value: p => p.ratings.recommendation
  },
  {
    id: 'comment',
    type: 'text',
    optional: true,
    titles: ['¿Tienes algún comentario o sugerencia?'],
    contains: ['comentario o sugerencia'],
    value: p => p.comment
  },
  {
    id: 'dataConsent',
    type: 'radio',
    titles: ['Al marcar esta casilla autorizas a SURA para tratar tus datos personales.'],
    contains: ['autorizas a SURA'],
    value: p => p.dataConsent ?? 'Si'
  },
  {
    id: 'cybersecurityServices',
    type: 'checkbox',
    titles: [],
    contains: ['servicios de SURA para la protección de la información'],
    value: p => p.cybersecurityServices ?? [NO_CYBERSECURITY_SERVICE]
  },
  {
    id: 'isContactPerson',
    type: 'radio',
    titles: ['Eres la persona que debemos contactar:'],
    contains: ['persona que debemos contactar'],
    value: p => p.isContactPerson ?? 'Si'
  },
  {
    id: 'contactFullName',
    type: 'text',
    titles: ['Nombre completo'],
    value: p => p.contact?.fullName
  },
  {
    id: 'contactRole',
    type: 'text',
    titles: ['Rol:', 'Rol'],
    value: p => p.contact?.role
  },
  {
    id: 'contactEmail',
    type: 'text',
    titles: ['Correo Electrónico'],
    value: p => p.contact?.email
  },
  {
    id: 'contactPhone',
    type: 'text',
    titles: ['Numero de contacto'],
    value: p => p.contact?.phone
  }
];

// Entries already used are excluded, which is what separates the two
// "Correo electronico" questions: the first one is the respondent, a second one
// later in the same run can only be the contact person.
export function resolveEntry(title: string, alreadyAnswered: ReadonlySet<string>): CatalogEntry | null {
  const target = normalize(title);
  const candidates = CATALOG.filter(e => !alreadyAnswered.has(e.id));

  return candidates.find(e => e.titles.some(t => normalize(t) === target)) ??
    candidates.find(e => e.contains?.some(t => target.includes(normalize(t))) === true) ??
    null;
}
