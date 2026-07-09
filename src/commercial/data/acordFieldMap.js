// =============================================================================
// ACORD FIELD MAPPING ENGINE
// =============================================================================
// This is the single source of truth for mapping CRM data fields to ACORD form fields.
// Every field that appears on an ACORD form has a corresponding structured field in the CRM.
//
// Structure: ACORD_FORM.fieldName → CRM data path
// The mapping is used by:
//   1. acordGenerator.js — to populate ACORD forms from CRM data
//   2. acordValidator.js — to check for missing required fields before generation
//
// When adding new fields to the CRM data model, update this mapping file simultaneously.
// =============================================================================

// ---------------------------------------------------------------------------
// ACORD 125 — Commercial Insurance Application (Universal)
// Used for every commercial submission
// ---------------------------------------------------------------------------
export const ACORD_125 = {
  // Section: Agency / Producer
  producerName:           { path: "agency.agencyName",                   label: "Producer Name",                required: true  },
  producerPhone:          { path: "agency.agencyPhone",                  label: "Producer Phone",               required: true  },
  producerFax:            { path: "agency.agencyFax",                    label: "Producer Fax",                 required: false },
  producerEmail:          { path: "agency.agencyEmail",                  label: "Producer Email",               required: false },
  producerAddress:        { path: "agency.agencyAddress.street",         label: "Producer Address",             required: true  },
  producerCity:           { path: "agency.agencyAddress.city",           label: "Producer City",                required: true  },
  producerState:          { path: "agency.agencyAddress.state",          label: "Producer State",               required: true  },
  producerZip:            { path: "agency.agencyAddress.zip",            label: "Producer ZIP",                 required: true  },
  producerContactName:    { path: "agency.defaultProducer",              label: "Contact Name",                 required: false },

  // Section I: Named Insured
  namedInsured:           { path: "account.businessName",                label: "Named Insured",                required: true  },
  dba:                    { path: "account.dba",                         label: "DBA",                          required: false },
  mailingAddress:         { path: "account.mailingAddress.street",       label: "Mailing Address",              required: true  },
  mailingCity:            { path: "account.mailingAddress.city",         label: "Mailing City",                 required: true  },
  mailingState:           { path: "account.mailingAddress.state",        label: "Mailing State",                required: true  },
  mailingZip:             { path: "account.mailingAddress.zip",          label: "Mailing ZIP",                  required: true  },
  mailingCounty:          { path: "account.mailingAddress.county",       label: "Mailing County",               required: false },
  physicalAddress:        { path: "account.physicalAddress.street",      label: "Physical Address",             required: false },
  physicalCity:           { path: "account.physicalAddress.city",        label: "Physical City",                required: false },
  physicalState:          { path: "account.physicalAddress.state",       label: "Physical State",               required: false },
  physicalZip:            { path: "account.physicalAddress.zip",         label: "Physical ZIP",                 required: false },
  fein:                   { path: "account.fein",                        label: "FEIN",                         required: true  },
  entityType:             { path: "account.entityType",                  label: "Legal Entity",                 required: true  },
  sicCode:                { path: "account.sicCode",                     label: "SIC Code",                     required: true  },
  naicsCode:              { path: "account.naicsCode",                   label: "NAICS Code",                   required: false },
  dateBusinessStarted:    { path: "account.dateEstablished",             label: "Date Business Started",        required: true  },
  yearsInBusiness:        { path: "account.yearsInBusiness",             label: "Years in Business",            required: false },
  descriptionOfOps:       { path: "account.industryDescription",         label: "Description of Operations",    required: true  },
  phone:                  { path: "account.primaryContact.phone",        label: "Applicant Phone",              required: true  },
  email:                  { path: "account.primaryContact.email",        label: "Applicant Email",              required: false },
  contactName:            { path: "account.primaryContact.name",         label: "Contact Name",                 required: true  },
  contactTitle:           { path: "account.primaryContact.title",        label: "Contact Title",                required: false },
  employeesFT:            { path: "account.employeesFT",                 label: "Full-Time Employees",          required: false },
  employeesPT:            { path: "account.employeesPT",                 label: "Part-Time Employees",          required: false },
  annualGrossRevenue:     { path: "account.annualGrossRevenue",          label: "Annual Gross Revenue",         required: false },

  // Section: Proposed Effective/Expiration
  proposedEffDate:        { path: "submission.effectiveDate",            label: "Proposed Effective Date",      required: true  },
  proposedExpDate:        { path: "submission.expirationDate",           label: "Proposed Expiration Date",     required: true  },

  // Section: Coverage Requested (checkboxes)
  coverageGL:             { path: "submission.linesOfBusiness",          label: "General Liability",            required: false, check: (v) => v?.includes("GL") },
  coverageProperty:       { path: "submission.linesOfBusiness",          label: "Property",                     required: false, check: (v) => v?.includes("Property") },
  coverageAuto:           { path: "submission.linesOfBusiness",          label: "Commercial Auto",              required: false, check: (v) => v?.includes("Commercial Auto") },
  coverageWC:             { path: "submission.linesOfBusiness",          label: "Workers Comp",                 required: false, check: (v) => v?.includes("Workers Comp") },
  coverageUmbrella:       { path: "submission.linesOfBusiness",          label: "Umbrella/Excess",              required: false, check: (v) => v?.includes("Umbrella") },
  coverageBOP:            { path: "submission.linesOfBusiness",          label: "BOP",                          required: false, check: (v) => v?.includes("BOP") },
};

