export interface Ratings {
  infoQuality: number;
  metExpectations: number;
  facilitatorClarity: number;
  practicalKnowledge: number;
  recommendation: number;
  // Asked by other ARL SURA forms, not by the current target form.
  arlSatisfaction?: number;
  difficulty?: number;
}

export interface ContactPerson {
  fullName: string;
  role: string;
  email: string;
  phone: string;
}

export interface Person {
  fullName: string;
  documentNumber: string;
  email: string;
  companyName: string;
  ratings: Ratings;
  comment?: string;
  dataConsent?: 'Si' | 'No';
  isContactPerson?: 'Si' | 'No';
  contact?: ContactPerson;
  cybersecurityServices?: string[];
  // Asked by other ARL SURA forms, not by the current target form.
  documentType?: string;
  jobTitle?: string;
  companyNit?: string;
  department?: string;
  phoneNumber?: string;
  isDeaf?: string;
}
