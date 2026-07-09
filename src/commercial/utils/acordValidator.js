// =============================================================================
// ACORD FORM VALIDATOR — Pre-flight completeness checker
// =============================================================================
// Validates that all required fields for a given ACORD form are populated
// in the CRM data before allowing generation.
//
// Usage:
//   import { preflightCheck } from './acordValidator.js';
//   const result = preflightCheck("ACORD 125", { account, agency, submission });
//   // result.ready: boolean
//   // result.missing: [{ field, label, path, section }]
//   // result.warnings: [{ field, label, message }]
// =============================================================================

import { ALL_ACORD_FORMS, validateAcordForm } from "../data/acordFieldMap.js";

/**
 * Run a pre-flight check for a specific ACORD form.
 * @param {string} formName - e.g. "ACORD 125", "ACORD 130"
 * @param {object} dataContext - { account, agency, submission }
 * @returns {object} { ready, missing, warnings, filled, total, percentage }
 */
export function preflightCheck(formName, dataContext) {
  const mapping = ALL_ACORD_FORMS[formName];
  if (!mapping) {
    return {
      ready: false,
      missing: [],
      warnings: [{ field: "form", label: formName, message: `Unknown form: ${formName}` }],
      filled: 0,
      total: 0,
      percentage: 0,
    };
  }

  const result = validateAcordForm(mapping, dataContext);
  const warnings = [];

  // Add contextual warnings
  // TODO: Phase 2 — add per-form business logic warnings
  // e.g., WC without class codes, Auto without vehicles, etc.

  return {
    ready: result.complete,
    missing: result.missing,
    warnings,
    filled: result.filled,
    total: result.total,
    percentage: result.percentage,
  };
}

/**
 * Run pre-flight checks for ALL relevant ACORD forms for a given account/submission.
 * @param {object} dataContext - { account, agency, submission }
 * @param {string[]} linesOfBusiness - Coverage lines requested
 * @returns {object[]} Array of { formName, ...preflightResult }
 */
export function preflightCheckAll(dataContext, linesOfBusiness = []) {
  const forms = ["ACORD 125"]; // Always check 125

  // Add LOB-specific forms
  if (linesOfBusiness.includes("GL") || linesOfBusiness.includes("BOP")) {
    forms.push("ACORD 126");
  }
  if (linesOfBusiness.includes("Workers Comp")) {
    forms.push("ACORD 130");
  }
  if (linesOfBusiness.includes("Umbrella")) {
    forms.push("ACORD 131");
  }
  if (linesOfBusiness.includes("Commercial Auto")) {
    forms.push("ACORD 137");
  }
  if (linesOfBusiness.includes("Property") || linesOfBusiness.includes("BOP")) {
    forms.push("ACORD 140");
  }

  return forms.map(formName => ({
    formName,
    ...preflightCheck(formName, dataContext),
  }));
}