// ---------------------------------------------------------------------------
// ACORD 126 — Commercial General Liability Section
// ---------------------------------------------------------------------------
export const ACORD_126 = {
  // Limits
  eachOccurrenceLimit:    { path: "submission.gl.eachOccurrenceLimit",   label: "Each Occurrence Limit",        required: true  },
  generalAggregateLimit:  { path: "submission.gl.generalAggregateLimit", label: "General Aggregate Limit",      required: true  },
  productsAggregateLimit: { path: "submission.gl.productsAggregateLimit",label: "Products Aggregate Limit",     required: true  },
  personalAdvInjury:      { path: "submission.gl.personalAdvInjury",     label: "Personal & Adv Injury",        required: true  },
  fireDamageLimit:        { path: "submission.gl.fireDamageLimit",       label: "Fire Damage Limit",            required: false },
  medExpLimit:            { path: "submission.gl.medExpLimit",           label: "Medical Expense Limit",        required: false },
  deductible:             { path: "submission.gl.deductible",            label: "Deductible",                   required: false },

  // UW Questions
  opsDescription:         { path: "submission.gl.opsDescription",        label: "Description of Operations",    required: true  },
  subcontractorsUsed:     { path: "submission.gl.subcontractorsUsed",    label: "Subcontractors Used (Y/N)",    required: true  },
  subcontractorPct:       { path: "submission.gl.subcontractorPct",      label: "% Subcontracted",              required: false },
  priorLosses:            { path: "submission.gl.priorLosses",           label: "Prior Losses (3yr)",           required: true  },
  additionalInsuredsNeeded: { path: "submission.gl.additionalInsuredsNeeded", label: "Additional Insureds Needed", required: false },
  claimsMadeTrigger:      { path: "submission.gl.claimsMadeTrigger",     label: "Claims Made / Occurrence",     required: true  },
};

// ---------------------------------------------------------------------------
// ACORD 130 — Workers Compensation Application
// ---------------------------------------------------------------------------
export const ACORD_130 = {
  // State Info
  state:                  { path: "submission.wc.state",                 label: "State",                        required: true  },
  ncciState:              { path: "submission.wc.ncciState",             label: "NCCI State",                   required: false },

  // Class Codes & Payroll (array fields — indexed)
  classCodes:             { path: "submission.wc.classCodes",            label: "Class Codes",                  required: true,  isArray: true },
  // Each element: { code, description, payroll, numEmployees }
  // classCodes[n].code       → ACORD 130 Class Code field
  // classCodes[n].description → ACORD 130 Class Description
  // classCodes[n].payroll    → ACORD 130 Payroll per class
  // classCodes[n].numEmployees → ACORD 130 # Employees per class

  totalPayroll:           { path: "account.totalPayroll",                label: "Total Annual Payroll",         required: true  },
  experienceMod:          { path: "submission.wc.experienceMod",         label: "Experience Modification",      required: true  },
  priorCarrier:           { path: "submission.wc.priorCarrier",          label: "Prior Carrier",                required: true  },
  lossRuns3yr:            { path: "submission.wc.lossRuns3yr",           label: "Loss Runs (3 Years)",          required: true  },

  employeesFT:            { path: "account.employeesFT",                 label: "Full-Time Employees",          required: true  },
  employeesPT:            { path: "account.employeesPT",                 label: "Part-Time Employees",          required: false },
};

// ---------------------------------------------------------------------------
// ACORD 131 — Umbrella / Excess Application
// ---------------------------------------------------------------------------
export const ACORD_131 = {
  limitsRequested:        { path: "submission.umbrella.limitsRequested",  label: "Limits Requested",             required: true  },
  retention:              { path: "submission.umbrella.retention",        label: "Self-Insured Retention",       required: false },
  underlyingSchedule:     { path: "submission.umbrella.underlyingSchedule", label: "Underlying Schedule",        required: true, isArray: true },
  // Each element: { carrier, policyNumber, lob, limits, effectiveDate, expirationDate }
};

