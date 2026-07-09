import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AGENCY_CONFIG from "./data/agencyConfig.js";
import { ACORD_125, validateAcordForm, resolveFieldPath, ALL_ACORD_FORMS } from "./data/acordFieldMap.js";

// =============================================================================
// COMMERCIAL LINES CRM MODULE — Phase 1
// =============================================================================
// This module provides:
//   - Commercial account management (ACORD-mapped data model)
//   - Multi-step intake wizard
//   - Account list with search/filter
//   - Pipeline board (basic)
//   - Integration scaffold for ACORD generation (Phase 2)
// =============================================================================

// ==================== CONSTANTS ====================
const COMMERCIAL_STORE_KEY = "sentinel-commercial-data";

const ENTITY_TYPES = [
  "Sole Proprietorship", "Partnership", "LLC", "Corporation",
  "S-Corporation", "Non-Profit", "Joint Venture", "Trust", "Government",
];

const ACCOUNT_STATUSES = ["Prospect", "Active", "Lapsed", "Lost"];

const PIPELINE_STAGES = [
  { id: "new_lead",         label: "New Lead",          color: "#6366f1" },
  { id: "intake_complete",  label: "Intake Complete",   color: "#3b82f6" },
  { id: "submission_out",   label: "Submission Out",    color: "#f59e0b" },
  { id: "quoted",           label: "Quoted",            color: "#8b5cf6" },
  { id: "proposal_sent",    label: "Proposal Sent",     color: "#ec4899" },
  { id: "bound",            label: "Bound",             color: "#10b981" },
  { id: "lost",             label: "Lost",              color: "#ef4444" },
  { id: "ntu",              label: "NTU",               color: "#6b7280" },
];

const COVERAGE_OPTIONS = [
  { id: "GL",              label: "General Liability",       icon: "GL" },
  { id: "BOP",             label: "Business Owners Policy",  icon: "BP" },
  { id: "Workers Comp",    label: "Workers Compensation",    icon: "WC" },
  { id: "Commercial Auto", label: "Commercial Auto",         icon: "CA" },
  { id: "Umbrella",        label: "Umbrella / Excess",       icon: "UE" },
  { id: "Property",        label: "Commercial Property",     icon: "CP" },
  { id: "Cyber",           label: "Cyber Liability",         icon: "CY" },
  { id: "EPL",             label: "EPLI",                    icon: "EP" },
  { id: "E&O",             label: "Errors & Omissions",      icon: "EO" },
  { id: "D&O",             label: "Directors & Officers",    icon: "DO" },
  { id: "Inland Marine",   label: "Inland Marine",           icon: "IM" },
  { id: "Liquor",          label: "Liquor Liability",        icon: "LL" },
  { id: "Professional",    label: "Professional Liability",  icon: "PL" },
  { id: "Garage",          label: "Garage / Dealers",        icon: "GD" },
  { id: "Builders Risk",   label: "Builders Risk",           icon: "BR" },
];

const LEAD_SOURCES = [
  "Referral", "Web", "Walk-in", "Cold Call", "Marketing",
  "Cross-Sell", "Networking", "BNI", "Chamber", "Other",
];

const COMMERCIAL_NAV = [
  { id: "cl_dashboard",  label: "Dashboard",     icon: "\u25C9" },
  { id: "cl_accounts",   label: "Accounts",      icon: "\u25CE" },
  { id: "cl_pipeline",   label: "Pipeline",      icon: "\u25C8" },
  { id: "cl_submissions",label: "Submissions",   icon: "\u25A2" },
  { id: "cl_policies",   label: "Policies",      icon: "\u25C7" },
  { id: "cl_renewals",   label: "Renewals",      icon: "\u27F3" },
];

// ==================== HELPERS ====================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().split("T")[0];
const fmt = (d) => {
  if (!d) return "\u2014";
  const dt = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtCurrency = (n) => {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ==================== DATA PERSISTENCE ====================
async function loadCommercialData() {
  try {
    const result = await window.storage.get(COMMERCIAL_STORE_KEY);
    if (result && result.value) {
      return { data: JSON.parse(result.value), status: "loaded" };
    }
  } catch {}
  return { data: null, status: "empty" };
}

async function saveCommercialData(data) {
  try {
    await window.storage.set(COMMERCIAL_STORE_KEY, JSON.stringify(data));
  } catch (e) { console.error("[Sentinel Commercial] Save failed:", e); }
}

function createEmptyCommercialData() {
  return {
    accounts: [],
    submissions: [],
    policies: [],
    tasks: [],
    activities: [],
    notes: [],
  };
}

// ==================== EMPTY ACCOUNT TEMPLATE ====================
function createEmptyAccount() {
  return {
    id: uid(),

    // --- Business Info --- ACORD 125 Section I
    businessName: "",            // ACORD 125: Named Insured
    dba: "",                     // ACORD 125: DBA
    fein: "",                    // ACORD 125: FEIN
    entityType: "",              // ACORD 125: Legal Entity
    dateEstablished: "",         // ACORD 125: Date Business Started
    yearsInBusiness: "",         // ACORD 125: Years in Business

    // --- Addresses --- ACORD 125
    physicalAddress: { street: "", city: "", state: "FL", zip: "", county: "" },
    mailingAddress:  { street: "", city: "", state: "FL", zip: "", county: "" },
    mailingAddressSameAsPhysical: true,

    // --- Contacts --- ACORD 125
    primaryContact: { name: "", title: "", phone: "", email: "" },
    additionalContacts: [],   // Array of { id, name, title, phone, email, role }

    // --- Classification --- ACORD 125
    sicCode: "",                 // ACORD 125: SIC Code
    naicsCode: "",               // ACORD 125: NAICS Code
    industryDescription: "",     // ACORD 125: Description of Operations

    // --- Employee & Revenue --- ACORD 125 / 130
    employeesFT: "",             // ACORD 125: Full-Time Employees
    employeesPT: "",             // ACORD 125: Part-Time Employees
    annualGrossRevenue: "",      // ACORD 125 / 140: Annual Gross Revenue
    totalPayroll: "",            // ACORD 130: Total Annual Payroll

    // --- CRM Operational Fields ---
    website: "",
    socialProfiles: "",
    referredBy: "",
    leadSource: "",
    assignedProducer: AGENCY_CONFIG.defaultProducer || "",
    assignedCSR: AGENCY_CONFIG.defaultCSR || "",
    accountStatus: "Prospect",
    pipelineStage: "new_lead",

    // --- Coverage Needs ---
    coverageNeeds: [],           // Array of LOB strings from COVERAGE_OPTIONS

    // --- Current Coverage ---
    currentCoverage: [],         // Array of { lob, carrier, expirationDate, currentPremium, policyNumber }
    lossHistorySummary: "",

    // --- Documents ---
    documents: [],               // Array of { id, name, type, uploadDate, notes }

    // --- Notes / Activity ---
    notes: "",
    created: today(),
    lastModified: today(),
  };
}

// ==================== STYLES (matches existing S pattern) ====================
function makeStyles(COLORS) {
  return {
    app: { display: "flex", height: "100%", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", fontSize: 14, overflow: "hidden", position: "relative" },
    main: { flex: 1, overflow: "auto", padding: "24px 28px" },
    pageTitle: { fontSize: 22, fontWeight: 700, marginBottom: 20, letterSpacing: "-0.3px" },
    grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }),
    gridAuto: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
    card: { background: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 18, transition: "border-color 0.15s" },
    statCard: { background: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: "16px 18px" },
    statVal: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" },
    statLabel: { fontSize: 12, color: COLORS.textDim, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" },
    badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}20`, color }),
    btn: (variant = "primary") => ({
      padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
      background: variant === "primary" ? COLORS.accent : variant === "ghost" ? "transparent" : variant === "success" ? COLORS.success : variant === "danger" ? COLORS.danger : COLORS.card,
      color: variant === "primary" || variant === "success" || variant === "danger" ? "#fff" : COLORS.textDim,
      transition: "all 0.15s",
    }),
    input: { padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, outline: "none", width: "100%" },
    select: { padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, outline: "none", width: "100%" },
    textarea: { padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, outline: "none", width: "100%", minHeight: 80, resize: "vertical", fontFamily: "inherit" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${COLORS.border}` },
    td: { padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13 },
    tdClickable: { padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, cursor: "pointer" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modal: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, width: "90%", maxWidth: 640, maxHeight: "85vh", overflow: "auto" },
    modalLg: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, width: "90%", maxWidth: 800, maxHeight: "85vh", overflow: "auto" },
    modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
    formGroup: { marginBottom: 14 },
    formLabel: { display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" },
    formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    formRow3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
    row: { display: "flex", gap: 12, alignItems: "center" },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" },
    emptyState: { textAlign: "center", padding: 40, color: COLORS.textDim },
    pill: (active) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? COLORS.accent : COLORS.border}`, background: active ? `${COLORS.accent}20` : "transparent", color: active ? COLORS.accentLight : COLORS.textDim, cursor: "pointer", fontSize: 12, fontWeight: 500 }),
    tag: (color) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` }),
    searchBar: { display: "flex", gap: 8, marginBottom: 16, alignItems: "center" },
  };
}

// ==================== FORM FIELD COMPONENT ====================
function FormField({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8892a8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ==================== WIZARD STEP INDICATOR ====================
function WizardSteps({ steps, current, COLORS }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
      {steps.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", margin: "0 auto 6px",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
              background: isDone ? COLORS.success : isActive ? COLORS.accent : COLORS.border,
              color: isDone || isActive ? "#fff" : COLORS.textDim,
              transition: "all 0.2s",
            }}>
              {isDone ? "\u2713" : i + 1}
            </div>
            <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? COLORS.text : COLORS.textDim }}>
              {step}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                position: "absolute", top: 14, left: "calc(50% + 18px)", right: "calc(-50% + 18px)",
                height: 2, background: isDone ? COLORS.success : COLORS.border,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== INTAKE WIZARD ====================
