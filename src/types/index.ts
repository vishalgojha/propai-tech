export type Listing = {
  property_type?: string;
  transaction?: "buy" | "rent" | "lease" | "sell" | "unknown" | string;
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  area_sqft?: number;
  location?: string | string[];
  title?: string;
  description?: string;
  amenities?: string[];
  images?: string[];
};

export type Requirement = {
  property_type?: string;
  transaction?: "buy" | "rent" | "lease" | "unknown" | string;
  budget_min?: number;
  budget_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  area_min_sqft?: number;
  area_max_sqft?: number;
  location?: string | string[];
  notes?: string;
};

export type ParsedMessage = {
  intent: "property" | "requirement" | "unknown" | string;
  listing?: Listing;
  requirement?: Requirement;
  data: Record<string, any>;
  confidence?: number;
  source: "whatsapp" | string;
  rawText: string;
};

export type PropAIPayload = {
  source: string;
  intent: string;
  message: string;
  timestamp: string;
  whatsapp_message_id?: string;
  phone?: string;
  data: {
    schema_version: number;
    listing?: Listing;
    requirement?: Requirement;
    extracted?: Record<string, any>;
    confidence?: number;
  };
};
