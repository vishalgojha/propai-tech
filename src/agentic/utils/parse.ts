const SUPPORTED_CITIES = [
  "mumbai",
  "pune",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "noida",
  "gurugram",
  "gurgaon",
  "chennai",
  "ahmedabad"
];

const SUPPORTED_LOCALITIES = [
  "andheri east",
  "powai",
  "bandra",
  "wakad",
  "baner",
  "whitefield",
  "hsr layout",
  "indiranagar",
  "gachibowli",
  "kondapur",
  "sector 150",
  "golf course road"
];

type MoneyRange = {
  min?: number;
  max?: number;
};

export function normalizeLocation(value: string): string {
  return value.trim().toLowerCase();
}

export function detectCity(text: string): string | undefined {
  const lower = text.toLowerCase();
  const city = SUPPORTED_CITIES.find((item) => lower.includes(item));
  if (!city) return undefined;
  if (city === "bangalore") return "bengaluru";
  if (city === "gurgaon") return "gurugram";
  return city;
}

export function detectLocality(text: string): string | undefined {
  const lower = text.toLowerCase();
  return SUPPORTED_LOCALITIES.find((item) => lower.includes(item));
}

export function detectBedrooms(text: string): number | undefined {
  const lower = text.toLowerCase();
  const byBhk = lower.match(/(\d+)\s*bhk/);
  if (byBhk) return Number(byBhk[1]);

  const byBed = lower.match(/(\d+)\s*bed(?:room)?s?/);
  if (byBed) return Number(byBed[1]);

  return undefined;
}

export function detectAreaMin(text: string): number | undefined {
  const lower = text.toLowerCase();
  const area = lower.match(/(?:min(?:imum)?|at least|above)\s*(\d{3,5})\s*(?:sq ?ft|sqft|ft)/);
  if (area) return Number(area[1]);
  return undefined;
}

export function detectTransaction(text: string): "buy" | "rent" {
  const lower = text.toLowerCase();
  if (/\brent\b|\blease\b|\brental\b/.test(lower)) return "rent";
  return "buy";
}

export function detectPropertyType(
  text: string
): "apartment" | "villa" | "plot" | "commercial" | undefined {
  const lower = text.toLowerCase();
  if (/\bvilla\b/.test(lower)) return "villa";
  if (/\bplot\b|\bland\b/.test(lower)) return "plot";
  if (/\bcommercial\b|\boffice\b|\bshop\b/.test(lower)) return "commercial";
  if (/\bflat\b|\bapartment\b|\bcondo\b/.test(lower)) return "apartment";
  return undefined;
}

export function detectUrgency(text: string): "low" | "medium" | "high" {
  const lower = text.toLowerCase();
  if (/\bimmediate\b|\burgent\b|\basap\b|\bthis week\b/.test(lower)) return "high";
  if (/\bthis month\b|\bsoon\b|\bnext 2 weeks\b/.test(lower)) return "medium";
  return "low";
}

export function detectBudget(text: string): MoneyRange {
  const lower = text.toLowerCase();
  const directRange = lower.match(
    /(?:budget|between|range|from)\s*(?:of\s*)?([\d.,]+)\s*(cr|crore|lakhs?|lacs?|k|thousand)?\s*(?:to|-|and)\s*([\d.,]+)\s*(cr|crore|lakhs?|lacs?|k|thousand)?/
  );

  if (directRange) {
    const min = moneyToInr(directRange[1], directRange[2]);
    const max = moneyToInr(directRange[3], directRange[4]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max)
      };
    }
  }

  const under = lower.match(/(?:under|max|maximum|upto|up to)\s*([\d.,]+)\s*(cr|crore|lakhs?|lacs?|k|thousand)?/);
  if (under) {
    return { max: moneyToInr(under[1], under[2]) };
  }

  const above = lower.match(/(?:above|min|minimum|at least)\s*([\d.,]+)\s*(cr|crore|lakhs?|lacs?|k|thousand)?/);
  if (above) {
    return { min: moneyToInr(above[1], above[2]) };
  }

  const generic = lower.match(/(?:rs\.?|inr)?\s*([\d.,]+)\s*(cr|crore|lakhs?|lacs?|k|thousand)?/);
  if (generic) {
    const value = moneyToInr(generic[1], generic[2]);
    return { min: value * 0.9, max: value * 1.1 };
  }

  return {};
}

function moneyToInr(raw: string, unit?: string): number {
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  const normalizedUnit = (unit || "").toLowerCase();
  if (normalizedUnit === "cr" || normalizedUnit === "crore") return Math.round(numeric * 10000000);
  if (normalizedUnit.startsWith("lac") || normalizedUnit.startsWith("lakh")) return Math.round(numeric * 100000);
  if (normalizedUnit === "k" || normalizedUnit === "thousand") return Math.round(numeric * 1000);
  if (!normalizedUnit && numeric < 1000) {
    return Math.round(numeric * 100000);
  }
  return Math.round(numeric);
}

export function formatInr(value: number): string {
  if (value >= 10000000) return `INR ${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `INR ${(value / 100000).toFixed(1)} L`;
  return `INR ${value.toLocaleString("en-IN")}`;
}

