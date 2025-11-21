export interface Ratings {
  facilitator: number;
  trainingUtility: number;
  tools: number;
  arlSatisfaction: number;
  trainingSatisfaction: number;
  difficulty: number;
  recommendation: number;
}

export interface Person {
  fullName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  jobTitle: string;
  companyNit: string;
  companyName: string;
  department: string;
  phoneNumber: string;
  isDeaf: string;
  ratings: Ratings;
}
