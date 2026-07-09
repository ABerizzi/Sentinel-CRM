// =============================================================================
// ACORD FORM PDF GENERATOR — Stub for Phase 2
// =============================================================================
// This module will handle PDF generation for ACORD forms.
// Phase 2 will implement:
//   - pdf-lib or jsPDF rendering
//   - ACORD form visual layout matching
//   - Field population from CRM data via acordFieldMap.js
//   - Print-ready PDF export
//
// For Phase 1, this file provides the API surface and data flow.
// =============================================================================

import { ALL_ACORD_FORMS, resolveFieldPath } from "../data/acordFieldMap.js";
import AGENCY_CONFIG from "../data/agencyConfig.js";

/**
 * Generate populated field data for an ACORD form.
 * This extracts all mapped values from the CRM data context.
 *
 * @param {string} formName - e.g. "ACORD 125"
 * @param {object} dataContext - { account, agency, submission }
 * @returns {object} { formName, fields: { fieldId: { label, value, path } } }
 */
export function populateFormFields(formName, dataContext) {
  const mapping = ALL_ACORD_FORMS[formName];
  if (!mapping) return { formName, fields: {} };

  // Merge agency config into context
  const ctx = {
    ...dataContext,
    agency: dataContext.agency || AGENCY_CONFIG,
  };

  const fields = {};
  for (const [fieldId, config] of Object.entries(mapping)) {
    const value = resolveFieldPath(ctx, config.path);
    fields[fieldId] = {
      label: config.label,
      value: value ?? "",
      path: config.path,
      required: config.required,
      isEmpty: value === undefined || value === null || value === "" ||
        (Array.isArray(value) && value.length === 0),
    };
  }

  return { formName, fields };
}

/**
 * Generate an ACORD form as a printable HTML string.
 * Phase 2 will replace this with actual PDF generation via pdf-lib.
 *
 * @param {string} formName
 * @param {object} dataContext
 * @returns {string} HTML string for print preview
 */
export function generateFormHTML(formName, dataContext) {
  const { fields } = populateFormFields(formName, dataContext);

  // TODO: Phase 2 — Replace with actual ACORD form layout rendering
  // For now, generate a simple preview table
  let html = `
    <style>
      @media print { body { margin: 0; } @page { size: letter; margin: 0.5in; } }
      body { font-family: Arial, sans-serif; font-size: 10pt; }
      .header { text-align: center; padding: 10px; border-bottom: 2px solid #000; margin-bottom: 10px; }
      .header h1 { font-size: 16pt; margin: 0; }
      .header h2 { font-size: 11pt; margin: 4px 0 0; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td { padding: 4px 8px; border: 1px solid #ccc; vertical-align: top; }
      .label { font-size: 8pt; color: #666; text-transform: uppercase; }
      .value { font-size: 10pt; min-height: 14px; }
      .missing { color: #cc0000; font-style: italic; }
    </style>
    <div class="header">
      <h1>${formName}</h1>
      <h2>${formName === "ACORD 125" ? "COMMERCIAL INSURANCE APPLICATION" : formName}</h2>
    </div>
    <table>
  `;

  for (const [fieldId, field] of Object.entries(fields)) {
    html += `
      <tr>
        <td style="width: 30%"><span class="label">${field.label}</span></td>
        <td><span class="value ${field.isEmpty && field.required ? 'missing' : ''}">${
          field.isEmpty ? (field.required ? '[REQUIRED - MISSING]' : '') : String(field.value)
        }</span></td>
      </tr>
    `;
  }

  html += '</table>';
  return html;
}

/**
 * Phase 2: Generate PDF using pdf-lib
 * @param {string} formName
 * @param {object} dataContext
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function generateFormPDF(formName, dataContext) {
  // TODO: Phase 2 implementation
  // 1. Load blank ACORD PDF template (if available) or create layout with pdf-lib
  // 2. Map fields from populateFormFields() to PDF form fields or coordinates
  // 3. Return PDF bytes for download
  throw new Error(`PDF generation not yet implemented. Coming in Phase 2. Use generateFormHTML() for preview.`);
}
