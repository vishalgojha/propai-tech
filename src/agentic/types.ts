export type TransactionType = "buy" | "rent";

export type PropertyType = "apartment" | "villa" | "plot" | "commercial";

export type PreferredLanguage = "en" | "hi" | "hinglish";

export type LeadInput = {
  name?: string;
  phone?: string;
  whatsappId?: string;
  city?: string;
  message: string;
  preferredLanguage?: PreferredLanguage;
};

export type LeadRequirement = {
  transaction: TransactionType;
  city?: string;
  locality?: string;
  propertyType?: PropertyType;
  minBudgetInr?: number;
  maxBudgetInr?: number;
  bedrooms?: number;
  areaMinSqft?: number;
  urgency: "low" | "medium" | "high";
  confidence: number;
  missingFields: string[];
};

export type PropertyListing = {
  id: string;
  title: string;
  city: string;
  locality: string;
  propertyType: PropertyType;
  transaction: TransactionType;
  priceInr: number;
  bedrooms?: number;
  areaSqft: number;
  amenities: string[];
  developer: string;
};

export type PropertyMatch = {
  property: PropertyListing;
  fitScore: number;
  reasons: string[];
};

export type LeadQualification = {
  leadSummary: string;
  requirement: LeadRequirement;
};

export type FollowUpPlan = {
  draftMessage: string;
  nextActions: string[];
};

export type OrchestratorResult = {
  qualification: LeadQualification;
  matches: PropertyMatch[];
  followUp: FollowUpPlan;
  whatsappAction?: {
    sent: boolean;
    command: string;
    output?: string;
    error?: string;
  };
};