function IntakeWizard({ COLORS, S, onSave, onCancel, existingAccount }) {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState(existingAccount || createEmptyAccount());

  const steps = ["Business Info", "Contacts", "Coverage Needs", "Current Coverage", "Notes & Assignment"];

  const update = (field, value) => {
    setAccount(prev => ({ ...prev, [field]: value }));
  };

  const updateNested = (parent, field, value) => {
    setAccount(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value },
    }));
  };

  const canAdvance = () => {
    if (step === 0) return account.businessName.trim() !== "";
    return true;
  };

  const handleSave = () => {
    const final = {
      ...account,
      lastModified: today(),
      pipelineStage: "intake_complete",
    };
    if (!final.created) final.created = today();
    // Sync mailing address if same as physical
    if (final.mailingAddressSameAsPhysical) {
      final.mailingAddress = { ...final.physicalAddress };
    }
    onSave(final);
  };

  const inputStyle = { ...S.input };
  const selectStyle = { ...S.select };

  return (
    <div>
      <WizardSteps steps={steps} current={step} COLORS={COLORS} />

      {/* Step 0: Business Info */}
      {step === 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>
            Business Information
          </div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 16, padding: "8px 12px", background: `${COLORS.accent}10`, borderRadius: 6, border: `1px solid ${COLORS.accent}20` }}>
            Fields marked with * are required for ACORD 125 generation
          </div>
          <div style={S.formRow}>
            <FormField label="Business Name" required>
              <input style={inputStyle} value={account.businessName} onChange={e => update("businessName", e.target.value)} placeholder="Legal business name" />
            </FormField>
            <FormField label="DBA (Doing Business As)">
              <input style={inputStyle} value={account.dba} onChange={e => update("dba", e.target.value)} placeholder="If different from legal name" />
            </FormField>
          </div>
          <div style={S.formRow3}>
            <FormField label="FEIN / EIN" required>
              <input style={inputStyle} value={account.fein} onChange={e => update("fein", e.target.value)} placeholder="XX-XXXXXXX" />
            </FormField>
            <FormField label="Entity Type" required>
              <select style={selectStyle} value={account.entityType} onChange={e => update("entityType", e.target.value)}>
                <option value="">Select...</option>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Date Established" required>
              <input style={inputStyle} type="date" value={account.dateEstablished} onChange={e => {
                update("dateEstablished", e.target.value);
                if (e.target.value) {
                  const years = Math.floor(daysBetween(e.target.value, today()) / 365);
                  update("yearsInBusiness", years > 0 ? years : 0);
                }
              }} />
            </FormField>
          </div>
          <div style={S.formRow3}>
            <FormField label="SIC Code" required>
              <input style={inputStyle} value={account.sicCode} onChange={e => update("sicCode", e.target.value)} placeholder="e.g. 7382" />
            </FormField>
            <FormField label="NAICS Code">
              <input style={inputStyle} value={account.naicsCode} onChange={e => update("naicsCode", e.target.value)} placeholder="e.g. 561612" />
            </FormField>
            <FormField label="Years in Business">
              <input style={inputStyle} type="number" value={account.yearsInBusiness} onChange={e => update("yearsInBusiness", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Industry / Description of Operations" required>
            <textarea style={S.textarea} value={account.industryDescription} onChange={e => update("industryDescription", e.target.value)} placeholder="Describe the business operations, products/services, and primary activities..." />
          </FormField>

          {/* Physical Address */}
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8, color: COLORS.text }}>Physical Address</div>
          <div style={S.formRow}>
            <FormField label="Street Address">
              <input style={inputStyle} value={account.physicalAddress.street} onChange={e => updateNested("physicalAddress", "street", e.target.value)} />
            </FormField>
            <FormField label="City">
              <input style={inputStyle} value={account.physicalAddress.city} onChange={e => updateNested("physicalAddress", "city", e.target.value)} />
            </FormField>
          </div>
          <div style={S.formRow3}>
            <FormField label="State">
              <input style={inputStyle} value={account.physicalAddress.state} onChange={e => updateNested("physicalAddress", "state", e.target.value)} />
            </FormField>
            <FormField label="ZIP">
              <input style={inputStyle} value={account.physicalAddress.zip} onChange={e => updateNested("physicalAddress", "zip", e.target.value)} />
            </FormField>
            <FormField label="County">
              <input style={inputStyle} value={account.physicalAddress.county} onChange={e => updateNested("physicalAddress", "county", e.target.value)} />
            </FormField>
          </div>

          {/* Mailing Address */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Mailing Address</div>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: COLORS.textDim, cursor: "pointer" }}>
              <input type="checkbox" checked={account.mailingAddressSameAsPhysical} onChange={e => update("mailingAddressSameAsPhysical", e.target.checked)} />
              Same as physical
            </label>
          </div>
          {!account.mailingAddressSameAsPhysical && (
            <>
              <div style={S.formRow}>
                <FormField label="Street Address">
                  <input style={inputStyle} value={account.mailingAddress.street} onChange={e => updateNested("mailingAddress", "street", e.target.value)} />
                </FormField>
                <FormField label="City">
                  <input style={inputStyle} value={account.mailingAddress.city} onChange={e => updateNested("mailingAddress", "city", e.target.value)} />
                </FormField>
              </div>
              <div style={S.formRow3}>
                <FormField label="State">
                  <input style={inputStyle} value={account.mailingAddress.state} onChange={e => updateNested("mailingAddress", "state", e.target.value)} />
                </FormField>
                <FormField label="ZIP">
                  <input style={inputStyle} value={account.mailingAddress.zip} onChange={e => updateNested("mailingAddress", "zip", e.target.value)} />
                </FormField>
                <FormField label="County">
                  <input style={inputStyle} value={account.mailingAddress.county} onChange={e => updateNested("mailingAddress", "county", e.target.value)} />
                </FormField>
              </div>
            </>
          )}

          {/* Employee / Revenue */}
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8, color: COLORS.text }}>Employees & Revenue</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Full-Time Employees">
              <input style={inputStyle} type="number" value={account.employeesFT} onChange={e => update("employeesFT", e.target.value)} />
            </FormField>
            <FormField label="Part-Time Employees">
              <input style={inputStyle} type="number" value={account.employeesPT} onChange={e => update("employeesPT", e.target.value)} />
            </FormField>
            <FormField label="Annual Gross Revenue">
              <input style={inputStyle} type="number" value={account.annualGrossRevenue} onChange={e => update("annualGrossRevenue", e.target.value)} placeholder="$" />
            </FormField>
            <FormField label="Total Annual Payroll">
              <input style={inputStyle} type="number" value={account.totalPayroll} onChange={e => update("totalPayroll", e.target.value)} placeholder="$" />
            </FormField>
          </div>
        </div>
      )}

      {/* Step 1: Contact Info */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>
            Contact Information
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: COLORS.text }}>Primary Contact</div>
          <div style={S.formRow}>
            <FormField label="Full Name" required>
              <input style={inputStyle} value={account.primaryContact.name} onChange={e => updateNested("primaryContact", "name", e.target.value)} />
            </FormField>
            <FormField label="Title">
              <input style={inputStyle} value={account.primaryContact.title} onChange={e => updateNested("primaryContact", "title", e.target.value)} placeholder="e.g. Owner, VP Operations" />
            </FormField>
          </div>
          <div style={S.formRow}>
            <FormField label="Phone" required>
              <input style={inputStyle} value={account.primaryContact.phone} onChange={e => updateNested("primaryContact", "phone", e.target.value)} placeholder="954-555-0000" />
            </FormField>
            <FormField label="Email" required>
              <input style={inputStyle} type="email" value={account.primaryContact.email} onChange={e => updateNested("primaryContact", "email", e.target.value)} />
            </FormField>
          </div>

          {/* Additional Contacts */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Additional Contacts</div>
            <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => {
              update("additionalContacts", [
                ...account.additionalContacts,
                { id: uid(), name: "", title: "", phone: "", email: "", role: "" },
              ]);
            }}>+ Add Contact</button>
          </div>
          {account.additionalContacts.map((c, idx) => (
            <div key={c.id} style={{ ...S.card, marginBottom: 8, padding: 12, position: "relative" }}>
              <button style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14 }}
                onClick={() => update("additionalContacts", account.additionalContacts.filter((_, i) => i !== idx))}>
                \u2715
              </button>
              <div style={S.formRow3}>
                <FormField label="Name">
                  <input style={inputStyle} value={c.name} onChange={e => {
                    const updated = [...account.additionalContacts];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    update("additionalContacts", updated);
                  }} />
                </FormField>
                <FormField label="Title / Role">
                  <input style={inputStyle} value={c.title} onChange={e => {
                    const updated = [...account.additionalContacts];
                    updated[idx] = { ...updated[idx], title: e.target.value };
                    update("additionalContacts", updated);
                  }} />
                </FormField>
                <FormField label="Phone">
                  <input style={inputStyle} value={c.phone} onChange={e => {
                    const updated = [...account.additionalContacts];
                    updated[idx] = { ...updated[idx], phone: e.target.value };
                    update("additionalContacts", updated);
                  }} />
                </FormField>
              </div>
              <FormField label="Email">
                <input style={inputStyle} value={c.email} onChange={e => {
                  const updated = [...account.additionalContacts];
                  updated[idx] = { ...updated[idx], email: e.target.value };
                  update("additionalContacts", updated);
                }} />
              </FormField>
            </div>
          ))}

          {/* Website & Social */}
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 20, marginBottom: 8, color: COLORS.text }}>Web & Social</div>
          <div style={S.formRow}>
            <FormField label="Website">
              <input style={inputStyle} value={account.website} onChange={e => update("website", e.target.value)} placeholder="https://..." />
            </FormField>
            <FormField label="Social Profiles">
              <input style={inputStyle} value={account.socialProfiles} onChange={e => update("socialProfiles", e.target.value)} placeholder="LinkedIn, Facebook, etc." />
            </FormField>
          </div>
        </div>
      )}

      {/* Step 2: Coverage Needs Assessment */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: COLORS.accentLight }}>
            Coverage Needs Assessment
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>
            Select all lines of business the client needs or is interested in. This determines which ACORD forms will be generated.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {COVERAGE_OPTIONS.map(cov => {
              const selected = account.coverageNeeds.includes(cov.id);
              return (
                <div
                  key={cov.id}
                  onClick={() => {
                    if (selected) {
                      update("coverageNeeds", account.coverageNeeds.filter(c => c !== cov.id));
                    } else {
                      update("coverageNeeds", [...account.coverageNeeds, cov.id]);
                    }
                  }}
                  style={{
                    padding: "12px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                    border: `1.5px solid ${selected ? COLORS.accent : COLORS.border}`,
                    background: selected ? `${COLORS.accent}12` : COLORS.card,
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.5px",
                    background: selected ? COLORS.accent : COLORS.border,
                    color: selected ? "#fff" : COLORS.textDim,
                  }}>
                    {cov.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? COLORS.text : COLORS.textDim }}>
                      {cov.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {account.coverageNeeds.length > 0 && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: `${COLORS.success}10`, borderRadius: 8, border: `1px solid ${COLORS.success}20` }}>
              <span style={{ fontSize: 12, color: COLORS.success, fontWeight: 600 }}>
                {account.coverageNeeds.length} line{account.coverageNeeds.length !== 1 ? "s" : ""} selected
              </span>
              <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 8 }}>
                {account.coverageNeeds.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Current Coverage */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: COLORS.accentLight }}>
            Current Coverage & Loss History
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>
            Record the client's existing coverage details. This helps with remarketing and carrier submissions.
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Current Policies</div>
            <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => {
              update("currentCoverage", [
                ...account.currentCoverage,
                { id: uid(), lob: "", carrier: "", expirationDate: "", currentPremium: "", policyNumber: "" },
              ]);
            }}>+ Add Policy</button>
          </div>
          {account.currentCoverage.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: COLORS.textDim, fontSize: 13, background: COLORS.bg, borderRadius: 8 }}>
              No current coverage recorded. Click "+ Add Policy" to add existing coverage.
            </div>
          )}
          {account.currentCoverage.map((cov, idx) => (
            <div key={cov.id || idx} style={{ ...S.card, marginBottom: 8, padding: 12, position: "relative" }}>
              <button style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14 }}
                onClick={() => update("currentCoverage", account.currentCoverage.filter((_, i) => i !== idx))}>
                \u2715
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                <FormField label="Line of Business">
                  <select style={selectStyle} value={cov.lob} onChange={e => {
                    const updated = [...account.currentCoverage];
                    updated[idx] = { ...updated[idx], lob: e.target.value };
                    update("currentCoverage", updated);
                  }}>
                    <option value="">Select...</option>
                    {COVERAGE_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Carrier">
                  <input style={inputStyle} value={cov.carrier} onChange={e => {
                    const updated = [...account.currentCoverage];
                    updated[idx] = { ...updated[idx], carrier: e.target.value };
                    update("currentCoverage", updated);
                  }} />
                </FormField>
                <FormField label="Policy #">
                  <input style={inputStyle} value={cov.policyNumber} onChange={e => {
                    const updated = [...account.currentCoverage];
                    updated[idx] = { ...updated[idx], policyNumber: e.target.value };
                    update("currentCoverage", updated);
                  }} />
                </FormField>
                <FormField label="Expiration">
                  <input style={inputStyle} type="date" value={cov.expirationDate} onChange={e => {
                    const updated = [...account.currentCoverage];
                    updated[idx] = { ...updated[idx], expirationDate: e.target.value };
                    update("currentCoverage", updated);
                  }} />
                </FormField>
                <FormField label="Premium">
                  <input style={inputStyle} type="number" value={cov.currentPremium} onChange={e => {
                    const updated = [...account.currentCoverage];
                    updated[idx] = { ...updated[idx], currentPremium: e.target.value };
                    update("currentCoverage", updated);
                  }} placeholder="$" />
                </FormField>
              </div>
            </div>
          ))}

          <FormField label="Loss History Summary">
            <textarea style={S.textarea} value={account.lossHistorySummary} onChange={e => update("lossHistorySummary", e.target.value)}
              placeholder="Summarize loss history for the last 3-5 years. Include number of claims, total incurred, and any open claims..." />
          </FormField>
        </div>
      )}

      {/* Step 4: Notes & Assignment */}
      {step === 4 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>
            Notes & Producer Assignment
          </div>
          <div style={S.formRow}>
            <FormField label="Referred By">
              <input style={inputStyle} value={account.referredBy} onChange={e => update("referredBy", e.target.value)} placeholder="Name or company" />
            </FormField>
            <FormField label="Lead Source">
              <select style={selectStyle} value={account.leadSource} onChange={e => update("leadSource", e.target.value)}>
                <option value="">Select...</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>
          <div style={S.formRow}>
            <FormField label="Assigned Producer">
              <input style={inputStyle} value={account.assignedProducer} onChange={e => update("assignedProducer", e.target.value)} />
            </FormField>
            <FormField label="Assigned CSR">
              <input style={inputStyle} value={account.assignedCSR} onChange={e => update("assignedCSR", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea style={{ ...S.textarea, minHeight: 120 }} value={account.notes} onChange={e => update("notes", e.target.value)}
              placeholder="Any additional notes about this account..." />
          </FormField>

          {/* ACORD Readiness Check */}
          {(() => {
            const dataContext = { account, agency: AGENCY_CONFIG };
            const validation = validateAcordForm(ACORD_125, dataContext);
            return (
              <div style={{
                marginTop: 16, padding: "14px 16px", borderRadius: 8,
                background: validation.complete ? `${COLORS.success}10` : `${COLORS.warning}10`,
                border: `1px solid ${validation.complete ? COLORS.success : COLORS.warning}30`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: validation.complete ? COLORS.success : COLORS.warning, marginBottom: 6 }}>
                  ACORD 125 Readiness: {validation.percentage}%
                </div>
                {!validation.complete && (
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>
                    Missing fields: {validation.missing.map(m => m.label).join(", ")}
                  </div>
                )}
                {validation.complete && (
                  <div style={{ fontSize: 12, color: COLORS.success }}>
                    All required ACORD 125 fields are populated. Ready for submission generation.
                  </div>
                )}
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: COLORS.border, overflow: "hidden" }}>
                  <div style={{ width: `${validation.percentage}%`, height: "100%", background: validation.complete ? COLORS.success : COLORS.warning, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
        <div>
          {step > 0 && (
            <button style={S.btn("ghost")} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn("ghost")} onClick={onCancel}>Cancel</button>
          {step < steps.length - 1 ? (
            <button style={S.btn()} onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Next
            </button>
          ) : (
            <button style={{ ...S.btn("success") }} onClick={handleSave}>
              {existingAccount ? "Update Account" : "Create Account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ==================== POLICY STATUS CONSTANTS ====================
const POLICY_STATUSES = ["Active", "Expired", "Cancelled", "Pending"];

// ==================== POLICIES TAB ====================
function PoliciesTab({ account, policies, data, setData, COLORS, S }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ lob: "", carrier: "", policyNumber: "", effectiveDate: "", expirationDate: "", premium: "", status: "Active" });

  const resetForm = () => {
    setForm({ lob: "", carrier: "", policyNumber: "", effectiveDate: "", expirationDate: "", premium: "", status: "Active" });
    setShowAddForm(false);
    setEditingId(null);
  };

  const savePolicy = () => {
    if (!form.lob && !form.carrier && !form.policyNumber) return;
    const now = new Date().toISOString();
    if (editingId) {
      setData(prev => ({
        ...prev,
        policies: prev.policies.map(p => p.id === editingId ? { ...p, ...form, premium: parseFloat(form.premium) || 0, lastModified: now } : p),
      }));
    } else {
      const newPolicy = {
        id: uid(),
        accountId: account.id,
        ...form,
        premium: parseFloat(form.premium) || 0,
        created: now,
        lastModified: now,
      };
      setData(prev => {
        const updated = { ...prev, policies: [...prev.policies, newPolicy] };
        // Auto-promote Prospect → Active when adding a policy
        if (account.accountStatus === "Prospect") {
          updated.accounts = prev.accounts.map(a =>
            a.id === account.id ? { ...a, accountStatus: "Active", lastModified: today() } : a
          );
          updated.activities = [
            ...prev.activities,
            { id: uid(), accountId: account.id, type: "status_change", description: "Account status changed to Active (policy added)", createdBy: "System", createdAt: now },
          ];
        }
        return updated;
      });
    }
    resetForm();
  };

  const deletePolicy = (policyId) => {
    setData(prev => ({
      ...prev,
      policies: prev.policies.filter(p => p.id !== policyId),
    }));
  };

  const startEdit = (policy) => {
    setForm({
      lob: policy.lob || "",
      carrier: policy.carrier || "",
      policyNumber: policy.policyNumber || "",
      effectiveDate: policy.effectiveDate || "",
      expirationDate: policy.expirationDate || "",
      premium: policy.premium || "",
      status: policy.status || "Active",
    });
    setEditingId(policy.id);
    setShowAddForm(true);
  };

  const importFromCoverage = () => {
    const now = new Date().toISOString();
    const existingPolicyNums = new Set(policies.map(p => p.policyNumber).filter(Boolean));
    const toImport = account.currentCoverage.filter(
      cov => cov.policyNumber && !existingPolicyNums.has(cov.policyNumber)
    );
    if (toImport.length === 0) return;
    const newPolicies = toImport.map(cov => ({
      id: uid(),
      accountId: account.id,
      lob: cov.lob || "",
      carrier: cov.carrier || "",
      policyNumber: cov.policyNumber || "",
      effectiveDate: "",
      expirationDate: cov.expirationDate || "",
      premium: parseFloat(cov.currentPremium) || 0,
      status: "Active",
      created: now,
      lastModified: now,
    }));
    setData(prev => {
      const updated = { ...prev, policies: [...prev.policies, ...newPolicies] };
      if (account.accountStatus === "Prospect") {
        updated.accounts = prev.accounts.map(a =>
          a.id === account.id ? { ...a, accountStatus: "Active", lastModified: today() } : a
        );
        updated.activities = [
          ...prev.activities,
          { id: uid(), accountId: account.id, type: "status_change", description: `Account status changed to Active (${newPolicies.length} policies imported)`, createdBy: "System", createdAt: now },
        ];
      }
      return updated;
    });
  };

  const hasImportable = account.currentCoverage.length > 0 && account.currentCoverage.some(
    cov => cov.policyNumber && !policies.some(p => p.policyNumber === cov.policyNumber)
  );

  const statusColor = (status) => {
    switch (status) {
      case "Active": return COLORS.success;
      case "Expired": return COLORS.danger || "#ef4444";
      case "Cancelled": return COLORS.danger || "#ef4444";
      case "Pending": return COLORS.warning || "#f59e0b";
      default: return COLORS.textDim;
    }
  };

  const inputStyle = { ...S.input, fontSize: 13, padding: "6px 10px" };

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Policies ({policies.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            {hasImportable && (
              <button style={{ ...S.btn, fontSize: 12, padding: "6px 14px", border: `1px solid ${COLORS.accent}`, color: COLORS.accent, background: "transparent" }} onClick={importFromCoverage}>
                Import from Coverage
              </button>
            )}
            <button style={{ ...S.btn, background: COLORS.accent, color: "#fff", fontSize: 12, padding: "6px 14px" }} onClick={() => { resetForm(); setShowAddForm(true); }}>
              + Add Policy
            </button>
          </div>
        </div>

        {showAddForm && (
          <div style={{ background: `${COLORS.accent}10`, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editingId ? "Edit Policy" : "Add New Policy"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Line of Business</label>
                <select style={{ ...inputStyle }} value={form.lob} onChange={e => setForm(f => ({ ...f, lob: e.target.value }))}>
                  <option value="">Select LOB...</option>
                  {COVERAGE_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Carrier</label>
                <input style={inputStyle} placeholder="Carrier name" value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Policy Number</label>
                <input style={inputStyle} placeholder="Policy #" value={form.policyNumber} onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Status</label>
                <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Effective Date</label>
                <input style={inputStyle} type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Expiration Date</label>
                <input style={inputStyle} type="date" value={form.expirationDate} onChange={e => setForm(f => ({ ...f, expirationDate: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Premium</label>
                <input style={inputStyle} type="number" placeholder="0.00" value={form.premium} onChange={e => setForm(f => ({ ...f, premium: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button style={{ ...S.btn, fontSize: 12, padding: "6px 14px" }} onClick={resetForm}>Cancel</button>
              <button style={{ ...S.btn, background: COLORS.accent, color: "#fff", fontSize: 12, padding: "6px 14px" }} onClick={savePolicy}>
                {editingId ? "Save Changes" : "Add Policy"}
              </button>
            </div>
          </div>
        )}

        {policies.length === 0 && !showAddForm ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No policies yet</div>
            <div style={{ fontSize: 13 }}>
              {hasImportable
                ? "Click \"Import from Coverage\" to bring in policies from the Coverage tab, or add them manually."
                : "Click \"+ Add Policy\" to add this account's first policy."}
            </div>
          </div>
        ) : policies.length > 0 && (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>LOB</th>
                <th style={S.th}>Carrier</th>
                <th style={S.th}>Policy #</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Effective</th>
                <th style={S.th}>Expiration</th>
                <th style={S.th}>Premium</th>
                <th style={{ ...S.th, width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map(p => {
                const lobLabel = COVERAGE_OPTIONS.find(c => c.id === p.lob)?.label || p.lob;
                return (
                  <tr key={p.id}>
                    <td style={S.td}>{lobLabel}</td>
                    <td style={S.td}>{p.carrier}</td>
                    <td style={S.td}>{p.policyNumber}</td>
                    <td style={S.td}>
                      <span style={{ ...S.tag(statusColor(p.status)), fontSize: 11 }}>{p.status}</span>
                    </td>
                    <td style={S.td}>{fmt(p.effectiveDate)}</td>
                    <td style={S.td}>{fmt(p.expirationDate)}</td>
                    <td style={S.td}>{fmtCurrency(p.premium)}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px" }} onClick={() => startEdit(p)}>Edit</button>
                        <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px", color: COLORS.danger || "#ef4444" }} onClick={() => deletePolicy(p.id)}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ==================== ACCOUNT DETAIL VIEW ====================
function AccountDetailView({ account, data, COLORS, S, onBack, onEdit, setData, setPage }) {
  const [activeTab, setActiveTab] = useState("overview");

  const pipelineStage = PIPELINE_STAGES.find(s => s.id === account.pipelineStage) || PIPELINE_STAGES[0];
  const submissions = data.submissions.filter(s => s.accountId === account.id);
  const policies = data.policies.filter(p => p.accountId === account.id);
  const activities = data.activities.filter(a => a.accountId === account.id).sort((a, b) => b.createdAt?.localeCompare(a.createdAt));
  const tasks = data.tasks.filter(t => t.linkedId === account.id);

  // ACORD Readiness
  const dataContext = { account, agency: AGENCY_CONFIG };
  const acordValidation = validateAcordForm(ACORD_125, dataContext);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "coverage", label: "Coverage" },
    { id: "submissions", label: `Submissions (${submissions.length})` },
    { id: "policies", label: `Policies (${policies.length})` },
    { id: "activity", label: "Activity" },
    { id: "acord", label: "ACORD Status" },
  ];

  const InfoRow = ({ label, value }) => (
    <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}20` }}>
      <div style={{ width: 180, fontSize: 12, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: value ? COLORS.text : COLORS.textMuted }}>{value || "\u2014"}</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={{ ...S.btn("ghost"), padding: "6px 10px" }} onClick={onBack}>&larr; Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{account.businessName}</div>
          <div style={{ fontSize: 13, color: COLORS.textDim }}>
            {account.dba && `DBA: ${account.dba} \u00B7 `}
            {account.entityType} {account.fein && `\u00B7 FEIN: ${account.fein}`}
          </div>
        </div>
        <span style={S.tag(pipelineStage.color)}>{pipelineStage.label}</span>
        <span style={S.badge(account.accountStatus === "Active" ? COLORS.success : account.accountStatus === "Prospect" ? COLORS.info : COLORS.danger)}>
          {account.accountStatus}
        </span>
        <button style={S.btn()} onClick={onEdit}>Edit Account</button>
      </div>

      {/* ACORD Readiness Bar */}
      <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: COLORS.card, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: acordValidation.complete ? COLORS.success : COLORS.warning }}>
          ACORD 125: {acordValidation.percentage}%
        </div>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: COLORS.border, overflow: "hidden" }}>
          <div style={{ width: `${acordValidation.percentage}%`, height: "100%", background: acordValidation.complete ? COLORS.success : COLORS.warning, transition: "width 0.3s" }} />
        </div>
        {!acordValidation.complete && (
          <div style={{ fontSize: 11, color: COLORS.warning }}>
            {acordValidation.missing.length} missing field{acordValidation.missing.length !== 1 ? "s" : ""}
          </div>
        )}
        {acordValidation.complete && (
          <div style={{ fontSize: 11, color: COLORS.success }}>Ready for ACORD generation</div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
        {tabs.map(tab => (
          <button key={tab.id}
            style={{
              padding: "10px 18px", fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, cursor: "pointer",
              background: "transparent", border: "none",
              color: activeTab === tab.id ? COLORS.accent : COLORS.textDim,
              borderBottom: activeTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Business Information</div>
            <InfoRow label="Business Name" value={account.businessName} />
            <InfoRow label="DBA" value={account.dba} />
            <InfoRow label="Entity Type" value={account.entityType} />
            <InfoRow label="FEIN" value={account.fein} />
            <InfoRow label="Date Established" value={fmt(account.dateEstablished)} />
            <InfoRow label="Years in Business" value={account.yearsInBusiness} />
            <InfoRow label="SIC Code" value={account.sicCode} />
            <InfoRow label="NAICS Code" value={account.naicsCode} />
            <InfoRow label="Industry" value={account.industryDescription} />
          </div>
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Primary Contact</div>
              <InfoRow label="Name" value={account.primaryContact.name} />
              <InfoRow label="Title" value={account.primaryContact.title} />
              <InfoRow label="Phone" value={account.primaryContact.phone} />
              <InfoRow label="Email" value={account.primaryContact.email} />
            </div>
            <div style={{ ...S.card, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Financial</div>
              <InfoRow label="Employees (FT)" value={account.employeesFT} />
              <InfoRow label="Employees (PT)" value={account.employeesPT} />
              <InfoRow label="Annual Revenue" value={account.annualGrossRevenue ? fmtCurrency(account.annualGrossRevenue) : null} />
              <InfoRow label="Total Payroll" value={account.totalPayroll ? fmtCurrency(account.totalPayroll) : null} />
            </div>
            <div style={{ ...S.card, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Address</div>
              <InfoRow label="Physical" value={[account.physicalAddress.street, account.physicalAddress.city, account.physicalAddress.state, account.physicalAddress.zip].filter(Boolean).join(", ")} />
              <InfoRow label="Mailing" value={
                account.mailingAddressSameAsPhysical ? "Same as physical" :
                [account.mailingAddress.street, account.mailingAddress.city, account.mailingAddress.state, account.mailingAddress.zip].filter(Boolean).join(", ")
              } />
            </div>
          </div>
        </div>
      )}

      {activeTab === "coverage" && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Coverage Needs</div>
            {account.coverageNeeds.length === 0 ? (
              <div style={{ color: COLORS.textDim, fontSize: 13 }}>No coverage needs recorded</div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {account.coverageNeeds.map(lob => {
                  const opt = COVERAGE_OPTIONS.find(c => c.id === lob);
                  return (
                    <span key={lob} style={S.tag(COLORS.accent)}>
                      {opt?.label || lob}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Current Coverage</div>
            {account.currentCoverage.length === 0 ? (
              <div style={{ color: COLORS.textDim, fontSize: 13 }}>No current coverage recorded</div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>LOB</th>
                    <th style={S.th}>Carrier</th>
                    <th style={S.th}>Policy #</th>
                    <th style={S.th}>Expiration</th>
                    <th style={S.th}>Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {account.currentCoverage.map((cov, i) => (
                    <tr key={i}>
                      <td style={S.td}>{cov.lob}</td>
                      <td style={S.td}>{cov.carrier}</td>
                      <td style={S.td}>{cov.policyNumber}</td>
                      <td style={S.td}>{fmt(cov.expirationDate)}</td>
                      <td style={S.td}>{fmtCurrency(cov.currentPremium)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {account.lossHistorySummary && (
            <div style={{ ...S.card, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Loss History</div>
              <div style={{ fontSize: 13, color: COLORS.textDim, whiteSpace: "pre-wrap" }}>{account.lossHistorySummary}</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "submissions" && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Submissions</div>
            <button style={{ ...S.btn, background: COLORS.accent, color: "#fff", fontSize: 12, padding: "6px 14px" }} onClick={() => {
              const newSub = createEmptySubmission(account.id);
              setData(prev => ({ ...prev, submissions: [...(prev.submissions || []), newSub] }));
              setPage("cl_submissions");
            }}>+ New Submission</button>
          </div>
          {submissions.length === 0 ? (
            <div style={S.emptyState}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No submissions yet</div>
              <div style={{ fontSize: 13 }}>Create a submission to start the quoting process</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {submissions.map(sub => (
                <div key={sub.id} style={{ ...S.card, padding: 12, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setPage("cl_submissions")}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{sub.name || "Untitled Submission"}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{sub.linesOfBusiness?.join(", ") || "No LOBs selected"} · Created {sub.createdAt}</div>
                  </div>
                  <span style={{ ...S.tag(sub.status === "draft" ? COLORS.warning : sub.status === "submitted" ? COLORS.info : COLORS.success), fontSize: 11 }}>{sub.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "policies" && (
        <PoliciesTab account={account} policies={policies} data={data} setData={setData} COLORS={COLORS} S={S} />
      )}

      {activeTab === "activity" && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Activity Log</div>
          {activities.length === 0 ? (
            <div style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center", padding: 20 }}>No activity recorded yet</div>
          ) : (
            activities.map(a => (
              <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}20`, fontSize: 13 }}>
                <span style={{ color: COLORS.textDim, fontSize: 11, marginRight: 8 }}>{fmt(a.createdAt?.split("T")[0])}</span>
                <span>{a.description}</span>
                {a.detail && <span style={{ color: COLORS.textDim, marginLeft: 8 }}>- {a.detail}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "acord" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>ACORD Form Readiness</div>
          {/* Show readiness for each relevant ACORD form */}
          {[
            { name: "ACORD 125", desc: "Commercial Insurance Application", mapping: ACORD_125, always: true },
          ].filter(f => f.always || account.coverageNeeds.length > 0).map(form => {
            const validation = validateAcordForm(form.mapping, dataContext);
            return (
              <div key={form.name} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{form.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>{form.desc}</div>
                  </div>
                  <span style={S.badge(validation.complete ? COLORS.success : COLORS.warning)}>
                    {validation.percentage}% Complete
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: COLORS.border, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${validation.percentage}%`, height: "100%", background: validation.complete ? COLORS.success : COLORS.warning }} />
                </div>
                {!validation.complete && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.warning, marginBottom: 4 }}>Missing Required Fields:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {validation.missing.map(m => (
                        <span key={m.field} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${COLORS.warning}15`, color: COLORS.warning }}>
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {validation.complete && (
                  <div style={{ fontSize: 12, color: COLORS.success }}>
                    ✓ All required fields populated. Ready for ACORD generation.
                  </div>
                )}
              </div>
            );
          })}

          {/* Coverage-specific forms */}
          {account.coverageNeeds.length > 0 && (
            <div style={{ ...S.card, marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Coverage-Specific Forms</div>
              <div style={{ fontSize: 12, color: COLORS.textDim }}>
                Based on selected coverage needs, these ACORD forms will be available for generation:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {account.coverageNeeds.includes("GL") && <span style={S.tag(COLORS.info)}>ACORD 126 - GL</span>}
                {account.coverageNeeds.includes("Workers Comp") && <span style={S.tag(COLORS.info)}>ACORD 130 - WC</span>}
                {account.coverageNeeds.includes("Umbrella") && <span style={S.tag(COLORS.info)}>ACORD 131 - Umbrella</span>}
                {account.coverageNeeds.includes("Commercial Auto") && <span style={S.tag(COLORS.info)}>ACORD 137 - Auto</span>}
                {(account.coverageNeeds.includes("Property") || account.coverageNeeds.includes("BOP")) && <span style={S.tag(COLORS.info)}>ACORD 140 - Property</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ==================== ACCOUNTS LIST VIEW ====================
function AccountsList({ data, COLORS, S, onSelectAccount, onNewAccount, setData }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortField, setSortField] = useState("businessName");
  const [sortDir, setSortDir] = useState("asc");

  const filtered = useMemo(() => {
    let list = data.accounts;

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.businessName?.toLowerCase().includes(q) ||
        a.dba?.toLowerCase().includes(q) ||
        a.primaryContact?.name?.toLowerCase().includes(q) ||
        a.primaryContact?.phone?.includes(q) ||
        a.primaryContact?.email?.toLowerCase().includes(q) ||
        a.fein?.includes(q) ||
        a.industryDescription?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(a => a.accountStatus === statusFilter);
    }

    // Stage filter
    if (stageFilter !== "all") {
      list = list.filter(a => a.pipelineStage === stageFilter);
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case "businessName": va = (a.businessName || "").toLowerCase(); vb = (b.businessName || "").toLowerCase(); break;
        case "accountStatus": va = a.accountStatus || ""; vb = b.accountStatus || ""; break;
        case "pipelineStage": va = PIPELINE_STAGES.findIndex(s => s.id === a.pipelineStage); vb = PIPELINE_STAGES.findIndex(s => s.id === b.pipelineStage); break;
        case "created": va = a.created || ""; vb = b.created || ""; break;
        default: va = ""; vb = "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [data.accounts, search, statusFilter, stageFilter, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHeader = ({ field, children }) => (
    <th style={{ ...S.th, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(field)}>
      {children} {sortField === field ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={S.pageTitle}>Commercial Accounts</div>
        <button style={S.btn()} onClick={onNewAccount}>+ New Account</button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          style={{ ...S.input, maxWidth: 300 }}
          placeholder="Search by name, contact, FEIN, industry..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...S.select, width: "auto" }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {ACCOUNT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto" }} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All Stages</option>
          {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Stage pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={S.pill(stageFilter === "all")} onClick={() => setStageFilter("all")}>
          All ({data.accounts.length})
        </span>
        {PIPELINE_STAGES.map(stage => {
          const count = data.accounts.filter(a => a.pipelineStage === stage.id).length;
          return (
            <span key={stage.id}
              style={{ ...S.pill(stageFilter === stage.id), borderColor: stageFilter === stage.id ? stage.color : undefined, color: stageFilter === stage.id ? stage.color : undefined, background: stageFilter === stage.id ? `${stage.color}20` : undefined }}
              onClick={() => setStageFilter(stageFilter === stage.id ? "all" : stage.id)}>
              {stage.label} ({count})
            </span>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>
            {data.accounts.length === 0 ? "No commercial accounts yet" : "No accounts match your filters"}
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            {data.accounts.length === 0 ? "Click \"+ New Account\" to add your first commercial client" : "Try adjusting your search or filters"}
          </div>
          {data.accounts.length === 0 && (
            <button style={S.btn()} onClick={onNewAccount}>+ New Account</button>
          )}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <SortHeader field="businessName">Business Name</SortHeader>
                <th style={S.th}>Contact</th>
                <th style={S.th}>Phone</th>
                <SortHeader field="pipelineStage">Stage</SortHeader>
                <th style={S.th}>Coverage</th>
                <SortHeader field="accountStatus">Status</SortHeader>
                <SortHeader field="created">Created</SortHeader>
                <th style={S.th}>ACORD</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(account => {
                const stage = PIPELINE_STAGES.find(s => s.id === account.pipelineStage) || PIPELINE_STAGES[0];
                const dataContext = { account, agency: AGENCY_CONFIG };
                const acordPct = validateAcordForm(ACORD_125, dataContext).percentage;
                return (
                  <tr key={account.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectAccount(account.id)}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={S.tdClickable}>
                      <div style={{ fontWeight: 600 }}>{account.businessName}</div>
                      {account.dba && <div style={{ fontSize: 11, color: COLORS.textDim }}>DBA: {account.dba}</div>}
                    </td>
                    <td style={S.td}>{account.primaryContact?.name || "\u2014"}</td>
                    <td style={S.td}>{account.primaryContact?.phone || "\u2014"}</td>
                    <td style={S.td}><span style={S.tag(stage.color)}>{stage.label}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(account.coverageNeeds || []).slice(0, 3).map(lob => (
                          <span key={lob} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: `${COLORS.accent}15`, color: COLORS.accentLight }}>
                            {COVERAGE_OPTIONS.find(c => c.id === lob)?.icon || lob}
                          </span>
                        ))}
                        {(account.coverageNeeds || []).length > 3 && (
                          <span style={{ fontSize: 10, color: COLORS.textDim }}>+{account.coverageNeeds.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(account.accountStatus === "Active" ? COLORS.success : account.accountStatus === "Prospect" ? COLORS.info : COLORS.danger)}>
                        {account.accountStatus}
                      </span>
                    </td>
                    <td style={S.td}><span style={{ fontSize: 12, color: COLORS.textDim }}>{fmt(account.created)}</span></td>
                    <td style={S.td}>
                      <div style={{ width: 40, height: 6, borderRadius: 3, background: COLORS.border, overflow: "hidden" }}>
                        <div style={{ width: `${acordPct}%`, height: "100%", background: acordPct === 100 ? COLORS.success : COLORS.warning }} />
                      </div>
                      <div style={{ fontSize: 10, color: acordPct === 100 ? COLORS.success : COLORS.textDim, marginTop: 2 }}>{acordPct}%</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ==================== COMMERCIAL DASHBOARD ====================
function CommercialDashboard({ data, COLORS, S, setPage }) {
  const accounts = data.accounts || [];
  const activeAccounts = accounts.filter(a => a.accountStatus === "Active");
  const prospects = accounts.filter(a => a.accountStatus === "Prospect");
  const submissions = data.submissions || [];
  const policies = data.policies || [];

  // Pipeline summary
  const pipelineCounts = PIPELINE_STAGES.map(stage => ({
    ...stage,
    count: accounts.filter(a => a.pipelineStage === stage.id).length,
  }));

  // Total current coverage premium (rough estimate from intake data)
  const totalPremium = accounts.reduce((sum, a) =>
    sum + (a.currentCoverage || []).reduce((s, c) => s + (Number(c.currentPremium) || 0), 0), 0
  );

  // Upcoming expirations (from current coverage entries)
  const todayStr = today();
  const upcomingExpirations = accounts.flatMap(a =>
    (a.currentCoverage || []).filter(c => c.expirationDate && c.expirationDate >= todayStr)
      .map(c => ({ ...c, accountName: a.businessName, accountId: a.id }))
  ).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)).slice(0, 10);

  // Recent activity
  const recentActivity = (data.activities || [])
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 8);

  return (
    <div>
      <div style={S.pageTitle}>Commercial Lines Dashboard</div>

      {/* Stats Row */}
      <div style={S.gridAuto}>
        <div style={S.statCard}>
          <div style={S.statVal}>{accounts.length}</div>
          <div style={S.statLabel}>Total Accounts</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.success }}>{activeAccounts.length}</div>
          <div style={S.statLabel}>Active Clients</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.info }}>{prospects.length}</div>
          <div style={S.statLabel}>Prospects</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.warning }}>{submissions.length}</div>
          <div style={S.statLabel}>Open Submissions</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statVal}>{fmtCurrency(totalPremium)}</div>
          <div style={S.statLabel}>Total Premium</div>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div style={{ ...S.card, marginTop: 20 }}>
        <div style={S.sectionTitle}>Pipeline Overview</div>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 36 }}>
          {pipelineCounts.filter(s => s.count > 0).map(stage => (
            <div key={stage.id}
              style={{
                flex: stage.count, background: `${stage.color}30`, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: stage.color, cursor: "pointer", minWidth: 30,
                borderRight: `1px solid ${COLORS.bg}`,
              }}
              onClick={() => setPage("cl_pipeline")}
              title={`${stage.label}: ${stage.count}`}
            >
              {stage.count > 0 && `${stage.label} (${stage.count})`}
            </div>
          ))}
          {accounts.length === 0 && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontSize: 12, background: COLORS.bg }}>
              No accounts yet
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
        {/* Upcoming Expirations */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Upcoming Expirations</div>
          {upcomingExpirations.length === 0 ? (
            <div style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center", padding: 16 }}>No upcoming expirations</div>
          ) : (
            upcomingExpirations.slice(0, 5).map((exp, i) => {
              const days = daysBetween(todayStr, exp.expirationDate);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: i < 4 ? `1px solid ${COLORS.border}20` : "none" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, minWidth: 36, textAlign: "center",
                    background: days <= 30 ? `${COLORS.danger}20` : days <= 60 ? `${COLORS.warning}20` : `${COLORS.info}20`,
                    color: days <= 30 ? COLORS.danger : days <= 60 ? COLORS.warning : COLORS.info,
                  }}>
                    {days}d
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{exp.accountName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{exp.lob} - {exp.carrier}</div>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>{fmt(exp.expirationDate)}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent Activity */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Recent Activity</div>
          {recentActivity.length === 0 ? (
            <div style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center", padding: 16 }}>No recent activity</div>
          ) : (
            recentActivity.map((a, i) => (
              <div key={a.id} style={{ padding: "6px 0", borderBottom: i < recentActivity.length - 1 ? `1px solid ${COLORS.border}20` : "none", fontSize: 13 }}>
                <span style={{ fontSize: 11, color: COLORS.textDim, marginRight: 6 }}>
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                </span>
                {a.description}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


// ==================== PIPELINE VIEW (Basic) ====================
function PipelineView({ data, COLORS, S, setData, onSelectAccount }) {
  const accounts = data.accounts || [];

  const handleStageChange = (accountId, newStage) => {
    const updated = {
      ...data,
      accounts: data.accounts.map(a =>
        a.id === accountId ? { ...a, pipelineStage: newStage, lastModified: today() } : a
      ),
      activities: [
        ...data.activities,
        {
          id: uid(), accountId, type: "stage_change",
          description: `Pipeline stage changed to ${PIPELINE_STAGES.find(s => s.id === newStage)?.label || newStage}`,
          detail: "", createdBy: AGENCY_CONFIG.defaultProducer, createdAt: new Date().toISOString(),
        },
      ],
    };
    setData(updated);
  };

  return (
    <div>
      <div style={S.pageTitle}>Commercial Pipeline</div>
      <div style={{ display: "flex", gap: 12, overflow: "auto", paddingBottom: 16 }}>
        {PIPELINE_STAGES.map(stage => {
          const stageAccounts = accounts.filter(a => a.pipelineStage === stage.id);
          return (
            <div key={stage.id} style={{ minWidth: 240, maxWidth: 280, flex: 1 }}>
              <div style={{
                padding: "8px 12px", marginBottom: 8, borderRadius: 8,
                background: `${stage.color}15`, borderLeft: `3px solid ${stage.color}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: stage.color }}>{stage.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, background: `${stage.color}20`, padding: "1px 8px", borderRadius: 10 }}>
                  {stageAccounts.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 100 }}>
                {stageAccounts.map(account => (
                  <div key={account.id}
                    style={{ ...S.card, padding: 12, cursor: "pointer" }}
                    onClick={() => onSelectAccount(account.id)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = stage.color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{account.businessName}</div>
                    {account.coverageNeeds?.length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginBottom: 4, flexWrap: "wrap" }}>
                        {account.coverageNeeds.slice(0, 3).map(lob => (
                          <span key={lob} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: `${COLORS.accent}15`, color: COLORS.accentLight }}>
                            {COVERAGE_OPTIONS.find(c => c.id === lob)?.icon || lob}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>
                      {account.primaryContact?.name || "No contact"} {account.assignedProducer ? `\u00B7 ${account.assignedProducer}` : ""}
                    </div>
                    {/* Stage navigation arrows */}
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      {PIPELINE_STAGES.map((s, i) => {
                        const currentIdx = PIPELINE_STAGES.findIndex(ps => ps.id === stage.id);
                        if (Math.abs(i - currentIdx) > 1 && i !== PIPELINE_STAGES.length - 2 && i !== PIPELINE_STAGES.length - 1) return null;
                        if (s.id === stage.id) return null;
                        return (
                          <button key={s.id}
                            style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}30`, cursor: "pointer" }}
                            onClick={e => { e.stopPropagation(); handleStageChange(account.id, s.id); }}
                            title={`Move to ${s.label}`}
                          >
                            {i < currentIdx ? "\u2190" : "\u2192"} {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {stageAccounts.length === 0 && (
                  <div style={{ textAlign: "center", padding: 16, color: COLORS.textMuted, fontSize: 12 }}>Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== SUBMISSION CONSTANTS ====================
const SUBMISSION_STATUSES = [
  { id: "draft",      label: "Draft",     color: "#6b7280" },
  { id: "ready",      label: "Ready",     color: "#3b82f6" },
  { id: "submitted",  label: "Submitted", color: "#f59e0b" },
  { id: "quoted",     label: "Quoted",    color: "#8b5cf6" },
  { id: "bound",      label: "Bound",     color: "#10b981" },
  { id: "declined",   label: "Declined",  color: "#ef4444" },
  { id: "ntu",        label: "NTU",       color: "#6b7280" },
];

const CARRIER_SUBMISSION_STATUSES = ["Submitted", "Quoted", "Declined", "NTU", "Bound"];

const COMMON_LIMITS = ["$100,000", "$300,000", "$500,000", "$1,000,000", "$2,000,000", "$3,000,000", "$5,000,000"];
const COMMON_DEDUCTIBLES = ["$0", "$250", "$500", "$1,000", "$2,500", "$5,000", "$10,000"];

function createEmptySubmission(accountId) {
  return {
    id: uid(),
    accountId,
    status: "draft",
    linesOfBusiness: [],
    effectiveDate: "",
    expirationDate: "",
    notes: "",
    carrierTargets: [],  // Array of { id, carrierName, underwriterName, underwriterContact, dateSubmitted, status, quotedPremium, quoteDate, notes, declinationReason }
    // LOB-specific data
    gl: createEmptyGL(),
    wc: createEmptyWC(),
    property: createEmptyProperty(),
    commercialAuto: createEmptyCommercialAuto(),
    umbrella: createEmptyUmbrella(),
    cyber: createEmptyCyber(),
    created: today(),
    lastModified: today(),
  };
}

function createEmptyGL() {
  return {
    eachOccurrenceLimit: "$1,000,000", generalAggregateLimit: "$2,000,000",
    productsAggregateLimit: "$2,000,000", personalAdvInjury: "$1,000,000",
    fireDamageLimit: "$100,000", medExpLimit: "$5,000", deductible: "$0",
    opsDescription: "", subcontractorsUsed: "No", subcontractorPct: "",
    priorLosses: "", additionalInsuredsNeeded: "No", claimsMadeTrigger: "Occurrence",
    classCode: "", premiumBasis: "Revenue", premiumBasisAmount: "",
  };
}

function createEmptyWC() {
  return {
    state: "FL", ncciState: true,
    classCodes: [{ id: uid(), code: "", description: "", payroll: "", numEmployees: "" }],
    experienceMod: "1.00", priorCarrier: "", lossRuns3yr: "",
    ownerIncluded: "No", ownerPayroll: "",
  };
}

function createEmptyProperty() {
  return {
    locations: [{ id: uid(), address: "", city: "", state: "FL", zip: "", occupancy: "", constructionType: "",
      sqFootage: "", yearBuilt: "", stories: "", buildingValue: "", contentsValue: "", bppValue: "",
      lossOfIncomeLimit: "", alarmType: "", sprinklered: "No" }],
    buildingValuation: "Replacement Cost", blanketCoverage: "No",
    coinsurance: "80%", deductible: "$1,000", windHailDeductible: "2%",
    floodCoverage: "No", eqCoverage: "No",
  };
}

function createEmptyCommercialAuto() {
  return {
    vehicles: [{ id: uid(), year: "", make: "", model: "", vin: "", garagingZip: "", costNew: "", vehicleType: "Private Passenger" }],
    drivers: [{ id: uid(), name: "", dob: "", licenseNumber: "", licenseState: "FL", yearsExperience: "", mvrStatus: "" }],
    radiusOfOps: "Local (under 50 miles)", cargoDescription: "",
    liabilityLimit: "$1,000,000", umLimit: "", medPayLimit: "", compDeductible: "$500", collDeductible: "$500",
  };
}

function createEmptyUmbrella() {
  return {
    limitsRequested: "$1,000,000", retention: "$10,000",
    underlyingSchedule: [],
  };
}

function createEmptyCyber() {
  return {
    annualRevenue: "", dataTypesHandled: "", mfaEnabled: "Yes",
    backupFrequency: "Daily", priorIncidents: "No", priorIncidentDetails: "",
    encryptionUsed: "Yes", employeeTraining: "Yes", limitsRequested: "$1,000,000",
    deductible: "$2,500",
  };
}


// ==================== ACORD FORM HTML GENERATOR ====================
function generateAcord125HTML(account, submission, agency) {
  const ag = agency || AGENCY_CONFIG;
  const fmtD = (d) => { if (!d) return ""; const dt = new Date(d + "T12:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
  const chk = (v) => v ? "X" : "";
  const addr = (a) => a ? [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") : "";
  const mailing = account.mailingAddressSameAsPhysical ? account.physicalAddress : account.mailingAddress;
  const lobs = submission?.linesOfBusiness || account.coverageNeeds || [];

  return `
<style>
@media print { body { margin: 0; } @page { size: letter; margin: 0.3in; } }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; background: #fff; margin: 0; padding: 0; }
.acord { width: 7.5in; margin: 0 auto; padding: 0.1in 0; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; padding: 0; }
.bdr { border: 1.5px solid #000; }
.bdr-t { border-top: 1.5px solid #000; }
.bdr-b { border-bottom: 1.5px solid #000; }
.bdr-l { border-left: 1.5px solid #000; }
.bdr-r { border-right: 1.5px solid #000; }
.cell { padding: 2px 4px; }
.lbl { font-size: 6pt; color: #000; display: block; line-height: 1.2; text-transform: uppercase; }
.val { font-size: 8.5pt; display: block; min-height: 12px; line-height: 1.3; }
.val-b { font-size: 8.5pt; font-weight: bold; display: block; min-height: 12px; }
.hdr { background: #d4dff0; padding: 3px 5px; font-weight: bold; font-size: 7pt; }
.chk { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; text-align: center; font-size: 7pt; line-height: 9px; vertical-align: middle; margin-right: 2px; font-weight: bold; }
.section { margin-top: -1px; }
</style>
<div class="acord">
  <!-- Header -->
  <table class="bdr"><tr>
    <td style="width:12%; padding:4px 6px; vertical-align:middle">
      <div style="font-weight:bold; font-size:14pt; font-style:italic; letter-spacing:-0.5px">ACORD<sup style="font-size:6pt">&reg;</sup></div>
    </td>
    <td style="text-align:center; padding:4px; vertical-align:middle">
      <div style="font-size:12pt; font-weight:bold; letter-spacing:0.5px">COMMERCIAL INSURANCE APPLICATION</div>
    </td>
    <td class="bdr-l" style="width:18%; padding:2px 4px">
      <span class="lbl">DATE (MM/DD/YYYY)</span>
      <span class="val-b">${fmtD(today())}</span>
    </td>
  </tr></table>

  <!-- Applicant Info Header -->
  <table class="bdr section"><tr>
    <td class="hdr" colspan="4">APPLICANT INFORMATION</td>
  </tr></table>

  <!-- Producer + Applicant -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:42%">
        <span class="lbl">Producer</span>
        <span class="val-b">${ag.agencyName}</span>
        <span class="val">${ag.agencyAddress?.street || ""}</span>
        <span class="val">${ag.agencyAddress?.suite || ""}</span>
        <span class="val">${ag.agencyAddress?.city || ""}, ${ag.agencyAddress?.state || ""} ${ag.agencyAddress?.zip || ""}</span>
      </td>
      <td class="cell" style="width:58%">
        <table style="width:100%"><tbody>
          <tr>
            <td class="bdr-b cell" style="width:50%"><span class="lbl">Contact Name</span><span class="val">${ag.defaultProducer || ""}</span></td>
            <td class="bdr-b bdr-l cell" style="width:25%"><span class="lbl">Phone</span><span class="val">${ag.agencyPhone || ""}</span></td>
            <td class="bdr-b bdr-l cell" style="width:25%"><span class="lbl">Fax</span><span class="val">${ag.agencyFax || ""}</span></td>
          </tr>
          <tr>
            <td class="cell" colspan="3"><span class="lbl">E-Mail</span><span class="val">${ag.agencyEmail || ""}</span></td>
          </tr>
        </tbody></table>
      </td>
    </tr>
  </tbody></table>

  <!-- Named Insured -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:42%">
        <span class="lbl">Applicant (First Named Insured)</span>
        <span class="val-b">${account.businessName || ""}</span>
        ${account.dba ? `<span class="val">DBA: ${account.dba}</span>` : ""}
      </td>
      <td class="cell">
        <table style="width:100%"><tbody>
          <tr>
            <td class="bdr-b cell" style="width:50%"><span class="lbl">FEIN</span><span class="val-b">${account.fein || ""}</span></td>
            <td class="bdr-b bdr-l cell" style="width:50%"><span class="lbl">Legal Entity</span><span class="val">${account.entityType || ""}</span></td>
          </tr>
          <tr>
            <td class="cell" style="width:50%"><span class="lbl">SIC Code</span><span class="val">${account.sicCode || ""}</span></td>
            <td class="bdr-l cell" style="width:50%"><span class="lbl">NAICS Code</span><span class="val">${account.naicsCode || ""}</span></td>
          </tr>
        </tbody></table>
      </td>
    </tr>
  </tbody></table>

  <!-- Addresses -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:50%">
        <span class="lbl">Mailing Address</span>
        <span class="val">${mailing?.street || ""}</span>
        <span class="val">${mailing?.city || ""}, ${mailing?.state || ""} ${mailing?.zip || ""}</span>
      </td>
      <td class="cell">
        <span class="lbl">Physical Address (If different)</span>
        ${account.mailingAddressSameAsPhysical ? '<span class="val">Same as mailing</span>' :
          `<span class="val">${account.physicalAddress?.street || ""}</span>
          <span class="val">${account.physicalAddress?.city || ""}, ${account.physicalAddress?.state || ""} ${account.physicalAddress?.zip || ""}</span>`}
      </td>
    </tr>
  </tbody></table>

  <!-- Business Details -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">Date Business Started</span><span class="val">${fmtD(account.dateEstablished)}</span></td>
      <td class="bdr-r cell" style="width:15%"><span class="lbl">Years in Business</span><span class="val">${account.yearsInBusiness || ""}</span></td>
      <td class="bdr-r cell" style="width:15%"><span class="lbl">FT Employees</span><span class="val">${account.employeesFT || ""}</span></td>
      <td class="bdr-r cell" style="width:15%"><span class="lbl">PT Employees</span><span class="val">${account.employeesPT || ""}</span></td>
      <td class="bdr-r cell" style="width:15%"><span class="lbl">Annual Revenue</span><span class="val">${account.annualGrossRevenue ? "$" + Number(account.annualGrossRevenue).toLocaleString() : ""}</span></td>
      <td class="cell" style="width:15%"><span class="lbl">Annual Payroll</span><span class="val">${account.totalPayroll ? "$" + Number(account.totalPayroll).toLocaleString() : ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Contact -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:30%"><span class="lbl">Contact Name</span><span class="val">${account.primaryContact?.name || ""}</span></td>
      <td class="bdr-r cell" style="width:20%"><span class="lbl">Title</span><span class="val">${account.primaryContact?.title || ""}</span></td>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">Phone</span><span class="val">${account.primaryContact?.phone || ""}</span></td>
      <td class="cell" style="width:25%"><span class="lbl">Email</span><span class="val">${account.primaryContact?.email || ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Description of Operations -->
  <table class="bdr section"><tbody>
    <tr><td class="cell"><span class="lbl">Description of Primary Operations</span><span class="val" style="min-height:30px">${account.industryDescription || ""}</span></td></tr>
  </tbody></table>

  <!-- Coverage Requested -->
  <table class="bdr section"><tr><td class="hdr">COVERAGE REQUESTED</td></tr></table>
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">Proposed Eff Date</span><span class="val-b">${fmtD(submission?.effectiveDate)}</span></td>
      <td class="cell" style="width:25%"><span class="lbl">Proposed Exp Date</span><span class="val-b">${fmtD(submission?.expirationDate)}</span></td>
      <td class="bdr-l cell" style="width:50%">
        <span class="lbl">Lines of Business</span>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:2px">
          ${COVERAGE_OPTIONS.map(c =>
            `<span><span class="chk">${lobs.includes(c.id) ? "X" : ""}</span> <span style="font-size:7pt">${c.label}</span></span>`
          ).join("")}
        </div>
      </td>
    </tr>
  </tbody></table>

  <div style="margin-top:12px; text-align:center; font-size:6pt; color:#666">
    ACORD 125 (2016/03) &copy; ACORD CORPORATION. All rights reserved. Generated by Sentinel CRM.
  </div>
</div>`;
}

function generateAcord126HTML(account, submission, agency) {
  const ag = agency || AGENCY_CONFIG;
  const gl = submission?.gl || {};
  const fmtD = (d) => { if (!d) return ""; const dt = new Date(d + "T12:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };

  return `
<style>
@media print { body { margin: 0; } @page { size: letter; margin: 0.3in; } }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; background: #fff; }
.acord { width: 7.5in; margin: 0 auto; padding: 0.1in 0; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; padding: 0; }
.bdr { border: 1.5px solid #000; } .bdr-t { border-top: 1.5px solid #000; } .bdr-b { border-bottom: 1.5px solid #000; } .bdr-l { border-left: 1.5px solid #000; } .bdr-r { border-right: 1.5px solid #000; }
.cell { padding: 2px 4px; }
.lbl { font-size: 6pt; color: #000; display: block; line-height: 1.2; text-transform: uppercase; }
.val { font-size: 8.5pt; display: block; min-height: 12px; line-height: 1.3; }
.val-b { font-size: 8.5pt; font-weight: bold; display: block; min-height: 12px; }
.hdr { background: #d4dff0; padding: 3px 5px; font-weight: bold; font-size: 7pt; }
.chk { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; text-align: center; font-size: 7pt; line-height: 9px; vertical-align: middle; margin-right: 2px; font-weight: bold; }
.section { margin-top: -1px; }
</style>
<div class="acord">
  <table class="bdr"><tr>
    <td style="width:12%; padding:4px 6px; vertical-align:middle"><div style="font-weight:bold; font-size:14pt; font-style:italic">ACORD<sup style="font-size:6pt">&reg;</sup></div></td>
    <td style="text-align:center; padding:4px; vertical-align:middle"><div style="font-size:12pt; font-weight:bold">COMMERCIAL GENERAL LIABILITY SECTION</div></td>
    <td class="bdr-l" style="width:18%; padding:2px 4px"><span class="lbl">DATE</span><span class="val-b">${fmtD(today())}</span></td>
  </tr></table>

  <!-- Applicant -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:50%"><span class="lbl">Applicant Name</span><span class="val-b">${account.businessName || ""}</span></td>
      <td class="cell"><span class="lbl">Policy Number</span><span class="val"></span></td>
    </tr>
  </tbody></table>

  <!-- Coverage -->
  <table class="bdr section"><tr><td class="hdr">COVERAGE</td></tr></table>
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:50%">
        <span class="lbl">Type</span>
        <div style="margin-top:2px">
          <span><span class="chk">${gl.claimsMadeTrigger === "Occurrence" ? "X" : ""}</span> Occurrence</span>&nbsp;&nbsp;
          <span><span class="chk">${gl.claimsMadeTrigger === "Claims Made" ? "X" : ""}</span> Claims Made</span>
        </div>
      </td>
      <td class="cell"><span class="lbl">Deductible</span><span class="val">${gl.deductible || ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Limits -->
  <table class="bdr section"><tr><td class="hdr">LIMITS OF INSURANCE</td></tr></table>
  <table class="bdr section"><tbody>
    <tr><td class="bdr-r cell" style="width:60%"><span class="lbl">Each Occurrence</span></td><td class="cell"><span class="val-b">${gl.eachOccurrenceLimit || ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">General Aggregate</span></td><td class="bdr-t cell"><span class="val-b">${gl.generalAggregateLimit || ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">Products-Comp/Op Aggregate</span></td><td class="bdr-t cell"><span class="val-b">${gl.productsAggregateLimit || ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">Personal & Advertising Injury</span></td><td class="bdr-t cell"><span class="val-b">${gl.personalAdvInjury || ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">Fire Damage (Any one fire)</span></td><td class="bdr-t cell"><span class="val">${gl.fireDamageLimit || ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">Medical Expense (Any one person)</span></td><td class="bdr-t cell"><span class="val">${gl.medExpLimit || ""}</span></td></tr>
  </tbody></table>

  <!-- Classification -->
  <table class="bdr section"><tr><td class="hdr">CLASSIFICATION</td></tr></table>
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:15%"><span class="lbl">Class Code</span><span class="val">${gl.classCode || account.sicCode || ""}</span></td>
      <td class="bdr-r cell" style="width:45%"><span class="lbl">Classification / Description</span><span class="val">${account.industryDescription || ""}</span></td>
      <td class="bdr-r cell" style="width:20%"><span class="lbl">Premium Basis</span><span class="val">${gl.premiumBasis || ""}</span></td>
      <td class="cell" style="width:20%"><span class="lbl">Basis Amount</span><span class="val">${gl.premiumBasisAmount ? "$" + Number(gl.premiumBasisAmount).toLocaleString() : (account.annualGrossRevenue ? "$" + Number(account.annualGrossRevenue).toLocaleString() : "")}</span></td>
    </tr>
  </tbody></table>

  <!-- UW Questions -->
  <table class="bdr section"><tr><td class="hdr">UNDERWRITING INFORMATION</td></tr></table>
  <table class="bdr section"><tbody>
    <tr><td class="bdr-r cell" style="width:70%"><span class="lbl">Description of Operations</span><span class="val" style="min-height:24px">${gl.opsDescription || account.industryDescription || ""}</span></td>
    <td class="cell"><span class="lbl">Subcontractors Used</span><span class="val">${gl.subcontractorsUsed || ""}${gl.subcontractorPct ? " (" + gl.subcontractorPct + "%)" : ""}</span></td></tr>
    <tr><td class="bdr-r bdr-t cell"><span class="lbl">Additional Insureds Needed</span><span class="val">${gl.additionalInsuredsNeeded || ""}</span></td>
    <td class="bdr-t cell"><span class="lbl">Prior Losses (3 yr)</span><span class="val">${gl.priorLosses || ""}</span></td></tr>
  </tbody></table>

  <div style="margin-top:12px; text-align:center; font-size:6pt; color:#666">ACORD 126 (2016/03) - Generated by Sentinel CRM</div>
</div>`;
}

function generateAcord130HTML(account, submission, agency) {
  const ag = agency || AGENCY_CONFIG;
  const wc = submission?.wc || {};
  const classCodes = wc.classCodes || [];
  const fmtD = (d) => { if (!d) return ""; const dt = new Date(d + "T12:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };

  return `
<style>
@media print { body { margin: 0; } @page { size: letter; margin: 0.3in; } }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; background: #fff; }
.acord { width: 7.5in; margin: 0 auto; padding: 0.1in 0; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; padding: 0; }
.bdr { border: 1.5px solid #000; } .bdr-t { border-top: 1.5px solid #000; } .bdr-b { border-bottom: 1.5px solid #000; } .bdr-l { border-left: 1.5px solid #000; } .bdr-r { border-right: 1.5px solid #000; }
.cell { padding: 2px 4px; }
.lbl { font-size: 6pt; color: #000; display: block; line-height: 1.2; text-transform: uppercase; }
.val { font-size: 8.5pt; display: block; min-height: 12px; line-height: 1.3; }
.val-b { font-size: 8.5pt; font-weight: bold; display: block; min-height: 12px; }
.hdr { background: #d4dff0; padding: 3px 5px; font-weight: bold; font-size: 7pt; }
.section { margin-top: -1px; }
</style>
<div class="acord">
  <table class="bdr"><tr>
    <td style="width:12%; padding:4px 6px; vertical-align:middle"><div style="font-weight:bold; font-size:14pt; font-style:italic">ACORD<sup style="font-size:6pt">&reg;</sup></div></td>
    <td style="text-align:center; padding:4px; vertical-align:middle"><div style="font-size:12pt; font-weight:bold">WORKERS COMPENSATION APPLICATION</div></td>
    <td class="bdr-l" style="width:18%; padding:2px 4px"><span class="lbl">DATE</span><span class="val-b">${fmtD(today())}</span></td>
  </tr></table>

  <!-- Applicant -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:50%"><span class="lbl">Applicant Name</span><span class="val-b">${account.businessName || ""}</span></td>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">FEIN</span><span class="val">${account.fein || ""}</span></td>
      <td class="cell"><span class="lbl">Entity Type</span><span class="val">${account.entityType || ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Dates -->
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">Proposed Eff Date</span><span class="val-b">${fmtD(submission?.effectiveDate)}</span></td>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">Proposed Exp Date</span><span class="val-b">${fmtD(submission?.expirationDate)}</span></td>
      <td class="bdr-r cell" style="width:25%"><span class="lbl">State</span><span class="val-b">${wc.state || "FL"}</span></td>
      <td class="cell"><span class="lbl">Experience Mod</span><span class="val-b">${wc.experienceMod || ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Class Codes -->
  <table class="bdr section"><tr><td class="hdr">CLASSIFICATION / PAYROLL</td></tr></table>
  <table class="bdr section"><tbody>
    <tr style="background:#f0f0f0">
      <td class="bdr-r cell" style="width:15%; font-weight:bold; font-size:7pt">CLASS CODE</td>
      <td class="bdr-r cell" style="width:40%; font-weight:bold; font-size:7pt">DESCRIPTION</td>
      <td class="bdr-r cell" style="width:15%; font-weight:bold; font-size:7pt"># EMPLOYEES</td>
      <td class="cell" style="width:30%; font-weight:bold; font-size:7pt">ANNUAL PAYROLL</td>
    </tr>
    ${classCodes.map(cc => `<tr>
      <td class="bdr-r bdr-t cell"><span class="val">${cc.code || ""}</span></td>
      <td class="bdr-r bdr-t cell"><span class="val">${cc.description || ""}</span></td>
      <td class="bdr-r bdr-t cell"><span class="val">${cc.numEmployees || ""}</span></td>
      <td class="bdr-t cell"><span class="val">${cc.payroll ? "$" + Number(cc.payroll).toLocaleString() : ""}</span></td>
    </tr>`).join("")}
    ${classCodes.length === 0 ? '<tr><td colspan="4" class="bdr-t cell" style="text-align:center; color:#999; padding:8px">No class codes entered</td></tr>' : ''}
    <tr style="background:#f0f4f8">
      <td class="bdr-r bdr-t cell" colspan="2" style="font-weight:bold; font-size:7pt; text-align:right; padding-right:8px">TOTALS</td>
      <td class="bdr-r bdr-t cell"><span class="val-b">${account.employeesFT || ""}</span></td>
      <td class="bdr-t cell"><span class="val-b">${account.totalPayroll ? "$" + Number(account.totalPayroll).toLocaleString() : ""}</span></td>
    </tr>
  </tbody></table>

  <!-- Experience -->
  <table class="bdr section"><tr><td class="hdr">PRIOR COVERAGE / EXPERIENCE</td></tr></table>
  <table class="bdr section"><tbody>
    <tr>
      <td class="bdr-r cell" style="width:40%"><span class="lbl">Prior Carrier</span><span class="val">${wc.priorCarrier || ""}</span></td>
      <td class="bdr-r cell" style="width:30%"><span class="lbl">Owner Included/Excluded</span><span class="val">${wc.ownerIncluded || ""}</span></td>
      <td class="cell"><span class="lbl">Owner Payroll</span><span class="val">${wc.ownerPayroll ? "$" + Number(wc.ownerPayroll).toLocaleString() : ""}</span></td>
    </tr>
    <tr><td class="bdr-t cell" colspan="3"><span class="lbl">Loss Runs / Loss History (3 Years)</span><span class="val" style="min-height:30px">${wc.lossRuns3yr || ""}</span></td></tr>
  </tbody></table>

  <div style="margin-top:12px; text-align:center; font-size:6pt; color:#666">ACORD 130 (2014/01) - Generated by Sentinel CRM</div>
</div>`;
}


// ==================== ACORD PREVIEW MODAL ====================
function AcordPreviewModal({ formName, html, account, onClose, COLORS, S }) {
  const printRef = useRef(null);
  const handlePrint = () => {
    const win = window.open("", "_blank", "width=850,height=1100");
    win.document.write(`<!DOCTYPE html><html><head><title>${formName} - ${account?.businessName || "ACORD"}</title></head><body>`);
    win.document.write(html);
    win.document.write("</body></html>");
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div style={S.overlay} onClick={onClose} data-modal="true">
      <div style={{ background: "#fff", borderRadius: 8, width: "95%", maxWidth: 850, maxHeight: "92vh", overflow: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, borderRadius: "8px 8px 0 0", position: "sticky", top: 0, zIndex: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{formName} Preview</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.btn(), fontSize: 12 }} onClick={handlePrint}>Print / Save PDF</button>
            <button style={{ ...S.btn("ghost"), fontSize: 12, color: COLORS.textDim }} onClick={onClose}>Close</button>
          </div>
        </div>
        <div ref={printRef} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}


// ==================== SUBMISSION BUILDER ====================
function SubmissionBuilder({ account, existingSubmission, data, COLORS, S, onSave, onCancel }) {
  const [sub, setSub] = useState(existingSubmission || createEmptySubmission(account.id));
  const [activeTab, setActiveTab] = useState("overview");
  const [acordPreview, setAcordPreview] = useState(null);

  const update = (field, value) => setSub(prev => ({ ...prev, [field]: value }));
  const updateLobData = (lob, field, value) => setSub(prev => ({ ...prev, [lob]: { ...prev[lob], [field]: value } }));

  const toggleLOB = (lobId) => {
    const current = sub.linesOfBusiness;
    if (current.includes(lobId)) {
      update("linesOfBusiness", current.filter(l => l !== lobId));
    } else {
      update("linesOfBusiness", [...current, lobId]);
    }
  };

  const handleSave = () => {
    onSave({ ...sub, lastModified: today() });
  };

  const handleGenerateAcord = (formName) => {
    let html = "";
    if (formName === "ACORD 125") html = generateAcord125HTML(account, sub, AGENCY_CONFIG);
    else if (formName === "ACORD 126") html = generateAcord126HTML(account, sub, AGENCY_CONFIG);
    else if (formName === "ACORD 130") html = generateAcord130HTML(account, sub, AGENCY_CONFIG);
    if (html) setAcordPreview({ formName, html });
  };

  // Determine available ACORD forms
  const availableForms = [{ name: "ACORD 125", desc: "Commercial Application", always: true }];
  if (sub.linesOfBusiness.includes("GL") || sub.linesOfBusiness.includes("BOP")) availableForms.push({ name: "ACORD 126", desc: "General Liability Section" });
  if (sub.linesOfBusiness.includes("Workers Comp")) availableForms.push({ name: "ACORD 130", desc: "Workers Compensation" });

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(sub.linesOfBusiness.includes("GL") || sub.linesOfBusiness.includes("BOP") ? [{ id: "gl", label: "General Liability" }] : []),
    ...(sub.linesOfBusiness.includes("Workers Comp") ? [{ id: "wc", label: "Workers Comp" }] : []),
    ...(sub.linesOfBusiness.includes("Property") || sub.linesOfBusiness.includes("BOP") ? [{ id: "property", label: "Property" }] : []),
    ...(sub.linesOfBusiness.includes("Commercial Auto") ? [{ id: "auto", label: "Commercial Auto" }] : []),
    ...(sub.linesOfBusiness.includes("Umbrella") ? [{ id: "umbrella", label: "Umbrella" }] : []),
    ...(sub.linesOfBusiness.includes("Cyber") ? [{ id: "cyber", label: "Cyber" }] : []),
    { id: "carriers", label: "Carriers" },
    { id: "acord", label: "ACORD Forms" },
  ];

  const inputStyle = S.input;
  const selectStyle = S.select;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(tab => (
          <button key={tab.id} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: activeTab === tab.id ? 600 : 400, cursor: "pointer",
            background: "transparent", border: "none",
            color: activeTab === tab.id ? COLORS.accent : COLORS.textDim,
            borderBottom: activeTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
          }} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16, padding: "8px 12px", background: `${COLORS.accent}08`, borderRadius: 6 }}>
            Building submission for <strong>{account.businessName}</strong>. Select lines of business, fill in coverage details, then generate ACORD forms.
          </div>
          <div style={S.formRow}>
            <FormField label="Effective Date" required>
              <input style={inputStyle} type="date" value={sub.effectiveDate} onChange={e => update("effectiveDate", e.target.value)} />
            </FormField>
            <FormField label="Expiration Date" required>
              <input style={inputStyle} type="date" value={sub.expirationDate} onChange={e => {
                update("expirationDate", e.target.value);
                if (!sub.effectiveDate && e.target.value) {
                  const d = new Date(e.target.value + "T12:00:00");
                  d.setFullYear(d.getFullYear() - 1);
                  update("effectiveDate", d.toISOString().split("T")[0]);
                }
              }} />
            </FormField>
          </div>
          <FormField label="Lines of Business" required>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
              {COVERAGE_OPTIONS.map(cov => {
                const selected = sub.linesOfBusiness.includes(cov.id);
                return (
                  <div key={cov.id} onClick={() => toggleLOB(cov.id)} style={{
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    border: `1.5px solid ${selected ? COLORS.accent : COLORS.border}`,
                    background: selected ? `${COLORS.accent}12` : "transparent",
                  }}>
                    <div style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, background: selected ? COLORS.accent : COLORS.border, color: selected ? "#fff" : COLORS.textDim }}>
                      {cov.icon}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? COLORS.text : COLORS.textDim }}>{cov.label}</span>
                  </div>
                );
              })}
            </div>
          </FormField>
          <FormField label="Submission Notes">
            <textarea style={S.textarea} value={sub.notes} onChange={e => update("notes", e.target.value)} placeholder="Underwriting narrative, special considerations..." />
          </FormField>
        </div>
      )}

      {/* GL TAB */}
      {activeTab === "gl" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>General Liability Details</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12, padding: "6px 10px", background: `${COLORS.info}10`, borderRadius: 6 }}>
            These fields populate ACORD 126 (Commercial General Liability Section)
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: COLORS.text }}>Limits</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Each Occurrence" required>
              <select style={selectStyle} value={sub.gl.eachOccurrenceLimit} onChange={e => updateLobData("gl", "eachOccurrenceLimit", e.target.value)}>
                {COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="General Aggregate" required>
              <select style={selectStyle} value={sub.gl.generalAggregateLimit} onChange={e => updateLobData("gl", "generalAggregateLimit", e.target.value)}>
                {COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Products Aggregate" required>
              <select style={selectStyle} value={sub.gl.productsAggregateLimit} onChange={e => updateLobData("gl", "productsAggregateLimit", e.target.value)}>
                {COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Personal & Adv Injury">
              <select style={selectStyle} value={sub.gl.personalAdvInjury} onChange={e => updateLobData("gl", "personalAdvInjury", e.target.value)}>
                {COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Fire Damage Limit">
              <select style={selectStyle} value={sub.gl.fireDamageLimit} onChange={e => updateLobData("gl", "fireDamageLimit", e.target.value)}>
                {["$50,000", "$100,000", "$300,000", "$500,000"].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Med Expense">
              <select style={selectStyle} value={sub.gl.medExpLimit} onChange={e => updateLobData("gl", "medExpLimit", e.target.value)}>
                {["$5,000", "$10,000", "$15,000", "$25,000"].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
          </div>
          <div style={S.formRow}>
            <FormField label="Deductible">
              <select style={selectStyle} value={sub.gl.deductible} onChange={e => updateLobData("gl", "deductible", e.target.value)}>
                {COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
            <FormField label="Coverage Trigger" required>
              <select style={selectStyle} value={sub.gl.claimsMadeTrigger} onChange={e => updateLobData("gl", "claimsMadeTrigger", e.target.value)}>
                <option value="Occurrence">Occurrence</option>
                <option value="Claims Made">Claims Made</option>
              </select>
            </FormField>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8, color: COLORS.text }}>Classification</div>
          <div style={S.formRow3}>
            <FormField label="Class Code">
              <input style={inputStyle} value={sub.gl.classCode} onChange={e => updateLobData("gl", "classCode", e.target.value)} placeholder="e.g. 91580" />
            </FormField>
            <FormField label="Premium Basis">
              <select style={selectStyle} value={sub.gl.premiumBasis} onChange={e => updateLobData("gl", "premiumBasis", e.target.value)}>
                <option value="Revenue">Revenue</option><option value="Payroll">Payroll</option>
                <option value="Area">Area (Sq Ft)</option><option value="Units">Units</option>
              </select>
            </FormField>
            <FormField label="Basis Amount">
              <input style={inputStyle} type="number" value={sub.gl.premiumBasisAmount} onChange={e => updateLobData("gl", "premiumBasisAmount", e.target.value)} placeholder={account.annualGrossRevenue ? `Auto: $${Number(account.annualGrossRevenue).toLocaleString()}` : "$"} />
            </FormField>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8, color: COLORS.text }}>Underwriting Questions</div>
          <FormField label="Description of Operations" required>
            <textarea style={S.textarea} value={sub.gl.opsDescription} onChange={e => updateLobData("gl", "opsDescription", e.target.value)}
              placeholder={account.industryDescription || "Describe operations..."} />
          </FormField>
          <div style={S.formRow}>
            <FormField label="Subcontractors Used?" required>
              <select style={selectStyle} value={sub.gl.subcontractorsUsed} onChange={e => updateLobData("gl", "subcontractorsUsed", e.target.value)}>
                <option value="No">No</option><option value="Yes">Yes</option>
              </select>
            </FormField>
            {sub.gl.subcontractorsUsed === "Yes" && (
              <FormField label="% Subcontracted">
                <input style={inputStyle} type="number" value={sub.gl.subcontractorPct} onChange={e => updateLobData("gl", "subcontractorPct", e.target.value)} placeholder="%" />
              </FormField>
            )}
            <FormField label="Additional Insureds Needed?">
              <select style={selectStyle} value={sub.gl.additionalInsuredsNeeded} onChange={e => updateLobData("gl", "additionalInsuredsNeeded", e.target.value)}>
                <option value="No">No</option><option value="Yes">Yes</option>
              </select>
            </FormField>
          </div>
          <FormField label="Prior Losses (3 years)" required>
            <textarea style={S.textarea} value={sub.gl.priorLosses} onChange={e => updateLobData("gl", "priorLosses", e.target.value)}
              placeholder="Describe claims history for past 3 years, or 'None'" />
          </FormField>
        </div>
      )}

      {/* WC TAB */}
      {activeTab === "wc" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Workers Compensation Details</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12, padding: "6px 10px", background: `${COLORS.info}10`, borderRadius: 6 }}>
            These fields populate ACORD 130 (Workers Compensation Application)
          </div>
          <div style={S.formRow3}>
            <FormField label="State" required>
              <input style={inputStyle} value={sub.wc.state} onChange={e => updateLobData("wc", "state", e.target.value)} />
            </FormField>
            <FormField label="Experience Mod" required>
              <input style={inputStyle} value={sub.wc.experienceMod} onChange={e => updateLobData("wc", "experienceMod", e.target.value)} placeholder="1.00" />
            </FormField>
            <FormField label="Owner Included/Excluded">
              <select style={selectStyle} value={sub.wc.ownerIncluded} onChange={e => updateLobData("wc", "ownerIncluded", e.target.value)}>
                <option value="No">Excluded</option><option value="Yes">Included</option>
              </select>
            </FormField>
          </div>

          {/* Class Codes */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Class Codes & Payroll</div>
            <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => {
              updateLobData("wc", "classCodes", [...sub.wc.classCodes, { id: uid(), code: "", description: "", payroll: "", numEmployees: "" }]);
            }}>+ Add Class Code</button>
          </div>
          {sub.wc.classCodes.map((cc, idx) => (
            <div key={cc.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 100px 140px 30px", gap: 8, marginBottom: 8, alignItems: "end" }}>
              <FormField label={idx === 0 ? "Code" : ""}>
                <input style={inputStyle} value={cc.code} onChange={e => {
                  const updated = [...sub.wc.classCodes]; updated[idx] = { ...updated[idx], code: e.target.value };
                  updateLobData("wc", "classCodes", updated);
                }} placeholder="e.g. 8810" />
              </FormField>
              <FormField label={idx === 0 ? "Description" : ""}>
                <input style={inputStyle} value={cc.description} onChange={e => {
                  const updated = [...sub.wc.classCodes]; updated[idx] = { ...updated[idx], description: e.target.value };
                  updateLobData("wc", "classCodes", updated);
                }} placeholder="Clerical" />
              </FormField>
              <FormField label={idx === 0 ? "# Employees" : ""}>
                <input style={inputStyle} type="number" value={cc.numEmployees} onChange={e => {
                  const updated = [...sub.wc.classCodes]; updated[idx] = { ...updated[idx], numEmployees: e.target.value };
                  updateLobData("wc", "classCodes", updated);
                }} />
              </FormField>
              <FormField label={idx === 0 ? "Annual Payroll" : ""}>
                <input style={inputStyle} type="number" value={cc.payroll} onChange={e => {
                  const updated = [...sub.wc.classCodes]; updated[idx] = { ...updated[idx], payroll: e.target.value };
                  updateLobData("wc", "classCodes", updated);
                }} placeholder="$" />
              </FormField>
              {sub.wc.classCodes.length > 1 && (
                <button style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14, marginBottom: 16 }}
                  onClick={() => updateLobData("wc", "classCodes", sub.wc.classCodes.filter((_, i) => i !== idx))}>
                  \u2715
                </button>
              )}
            </div>
          ))}

          <div style={S.formRow}>
            <FormField label="Prior Carrier" required>
              <input style={inputStyle} value={sub.wc.priorCarrier} onChange={e => updateLobData("wc", "priorCarrier", e.target.value)} />
            </FormField>
            <FormField label="Owner Payroll (if included)">
              <input style={inputStyle} type="number" value={sub.wc.ownerPayroll} onChange={e => updateLobData("wc", "ownerPayroll", e.target.value)} placeholder="$" />
            </FormField>
          </div>
          <FormField label="Loss Runs / History (3 years)" required>
            <textarea style={S.textarea} value={sub.wc.lossRuns3yr} onChange={e => updateLobData("wc", "lossRuns3yr", e.target.value)}
              placeholder="Summarize 3-year WC loss history..." />
          </FormField>
        </div>
      )}

      {/* PROPERTY TAB */}
      {activeTab === "property" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Commercial Property Details</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12, padding: "6px 10px", background: `${COLORS.info}10`, borderRadius: 6 }}>
            These fields populate ACORD 140 (Property Section)
          </div>
          {sub.property.locations.map((loc, idx) => (
            <div key={loc.id} style={{ ...S.card, marginBottom: 12, position: "relative" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Location {idx + 1}</div>
              {sub.property.locations.length > 1 && (
                <button style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: COLORS.danger, cursor: "pointer" }}
                  onClick={() => updateLobData("property", "locations", sub.property.locations.filter((_, i) => i !== idx))}>
                  \u2715
                </button>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 60px 80px", gap: 8 }}>
                <FormField label="Address"><input style={inputStyle} value={loc.address} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], address: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="City"><input style={inputStyle} value={loc.city} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], city: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="State"><input style={inputStyle} value={loc.state} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], state: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="ZIP"><input style={inputStyle} value={loc.zip} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], zip: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                <FormField label="Occupancy"><input style={inputStyle} value={loc.occupancy} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], occupancy: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="Construction"><select style={selectStyle} value={loc.constructionType} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], constructionType: e.target.value }; updateLobData("property", "locations", u); }}>
                  <option value="">Select...</option><option value="Frame">Frame</option><option value="Joisted Masonry">Joisted Masonry</option><option value="Non-Combustible">Non-Combustible</option><option value="Masonry Non-Combustible">Masonry NC</option><option value="Fire Resistive">Fire Resistive</option>
                </select></FormField>
                <FormField label="Sq Footage"><input style={inputStyle} type="number" value={loc.sqFootage} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], sqFootage: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="Year Built"><input style={inputStyle} type="number" value={loc.yearBuilt} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], yearBuilt: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
                <FormField label="Stories"><input style={inputStyle} type="number" value={loc.stories} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], stories: e.target.value }; updateLobData("property", "locations", u); }} /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <FormField label="Building Value"><input style={inputStyle} type="number" value={loc.buildingValue} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], buildingValue: e.target.value }; updateLobData("property", "locations", u); }} placeholder="$" /></FormField>
                <FormField label="Contents Value"><input style={inputStyle} type="number" value={loc.contentsValue} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], contentsValue: e.target.value }; updateLobData("property", "locations", u); }} placeholder="$" /></FormField>
                <FormField label="BPP"><input style={inputStyle} type="number" value={loc.bppValue} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], bppValue: e.target.value }; updateLobData("property", "locations", u); }} placeholder="$" /></FormField>
                <FormField label="Loss of Income"><input style={inputStyle} type="number" value={loc.lossOfIncomeLimit} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], lossOfIncomeLimit: e.target.value }; updateLobData("property", "locations", u); }} placeholder="$" /></FormField>
              </div>
              <div style={S.formRow}>
                <FormField label="Alarm Type"><input style={inputStyle} value={loc.alarmType} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], alarmType: e.target.value }; updateLobData("property", "locations", u); }} placeholder="Central, Local, None" /></FormField>
                <FormField label="Sprinklered?"><select style={selectStyle} value={loc.sprinklered} onChange={e => { const u = [...sub.property.locations]; u[idx] = { ...u[idx], sprinklered: e.target.value }; updateLobData("property", "locations", u); }}><option value="No">No</option><option value="Yes">Yes</option><option value="Partial">Partial</option></select></FormField>
              </div>
            </div>
          ))}
          <button style={{ ...S.btn("ghost"), fontSize: 12, marginBottom: 16 }} onClick={() => {
            updateLobData("property", "locations", [...sub.property.locations, { id: uid(), address: "", city: "", state: "FL", zip: "", occupancy: "", constructionType: "", sqFootage: "", yearBuilt: "", stories: "", buildingValue: "", contentsValue: "", bppValue: "", lossOfIncomeLimit: "", alarmType: "", sprinklered: "No" }]);
          }}>+ Add Location</button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Valuation"><select style={selectStyle} value={sub.property.buildingValuation} onChange={e => updateLobData("property", "buildingValuation", e.target.value)}><option value="Replacement Cost">Replacement Cost</option><option value="Actual Cash Value">ACV</option><option value="Functional">Functional</option></select></FormField>
            <FormField label="Deductible"><select style={selectStyle} value={sub.property.deductible} onChange={e => updateLobData("property", "deductible", e.target.value)}>{COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}</select></FormField>
            <FormField label="Wind/Hail Ded"><input style={inputStyle} value={sub.property.windHailDeductible} onChange={e => updateLobData("property", "windHailDeductible", e.target.value)} placeholder="2%" /></FormField>
            <FormField label="Coinsurance"><select style={selectStyle} value={sub.property.coinsurance} onChange={e => updateLobData("property", "coinsurance", e.target.value)}><option value="80%">80%</option><option value="90%">90%</option><option value="100%">100%</option></select></FormField>
          </div>
        </div>
      )}

      {/* COMMERCIAL AUTO TAB */}
      {activeTab === "auto" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Commercial Auto Details</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Vehicle Schedule</div>
          {sub.commercialAuto.vehicles.map((v, idx) => (
            <div key={v.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 2fr 100px 80px 30px", gap: 6, marginBottom: 6, alignItems: "end" }}>
              <FormField label={idx === 0 ? "Year" : ""}><input style={inputStyle} value={v.year} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], year: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              <FormField label={idx === 0 ? "Make" : ""}><input style={inputStyle} value={v.make} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], make: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              <FormField label={idx === 0 ? "Model" : ""}><input style={inputStyle} value={v.model} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], model: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              <FormField label={idx === 0 ? "VIN" : ""}><input style={inputStyle} value={v.vin} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], vin: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              <FormField label={idx === 0 ? "Garaging ZIP" : ""}><input style={inputStyle} value={v.garagingZip} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], garagingZip: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              <FormField label={idx === 0 ? "Cost New" : ""}><input style={inputStyle} type="number" value={v.costNew} onChange={e => { const u = [...sub.commercialAuto.vehicles]; u[idx] = { ...u[idx], costNew: e.target.value }; updateLobData("commercialAuto", "vehicles", u); }} /></FormField>
              {sub.commercialAuto.vehicles.length > 1 && <button style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14, marginBottom: 16 }} onClick={() => updateLobData("commercialAuto", "vehicles", sub.commercialAuto.vehicles.filter((_, i) => i !== idx))}>\u2715</button>}
            </div>
          ))}
          <button style={{ ...S.btn("ghost"), fontSize: 12, marginBottom: 16 }} onClick={() => updateLobData("commercialAuto", "vehicles", [...sub.commercialAuto.vehicles, { id: uid(), year: "", make: "", model: "", vin: "", garagingZip: "", costNew: "", vehicleType: "Private Passenger" }])}>+ Add Vehicle</button>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Driver List</div>
          {sub.commercialAuto.drivers.map((d, idx) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr 60px 80px 30px", gap: 6, marginBottom: 6, alignItems: "end" }}>
              <FormField label={idx === 0 ? "Name" : ""}><input style={inputStyle} value={d.name} onChange={e => { const u = [...sub.commercialAuto.drivers]; u[idx] = { ...u[idx], name: e.target.value }; updateLobData("commercialAuto", "drivers", u); }} /></FormField>
              <FormField label={idx === 0 ? "DOB" : ""}><input style={inputStyle} type="date" value={d.dob} onChange={e => { const u = [...sub.commercialAuto.drivers]; u[idx] = { ...u[idx], dob: e.target.value }; updateLobData("commercialAuto", "drivers", u); }} /></FormField>
              <FormField label={idx === 0 ? "License #" : ""}><input style={inputStyle} value={d.licenseNumber} onChange={e => { const u = [...sub.commercialAuto.drivers]; u[idx] = { ...u[idx], licenseNumber: e.target.value }; updateLobData("commercialAuto", "drivers", u); }} /></FormField>
              <FormField label={idx === 0 ? "State" : ""}><input style={inputStyle} value={d.licenseState} onChange={e => { const u = [...sub.commercialAuto.drivers]; u[idx] = { ...u[idx], licenseState: e.target.value }; updateLobData("commercialAuto", "drivers", u); }} /></FormField>
              <FormField label={idx === 0 ? "Yrs Exp" : ""}><input style={inputStyle} type="number" value={d.yearsExperience} onChange={e => { const u = [...sub.commercialAuto.drivers]; u[idx] = { ...u[idx], yearsExperience: e.target.value }; updateLobData("commercialAuto", "drivers", u); }} /></FormField>
              {sub.commercialAuto.drivers.length > 1 && <button style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14, marginBottom: 16 }} onClick={() => updateLobData("commercialAuto", "drivers", sub.commercialAuto.drivers.filter((_, i) => i !== idx))}>\u2715</button>}
            </div>
          ))}
          <button style={{ ...S.btn("ghost"), fontSize: 12, marginBottom: 16 }} onClick={() => updateLobData("commercialAuto", "drivers", [...sub.commercialAuto.drivers, { id: uid(), name: "", dob: "", licenseNumber: "", licenseState: "FL", yearsExperience: "", mvrStatus: "" }])}>+ Add Driver</button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Liability Limit"><select style={selectStyle} value={sub.commercialAuto.liabilityLimit} onChange={e => updateLobData("commercialAuto", "liabilityLimit", e.target.value)}>{COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}</select></FormField>
            <FormField label="Comp Deductible"><select style={selectStyle} value={sub.commercialAuto.compDeductible} onChange={e => updateLobData("commercialAuto", "compDeductible", e.target.value)}>{COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}</select></FormField>
            <FormField label="Collision Deductible"><select style={selectStyle} value={sub.commercialAuto.collDeductible} onChange={e => updateLobData("commercialAuto", "collDeductible", e.target.value)}>{COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}</select></FormField>
          </div>
          <FormField label="Radius of Operations">
            <select style={selectStyle} value={sub.commercialAuto.radiusOfOps} onChange={e => updateLobData("commercialAuto", "radiusOfOps", e.target.value)}>
              <option value="Local (under 50 miles)">Local (under 50 miles)</option><option value="Intermediate (50-200 miles)">Intermediate (50-200 miles)</option><option value="Long Distance (over 200 miles)">Long Distance (over 200 miles)</option>
            </select>
          </FormField>
        </div>
      )}

      {/* UMBRELLA TAB */}
      {activeTab === "umbrella" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Umbrella / Excess Details</div>
          <div style={S.formRow}>
            <FormField label="Limits Requested" required><select style={selectStyle} value={sub.umbrella.limitsRequested} onChange={e => updateLobData("umbrella", "limitsRequested", e.target.value)}>{COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}</select></FormField>
            <FormField label="Self-Insured Retention"><select style={selectStyle} value={sub.umbrella.retention} onChange={e => updateLobData("umbrella", "retention", e.target.value)}>{COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}</select></FormField>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 8 }}>Underlying schedule will be auto-populated from other lines of business in this submission and bound policies.</div>
        </div>
      )}

      {/* CYBER TAB */}
      {activeTab === "cyber" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Cyber Liability Details</div>
          <div style={S.formRow}>
            <FormField label="Limits Requested"><select style={selectStyle} value={sub.cyber.limitsRequested} onChange={e => updateLobData("cyber", "limitsRequested", e.target.value)}>{COMMON_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}</select></FormField>
            <FormField label="Deductible"><select style={selectStyle} value={sub.cyber.deductible} onChange={e => updateLobData("cyber", "deductible", e.target.value)}>{COMMON_DEDUCTIBLES.map(d => <option key={d} value={d}>{d}</option>)}</select></FormField>
          </div>
          <div style={S.formRow}>
            <FormField label="MFA Enabled?"><select style={selectStyle} value={sub.cyber.mfaEnabled} onChange={e => updateLobData("cyber", "mfaEnabled", e.target.value)}><option value="Yes">Yes</option><option value="No">No</option></select></FormField>
            <FormField label="Backup Frequency"><select style={selectStyle} value={sub.cyber.backupFrequency} onChange={e => updateLobData("cyber", "backupFrequency", e.target.value)}><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="None">None</option></select></FormField>
          </div>
          <div style={S.formRow}>
            <FormField label="Encryption Used?"><select style={selectStyle} value={sub.cyber.encryptionUsed} onChange={e => updateLobData("cyber", "encryptionUsed", e.target.value)}><option value="Yes">Yes</option><option value="No">No</option></select></FormField>
            <FormField label="Employee Security Training?"><select style={selectStyle} value={sub.cyber.employeeTraining} onChange={e => updateLobData("cyber", "employeeTraining", e.target.value)}><option value="Yes">Yes</option><option value="No">No</option></select></FormField>
          </div>
          <FormField label="Data Types Handled"><input style={inputStyle} value={sub.cyber.dataTypesHandled} onChange={e => updateLobData("cyber", "dataTypesHandled", e.target.value)} placeholder="PII, PHI, PCI, Financial, etc." /></FormField>
          <div style={S.formRow}>
            <FormField label="Prior Cyber Incidents?"><select style={selectStyle} value={sub.cyber.priorIncidents} onChange={e => updateLobData("cyber", "priorIncidents", e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></FormField>
            {sub.cyber.priorIncidents === "Yes" && <FormField label="Incident Details"><input style={inputStyle} value={sub.cyber.priorIncidentDetails} onChange={e => updateLobData("cyber", "priorIncidentDetails", e.target.value)} /></FormField>}
          </div>
        </div>
      )}

      {/* CARRIERS TAB */}
      {activeTab === "carriers" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.accentLight }}>Carrier Submission Tracker</div>
            <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => {
              update("carrierTargets", [...sub.carrierTargets, { id: uid(), carrierName: "", underwriterName: "", underwriterContact: "", dateSubmitted: "", status: "Submitted", quotedPremium: "", quoteDate: "", notes: "", declinationReason: "" }]);
            }}>+ Add Carrier</button>
          </div>
          {sub.carrierTargets.length === 0 ? (
            <div style={{ ...S.emptyState, padding: 24 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No carriers targeted yet</div>
              <div style={{ fontSize: 12 }}>Add carriers to track your submission status with each market</div>
            </div>
          ) : (
            sub.carrierTargets.map((ct, idx) => (
              <div key={ct.id} style={{ ...S.card, marginBottom: 10, padding: 14, position: "relative" }}>
                <button style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 14 }}
                  onClick={() => update("carrierTargets", sub.carrierTargets.filter((_, i) => i !== idx))}>\u2715</button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <FormField label="Carrier"><input style={inputStyle} value={ct.carrierName} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], carrierName: e.target.value }; update("carrierTargets", u); }} placeholder="e.g. AmWINS, Hartford" /></FormField>
                  <FormField label="Underwriter"><input style={inputStyle} value={ct.underwriterName} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], underwriterName: e.target.value }; update("carrierTargets", u); }} /></FormField>
                  <FormField label="Date Submitted"><input style={inputStyle} type="date" value={ct.dateSubmitted} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], dateSubmitted: e.target.value }; update("carrierTargets", u); }} /></FormField>
                  <FormField label="Status"><select style={selectStyle} value={ct.status} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], status: e.target.value }; update("carrierTargets", u); }}>
                    {CARRIER_SUBMISSION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select></FormField>
                </div>
                {(ct.status === "Quoted" || ct.status === "Bound") && (
                  <div style={S.formRow}>
                    <FormField label="Quoted Premium"><input style={inputStyle} type="number" value={ct.quotedPremium} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], quotedPremium: e.target.value }; update("carrierTargets", u); }} placeholder="$" /></FormField>
                    <FormField label="Quote Date"><input style={inputStyle} type="date" value={ct.quoteDate} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], quoteDate: e.target.value }; update("carrierTargets", u); }} /></FormField>
                  </div>
                )}
                {ct.status === "Declined" && (
                  <FormField label="Declination Reason"><input style={inputStyle} value={ct.declinationReason} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], declinationReason: e.target.value }; update("carrierTargets", u); }} /></FormField>
                )}
                <FormField label="Notes"><input style={inputStyle} value={ct.notes} onChange={e => { const u = [...sub.carrierTargets]; u[idx] = { ...u[idx], notes: e.target.value }; update("carrierTargets", u); }} /></FormField>
              </div>
            ))
          )}
        </div>
      )}

      {/* ACORD TAB */}
      {activeTab === "acord" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: COLORS.accentLight }}>Generate ACORD Forms</div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>
            All forms are auto-populated from the account record and submission data. No re-entry needed.
          </div>
          {availableForms.map(form => {
            const dataContext = { account, agency: AGENCY_CONFIG, submission: sub };
            const mapping = ALL_ACORD_FORMS[form.name];
            const validation = mapping ? validateAcordForm(mapping, dataContext) : { complete: true, percentage: 100, missing: [] };
            return (
              <div key={form.name} style={{ ...S.card, marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{form.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>{form.desc}</div>
                  <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: COLORS.border, overflow: "hidden", maxWidth: 200 }}>
                    <div style={{ width: `${validation.percentage}%`, height: "100%", background: validation.complete ? COLORS.success : COLORS.warning }} />
                  </div>
                  {!validation.complete && (
                    <div style={{ fontSize: 11, color: COLORS.warning, marginTop: 4 }}>
                      Missing: {validation.missing.map(m => m.label).join(", ")}
                    </div>
                  )}
                </div>
                <button style={S.btn()} onClick={() => handleGenerateAcord(form.name)}>
                  Generate & Preview
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
        <button style={S.btn("ghost")} onClick={onCancel}>Cancel</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn("success") }} onClick={handleSave}>
            {existingSubmission ? "Update Submission" : "Save Submission"}
          </button>
        </div>
      </div>

      {/* ACORD Preview Modal */}
      {acordPreview && (
        <AcordPreviewModal
          formName={acordPreview.formName} html={acordPreview.html}
          account={account} onClose={() => setAcordPreview(null)}
          COLORS={COLORS} S={S}
        />
      )}
    </div>
  );
}


// ==================== SUBMISSIONS LIST PAGE ====================
function SubmissionsPage({ data, COLORS, S, setData, setPage, setSelectedAccountId }) {
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [creatingForAccount, setCreatingForAccount] = useState(null);
  const [accountSearch, setAccountSearch] = useState("");

  const submissions = data.submissions || [];

  const handleSaveSubmission = (submission) => {
    setData(prev => {
      const existing = prev.submissions.find(s => s.id === submission.id);
      const activity = {
        id: uid(), accountId: submission.accountId, type: existing ? "submission_updated" : "submission_created",
        description: existing ? "Submission updated" : "New submission created",
        detail: `${submission.linesOfBusiness.join(", ")} - Eff: ${submission.effectiveDate || "TBD"}`,
        createdBy: AGENCY_CONFIG.defaultProducer, createdAt: new Date().toISOString(),
      };
      const newSubs = existing
        ? prev.submissions.map(s => s.id === submission.id ? submission : s)
        : [...prev.submissions, submission];
      // Also update account pipeline stage if needed
      const account = prev.accounts.find(a => a.id === submission.accountId);
      let newAccounts = prev.accounts;
      if (account && (account.pipelineStage === "new_lead" || account.pipelineStage === "intake_complete")) {
        newAccounts = prev.accounts.map(a => a.id === submission.accountId ? { ...a, pipelineStage: "submission_out", lastModified: today() } : a);
      }
      return { ...prev, submissions: newSubs, accounts: newAccounts, activities: [...prev.activities, activity] };
    });
    setSelectedSubmission(null);
    setCreatingForAccount(null);
  };

  // If creating or editing a submission
  if (creatingForAccount || selectedSubmission) {
    const account = creatingForAccount || data.accounts.find(a => a.id === selectedSubmission?.accountId);
    if (!account) return <div style={{ color: COLORS.danger }}>Account not found</div>;
    return (
      <div>
        <div style={S.pageTitle}>{selectedSubmission ? "Edit Submission" : "New Submission"}</div>
        <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 16 }}>
          Account: <strong style={{ color: COLORS.text }}>{account.businessName}</strong>
        </div>
        <SubmissionBuilder
          account={account} existingSubmission={selectedSubmission} data={data}
          COLORS={COLORS} S={S}
          onSave={handleSaveSubmission}
          onCancel={() => { setSelectedSubmission(null); setCreatingForAccount(null); }}
        />
      </div>
    );
  }

  // Account selection for new submission
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const filteredAccounts = accountSearch
    ? data.accounts.filter(a => a.businessName?.toLowerCase().includes(accountSearch.toLowerCase()))
    : data.accounts;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={S.pageTitle}>Submissions</div>
        <button style={S.btn()} onClick={() => setShowAccountPicker(true)}>+ New Submission</button>
      </div>

      {/* Account Picker Modal */}
      {showAccountPicker && (
        <div style={S.overlay} onClick={() => setShowAccountPicker(false)} data-modal="true">
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={S.modalTitle}>Select Account for Submission</div>
              <span style={{ cursor: "pointer", fontSize: 20, color: COLORS.textDim }} onClick={() => setShowAccountPicker(false)}>\u2715</span>
            </div>
            <input style={{ ...S.input, marginBottom: 12 }} placeholder="Search accounts..." value={accountSearch} onChange={e => setAccountSearch(e.target.value)} autoFocus />
            {filteredAccounts.length === 0 ? (
              <div style={{ color: COLORS.textDim, textAlign: "center", padding: 20 }}>No accounts found. Create an account first.</div>
            ) : (
              filteredAccounts.map(a => (
                <div key={a.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  onClick={() => { setCreatingForAccount(a); setShowAccountPicker(false); setAccountSearch(""); }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.businessName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.primaryContact?.name} {a.coverageNeeds?.length > 0 ? `\u00B7 ${a.coverageNeeds.join(", ")}` : ""}</div>
                  </div>
                  <span style={S.badge(a.accountStatus === "Active" ? COLORS.success : COLORS.info)}>{a.accountStatus}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Submissions List */}
      {submissions.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>No submissions yet</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Create a submission from an existing account to start the quoting process</div>
          <button style={S.btn()} onClick={() => setShowAccountPicker(true)}>+ New Submission</button>
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Account</th>
                <th style={S.th}>Lines of Business</th>
                <th style={S.th}>Effective</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Carriers</th>
                <th style={S.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(sub => {
                const account = data.accounts.find(a => a.id === sub.accountId);
                const status = SUBMISSION_STATUSES.find(s => s.id === sub.status) || SUBMISSION_STATUSES[0];
                const quotedCount = (sub.carrierTargets || []).filter(c => c.status === "Quoted").length;
                return (
                  <tr key={sub.id} style={{ cursor: "pointer" }}
                    onClick={() => setSelectedSubmission(sub)}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={S.tdClickable}><div style={{ fontWeight: 600 }}>{account?.businessName || "Unknown"}</div></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(sub.linesOfBusiness || []).map(lob => (
                          <span key={lob} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: `${COLORS.accent}15`, color: COLORS.accentLight }}>
                            {COVERAGE_OPTIONS.find(c => c.id === lob)?.icon || lob}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={S.td}>{fmt(sub.effectiveDate)}</td>
                    <td style={S.td}><span style={S.badge(status.color)}>{status.label}</span></td>
                    <td style={S.td}>
                      <span style={{ fontSize: 12 }}>{(sub.carrierTargets || []).length} market{(sub.carrierTargets || []).length !== 1 ? "s" : ""}</span>
                      {quotedCount > 0 && <span style={{ fontSize: 10, color: COLORS.success, marginLeft: 4 }}>({quotedCount} quoted)</span>}
                    </td>
                    <td style={S.td}><span style={{ fontSize: 12, color: COLORS.textDim }}>{fmt(sub.created)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ==================== PLACEHOLDER PAGES ====================
function PlaceholderPage({ title, description, phase, COLORS, S }) {
  return (
    <div>
      <div style={S.pageTitle}>{title}</div>
      <div style={S.emptyState}>
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>{"\u25A2"}</div>
        <div style={{ fontSize: 16, marginBottom: 8, color: COLORS.text }}>{title}</div>
        <div style={{ fontSize: 13, maxWidth: 400, margin: "0 auto" }}>{description}</div>
        <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 12 }}>Coming in {phase}</div>
      </div>
    </div>
  );
}


// ==================== MAIN COMMERCIAL APP ====================
export default function CommercialApp({ COLORS, isMobile }) {
  const S = useMemo(() => makeStyles(COLORS), [COLORS]);
  const [page, setPage] = useState("cl_dashboard");
  const [data, setDataRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [showIntakeWizard, setShowIntakeWizard] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const dataRef = useRef(null);

  // Load data
  useEffect(() => {
    (async () => {
      const result = await loadCommercialData();
      if (result.status === "loaded" && result.data) {
        setDataRaw(result.data);
      } else {
        setDataRaw(createEmptyCommercialData());
      }
      setLoading(false);
    })();
  }, []);

  // Auto-save
  useEffect(() => {
    if (data && dataRef.current !== null) {
      saveCommercialData(data);
    }
    dataRef.current = data;
  }, [data]);

  const setData = useCallback((newDataOrFn) => {
    if (typeof newDataOrFn === "function") {
      setDataRaw(prev => newDataOrFn(prev));
    } else {
      setDataRaw(newDataOrFn);
    }
  }, []);

  const handleSaveAccount = useCallback((account) => {
    setData(prev => {
      const existing = prev.accounts.find(a => a.id === account.id);
      const activity = {
        id: uid(), accountId: account.id, type: existing ? "account_updated" : "account_created",
        description: existing ? "Account updated" : "New commercial account created",
        detail: account.businessName, createdBy: AGENCY_CONFIG.defaultProducer,
        createdAt: new Date().toISOString(),
      };
      if (existing) {
        return {
          ...prev,
          accounts: prev.accounts.map(a => a.id === account.id ? account : a),
          activities: [...prev.activities, activity],
        };
      } else {
        return {
          ...prev,
          accounts: [...prev.accounts, account],
          activities: [...prev.activities, activity],
        };
      }
    });
    setShowIntakeWizard(false);
    setEditingAccount(null);
    if (!editingAccount) {
      setSelectedAccountId(account.id);
      setPage("cl_accounts");
    }
  }, [editingAccount, setData]);

  const handleSelectAccount = useCallback((id) => {
    setSelectedAccountId(id);
  }, []);

  if (loading || !data) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: COLORS.textDim }}>Loading commercial data...</div>;
  }

  const selectedAccount = selectedAccountId ? data.accounts.find(a => a.id === selectedAccountId) : null;

  // Render page content
  const renderPage = () => {
    // Intake wizard modal
    if (showIntakeWizard || editingAccount) {
      return (
        <div>
          <div style={S.pageTitle}>{editingAccount ? "Edit Commercial Account" : "New Commercial Account"}</div>
          <div style={{ ...S.card, maxWidth: 900 }}>
            <IntakeWizard
              COLORS={COLORS} S={S}
              existingAccount={editingAccount}
              onSave={handleSaveAccount}
              onCancel={() => { setShowIntakeWizard(false); setEditingAccount(null); }}
            />
          </div>
        </div>
      );
    }

    // Account detail view
    if (selectedAccount && page === "cl_accounts") {
      return (
        <AccountDetailView
          account={selectedAccount} data={data} COLORS={COLORS} S={S}
          onBack={() => setSelectedAccountId(null)}
          onEdit={() => setEditingAccount(selectedAccount)}
          setData={setData}
          setPage={setPage}
        />
      );
    }

    switch (page) {
      case "cl_dashboard":
        return <CommercialDashboard data={data} COLORS={COLORS} S={S} setPage={setPage} />;

      case "cl_accounts":
        return (
          <AccountsList
            data={data} COLORS={COLORS} S={S} setData={setData}
            onSelectAccount={handleSelectAccount}
            onNewAccount={() => setShowIntakeWizard(true)}
          />
        );

      case "cl_pipeline":
        return (
          <PipelineView
            data={data} COLORS={COLORS} S={S} setData={setData}
            onSelectAccount={(id) => { setSelectedAccountId(id); setPage("cl_accounts"); }}
          />
        );

      case "cl_submissions":
        return <SubmissionsPage data={data} COLORS={COLORS} S={S} setData={setData} setPage={setPage} setSelectedAccountId={setSelectedAccountId} />;

      case "cl_policies":
        return <PlaceholderPage title="Commercial Policies" description="Manage bound policies, endorsements, certificates, and claims. Track billing and commission by carrier." phase="Phase 5" COLORS={COLORS} S={S} />;

      case "cl_renewals":
        return <PlaceholderPage title="Renewal Management" description="Track renewal expirations at 120/90/60/30 days. Clone prior submissions, compare year-over-year premiums." phase="Phase 6" COLORS={COLORS} S={S} />;

      default:
        return <CommercialDashboard data={data} COLORS={COLORS} S={S} setPage={setPage} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Commercial Sidebar Nav */}
      {!isMobile && (
        <div style={{
          width: 200, minWidth: 200, background: COLORS.sidebar,
          borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column",
          paddingTop: 8,
        }}>
          <div style={{ padding: "12px 16px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accentLight, letterSpacing: "0.3px" }}>COMMERCIAL LINES</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{AGENCY_CONFIG.agencyName}</div>
          </div>
          <div style={{ marginTop: 8 }}>
            {COMMERCIAL_NAV.map(n => {
              const active = page === n.id;
              return (
                <div key={n.id}
                  style={{
                    padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? COLORS.accentLight : COLORS.textDim,
                    background: active ? `${COLORS.accent}15` : "transparent",
                    borderLeft: active ? `3px solid ${COLORS.accent}` : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                  onClick={() => { setPage(n.id); setSelectedAccountId(null); setShowIntakeWizard(false); setEditingAccount(null); }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = `${COLORS.accent}08`; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{n.icon}</span>
                  <span>{n.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile nav (simple select) */}
      {isMobile && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.sidebar }}>
          <select
            style={{ ...S.select, width: "100%", fontWeight: 600 }}
            value={page}
            onChange={e => { setPage(e.target.value); setSelectedAccountId(null); }}
          >
            {COMMERCIAL_NAV.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px 12px" : "24px 28px" }}>
        {renderPage()}
      </div>
    </div>
  );
}
