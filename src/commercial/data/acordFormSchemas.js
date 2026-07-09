// =============================================================================
// ACORD FORM SCHEMAS
// =============================================================================
// Defines the visual layout and field definitions for each ACORD form.
// Used by acordGenerator.js to render PDF output.
// Phase 2 will implement full PDF generation; this file provides the schema.
// =============================================================================

// ACORD 125 — Commercial Insurance Application
export const ACORD_125_SCHEMA = {
  formNumber: "125",
  formTitle: "COMMERCIAL INSURANCE APPLICATION",
  revision: "2016/03",
  sections: [
    {
      id: "agency",
      title: "Agency Information",
      fields: [
        { id: "agencyName",    label: "Agency",            type: "text",   width: "full" },
        { id: "agencyAddress",  label: "Address",           type: "text",   width: "full" },
        { id: "contactName",    label: "Contact Name",      type: "text",   width: "half" },
        { id: "phone",          label: "Phone",             type: "text",   width: "quarter" },
        { id: "fax",            label: "Fax",               type: "text",   width: "quarter" },
        { id: "email",          label: "Email",             type: "text",   width: "half" },
      ],
    },
    {
      id: "applicant",
      title: "Applicant Information",
      fields: [
        { id: "namedInsured",       label: "Named Insured",         type: "text",     width: "full" },
        { id: "dba",                label: "DBA",                   type: "text",     width: "full" },
        { id: "mailingAddress",     label: "Mailing Address",       type: "address",  width: "full" },
        { id: "physicalAddress",    label: "Location Address",      type: "address",  width: "full" },
        { id: "fein",              label: "FEIN",                  type: "text",     width: "third" },
        { id: "entityType",        label: "Legal Entity",          type: "select",   width: "third",
          options: ["Individual", "Partnership", "Corporation", "LLC", "Joint Venture", "Trust", "Other"] },
        { id: "dateBusinessStarted",label: "Date Business Started", type: "date",     width: "third" },
        { id: "sicCode",           label: "SIC Code",              type: "text",     width: "quarter" },
        { id: "naicsCode",         label: "NAICS Code",            type: "text",     width: "quarter" },
        { id: "employeesFT",       label: "# Employees (FT)",      type: "number",   width: "quarter" },
        { id: "employeesPT",       label: "# Employees (PT)",      type: "number",   width: "quarter" },
        { id: "annualRevenue",     label: "Annual Gross Revenue",   type: "currency", width: "third" },
        { id: "descOfOps",         label: "Description of Operations", type: "textarea", width: "full" },
      ],
    },
    {
      id: "contactInfo",
      title: "Contact Information",
      fields: [
        { id: "contactName",    label: "Contact Name",    type: "text",  width: "half" },
        { id: "contactTitle",   label: "Title",           type: "text",  width: "half" },
        { id: "contactPhone",   label: "Phone",           type: "text",  width: "third" },
        { id: "contactEmail",   label: "Email",           type: "text",  width: "third" },
      ],
    },
    {
      id: "coverage",
      title: "Coverage Requested",
      fields: [
        { id: "proposedEffDate",   label: "Proposed Effective Date",   type: "date",  width: "half" },
        { id: "proposedExpDate",   label: "Proposed Expiration Date",  type: "date",  width: "half" },
        { id: "coverageGL",        label: "General Liability",         type: "checkbox" },
        { id: "coverageProperty",  label: "Property",                  type: "checkbox" },
        { id: "coverageAuto",      label: "Automobile",                type: "checkbox" },
        { id: "coverageWC",        label: "Workers Compensation",      type: "checkbox" },
        { id: "coverageUmbrella",  label: "Umbrella/Excess",           type: "checkbox" },
        { id: "coverageBOP",       label: "Business Owners Policy",    type: "checkbox" },
      ],
    },
  ],
};

// ACORD 126 — Commercial General Liability Section
export const ACORD_126_SCHEMA = {
  formNumber: "126",
  formTitle: "COMMERCIAL GENERAL LIABILITY SECTION",
  revision: "2016/03",
  sections: [
    {
      id: "limits",
      title: "Limits of Insurance",
      fields: [
        { id: "eachOccurrence",    label: "Each Occurrence",          type: "currency",  width: "half" },
        { id: "generalAggregate",  label: "General Aggregate",       type: "currency",  width: "half" },
        { id: "productsAggregate", label: "Products-Comp/Op Agg",    type: "currency",  width: "half" },
        { id: "personalAdvInjury", label: "Personal & Adv Injury",   type: "currency",  width: "half" },
        { id: "fireDamage",       label: "Fire Damage",             type: "currency",  width: "half" },
        { id: "medExpense",       label: "Med Exp (Any one person)", type: "currency",  width: "half" },
      ],
    },
    {
      id: "classification",
      title: "Classification",
      fields: [
        { id: "classCode",        label: "Class Code",               type: "text",     width: "quarter" },
        { id: "classDescription",  label: "Classification",          type: "text",     width: "half" },
        { id: "premiumBasis",      label: "Premium Basis",           type: "text",     width: "quarter" },
      ],
    },
  ],
};

// ACORD 130 — Workers Compensation Application
export const ACORD_130_SCHEMA = {
  formNumber: "130",
  formTitle: "WORKERS COMPENSATION APPLICATION",
  revision: "2014/01",
  sections: [
    {
      id: "stateInfo",
      title: "State Information",
      fields: [
        { id: "state",           label: "State",                   type: "text",     width: "quarter" },
        { id: "ncciState",       label: "NCCI State",              type: "checkbox" },
      ],
    },
    {
      id: "classCodes",
      title: "Classification / Payroll",
      repeating: true,
      fields: [
        { id: "classCode",      label: "Class Code",              type: "text",     width: "quarter" },
        { id: "description",     label: "Description",             type: "text",     width: "half" },
        { id: "numEmployees",    label: "# Employees",             type: "number",   width: "eighth" },
        { id: "payroll",         label: "Annual Payroll",          type: "currency", width: "quarter" },
      ],
    },
    {
      id: "experience",
      title: "Experience Information",
      fields: [
        { id: "experienceMod",  label: "Experience Modification",  type: "text",     width: "quarter" },
        { id: "priorCarrier",   label: "Prior Carrier",            type: "text",     width: "half" },
      ],
    },
  ],
};

export const ALL_SCHEMAS = {
  "125": ACORD_125_SCHEMA,
  "126": ACORD_126_SCHEMA,
  "130": ACORD_130_SCHEMA,
};
