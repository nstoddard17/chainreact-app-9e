import type { FieldOption } from "@/contracts/actionMeta";

/**
 * Fixed, enumerable option sets for the Motive fuel actions — MOTIVE-1.
 *
 * These are static provider enums (fuel type, unit, currency) and a fixed
 * IFTA-jurisdiction list (US states + DC + Canadian provinces). They are `options`
 * on the field — NOT option resolvers — because the set never changes per account.
 */

export const FUEL_TYPE_OPTIONS: readonly FieldOption[] = [
  { value: "diesel", label: "Diesel" },
  { value: "gasoline", label: "Gasoline" },
  { value: "propane", label: "Propane" },
  { value: "lng", label: "LNG" },
  { value: "cng", label: "CNG" },
  { value: "ethanol", label: "Ethanol" },
  { value: "methanol", label: "Methanol" },
  { value: "e85", label: "E-85" },
  { value: "m85", label: "M-85" },
  { value: "a55", label: "A55" },
  { value: "biodiesel", label: "Biodiesel" },
  { value: "other", label: "Other" },
];

export const FUEL_UNIT_OPTIONS: readonly FieldOption[] = [
  { value: "gal", label: "Gallons (gal)" },
  { value: "ltr", label: "Liters (ltr)" },
];

export const CURRENCY_OPTIONS: readonly FieldOption[] = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
];

export const ODOMETER_UNIT_OPTIONS: readonly FieldOption[] = [
  { value: "MI", label: "Miles (MI)" },
  { value: "KM", label: "Kilometers (KM)" },
];

/** IFTA jurisdictions: US states + DC + Canadian provinces (fixed set). */
export const JURISDICTION_OPTIONS: readonly FieldOption[] = [
  { value: "AL", label: "Alabama (AL)" },
  { value: "AK", label: "Alaska (AK)" },
  { value: "AZ", label: "Arizona (AZ)" },
  { value: "AR", label: "Arkansas (AR)" },
  { value: "CA", label: "California (CA)" },
  { value: "CO", label: "Colorado (CO)" },
  { value: "CT", label: "Connecticut (CT)" },
  { value: "DE", label: "Delaware (DE)" },
  { value: "DC", label: "District of Columbia (DC)" },
  { value: "FL", label: "Florida (FL)" },
  { value: "GA", label: "Georgia (GA)" },
  { value: "HI", label: "Hawaii (HI)" },
  { value: "ID", label: "Idaho (ID)" },
  { value: "IL", label: "Illinois (IL)" },
  { value: "IN", label: "Indiana (IN)" },
  { value: "IA", label: "Iowa (IA)" },
  { value: "KS", label: "Kansas (KS)" },
  { value: "KY", label: "Kentucky (KY)" },
  { value: "LA", label: "Louisiana (LA)" },
  { value: "ME", label: "Maine (ME)" },
  { value: "MD", label: "Maryland (MD)" },
  { value: "MA", label: "Massachusetts (MA)" },
  { value: "MI", label: "Michigan (MI)" },
  { value: "MN", label: "Minnesota (MN)" },
  { value: "MS", label: "Mississippi (MS)" },
  { value: "MO", label: "Missouri (MO)" },
  { value: "MT", label: "Montana (MT)" },
  { value: "NE", label: "Nebraska (NE)" },
  { value: "NV", label: "Nevada (NV)" },
  { value: "NH", label: "New Hampshire (NH)" },
  { value: "NJ", label: "New Jersey (NJ)" },
  { value: "NM", label: "New Mexico (NM)" },
  { value: "NY", label: "New York (NY)" },
  { value: "NC", label: "North Carolina (NC)" },
  { value: "ND", label: "North Dakota (ND)" },
  { value: "OH", label: "Ohio (OH)" },
  { value: "OK", label: "Oklahoma (OK)" },
  { value: "OR", label: "Oregon (OR)" },
  { value: "PA", label: "Pennsylvania (PA)" },
  { value: "RI", label: "Rhode Island (RI)" },
  { value: "SC", label: "South Carolina (SC)" },
  { value: "SD", label: "South Dakota (SD)" },
  { value: "TN", label: "Tennessee (TN)" },
  { value: "TX", label: "Texas (TX)" },
  { value: "UT", label: "Utah (UT)" },
  { value: "VT", label: "Vermont (VT)" },
  { value: "VA", label: "Virginia (VA)" },
  { value: "WA", label: "Washington (WA)" },
  { value: "WV", label: "West Virginia (WV)" },
  { value: "WI", label: "Wisconsin (WI)" },
  { value: "WY", label: "Wyoming (WY)" },
  { value: "AB", label: "Alberta (AB)" },
  { value: "BC", label: "British Columbia (BC)" },
  { value: "MB", label: "Manitoba (MB)" },
  { value: "NB", label: "New Brunswick (NB)" },
  { value: "NL", label: "Newfoundland and Labrador (NL)" },
  { value: "NS", label: "Nova Scotia (NS)" },
  { value: "NT", label: "Northwest Territories (NT)" },
  { value: "NU", label: "Nunavut (NU)" },
  { value: "ON", label: "Ontario (ON)" },
  { value: "PE", label: "Prince Edward Island (PE)" },
  { value: "QC", label: "Quebec (QC)" },
  { value: "SK", label: "Saskatchewan (SK)" },
  { value: "YT", label: "Yukon (YT)" },
];

/** Value sets for the runtime schemas (`z.enum`). */
export const FUEL_TYPE_VALUES = FUEL_TYPE_OPTIONS.map((o) => o.value);
export const FUEL_UNIT_VALUES = FUEL_UNIT_OPTIONS.map((o) => o.value);
export const CURRENCY_VALUES = CURRENCY_OPTIONS.map((o) => o.value);
export const ODOMETER_UNIT_VALUES = ODOMETER_UNIT_OPTIONS.map((o) => o.value);
export const JURISDICTION_VALUES = JURISDICTION_OPTIONS.map((o) => o.value);