// ---------------------------------------------------------------------------
// ACORD 137 — Commercial Auto Section
// ---------------------------------------------------------------------------
export const ACORD_137 = {
  // Vehicle Schedule (array)
  vehicles:               { path: "submission.commercialAuto.vehicles",  label: "Vehicle Schedule",             required: true, isArray: true },
  // Each element: { year, make, model, vin, garagingZip, costNew, vehicleType }

  // Driver List (array)
  drivers:                { path: "submission.commercialAuto.drivers",   label: "Driver List",                  required: true, isArray: true },
  // Each element: { name, dob, licenseNumber, licenseState, yearsExperience, mvrStatus }

  radiusOfOps:            { path: "submission.commercialAuto.radiusOfOps",     label: "Radius of Operations",   required: true  },
  cargoDescription:       { path: "submission.commercialAuto.cargoDescription",label: "Cargo Description",      required: false },

  // Limits
  liabilityLimit:         { path: "submission.commercialAuto.liabilityLimit",  label: "Liability Limit",        required: true  },
  umLimit:                { path: "submission.commercialAuto.umLimit",         label: "UM/UIM Limit",           required: false },
  medPayLimit:            { path: "submission.commercialAuto.medPayLimit",     label: "Medical Payments",       required: false },
  compDeductible:         { path: "submission.commercialAuto.compDeductible",  label: "Comp Deductible",        required: false },
  collDeductible:         { path: "submission.commercialAuto.collDeductible",  label: "Collision Deductible",   required: false },
};

// ---------------------------------------------------------------------------
// ACORD 140 — Property Section
// ---------------------------------------------------------------------------
export const ACORD_140 = {
  // Building Info (array — one entry per location)
  locations:              { path: "submission.property.locations",        label: "Locations",                    required: true, isArray: true },
  // Each element: { address, city, state, zip, occupancy, constructionType, sqFootage,
  //                 yearBuilt, stories, buildingValue, contentsValue, bppValue,
  //                 lossOfIncomeLimit, alarmType, sprinklered }

  buildingValuation:      { path: "submission.property.buildingValuation",   label: "Building Valuation Method", required: false },
  blanketCoverage:        { path: "submission.property.blanketCoverage",     label: "Blanket Coverage (Y/N)",   required: false },
  coinsurance:            { path: "submission.property.coinsurance",         label: "Coinsurance %",            required: false },
  deductible:             { path: "submission.property.deductible",          label: "Property Deductible",      required: false },
  windHailDeductible:     { path: "submission.property.windHailDeductible",  label: "Wind/Hail Deductible",     required: false },
  floodCoverage:          { path: "submission.property.floodCoverage",       label: "Flood Coverage (Y/N)",     required: false },
  eqCoverage:             { path: "submission.property.eqCoverage",          label: "Earthquake Coverage",      required: false },
};

// ---------------------------------------------------------------------------
// ACORD 75 — Surplus Lines Insurance Disclosure
// Used for E&S/wholesale placements (AmWINS, etc.)
// ---------------------------------------------------------------------------
export const ACORD_75 = {
  namedInsured:           { path: "account.businessName",                label: "Named Insured",                required: true  },
  surplusLinesInsurer:    { path: "submission.surplusLines.insurerName", label: "Surplus Lines Insurer",        required: true  },
  surplusLinesLicense:    { path: "submission.surplusLines.licenseNumber", label: "Surplus Lines License #",    required: false },
  policyType:             { path: "submission.surplusLines.policyType",  label: "Type of Insurance",            required: true  },
  premiumAmount:          { path: "submission.surplusLines.premiumAmount", label: "Premium Amount",             required: true  },
  surplusLinesTax:        { path: "submission.surplusLines.taxAmount",   label: "Surplus Lines Tax",            required: false },
  effectiveDate:          { path: "submission.effectiveDate",            label: "Effective Date",               required: true  },
  expirationDate:         { path: "submission.expirationDate",           label: "Expiration Date",              required: true  },
};

// ---------------------------------------------------------------------------
// Helper: Resolve a dotted path from nested data objects
// ---------------------------------------------------------------------------
export function resolveFieldPath(dataContext, path) {
  if (!path || !dataContext) return undefined;
  const parts = path.split(".");
  let current = dataContext;
  for (const part of parts) {
    if (current == null) return undefined;
    // Handle array index notation like classCodes[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]];
      if (Array.isArray(current)) current = current[parseInt(arrayMatch[2])];
      else return undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Helper: Validate completeness for a given ACORD form
// Returns { complete: boolean, missing: [{ field, label }], filled: number, total: number }
// ---------------------------------------------------------------------------
export function validateAcordForm(formMapping, dataContext) {
  const missing = [];
  let filled = 0;
  let total = 0;

  for (const [field, config] of Object.entries(formMapping)) {
    if (!config.required) continue;
    total++;
    const value = resolveFieldPath(dataContext, config.path);
    const isEmpty = value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      missing.push({ field, label: config.label, path: config.path });
    } else {
      filled++;
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    filled,
    total,
    percentage: total > 0 ? Math.round((filled / total) * 100) : 100,
  };
}

// Export all form mappings as a single object for convenience
export const ALL_ACORD_FORMS = {
  "ACORD 125": ACORD_125,
  "ACORD 126": ACORD_126,
  "ACORD 130": ACORD_130,
  "ACORD 131": ACORD_131,
  "ACORD 137": ACORD_137,
  "ACORD 140": ACORD_140,
  "ACORD 75":  ACORD_75,
};
