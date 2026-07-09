import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { read, utils, writeFile } from "xlsx";
import CommercialApp from "./commercial/CommercialApp.jsx";
import { initSupabaseStorage, getSupabaseCredentials, saveSupabaseCredentials, clearSupabaseCredentials, resetSupabaseClient, testSupabaseConnection, migrateLocalToSupabase, getSupabaseClient } from "./supabaseSync.js";

// ==================== CONSTANTS ====================
const THEMES = {
  midnight: {
    name: "Midnight", desc: "Deep navy dark mode",
    bg: "#0a0f1a", sidebar: "#0d1321", card: "#131a2b", cardHover: "#1a2340",
    border: "#1e2a45", accent: "#2563eb", accentLight: "#3b82f6", accentDim: "#1d4ed8",
    text: "#e2e8f0", textDim: "#8892a8", textMuted: "#4a5568",
    success: "#10b981", warning: "#f59e0b", danger: "#ef4444", info: "#6366f1",
    tagBg: "#1e293b", logoFilter: ""
  },
  slate: {
    name: "Slate", desc: "Softer grey-blue tones",
    bg: "#111827", sidebar: "#1f2937", card: "#1f2937", cardHover: "#374151",
    border: "#374151", accent: "#3b82f6", accentLight: "#60a5fa", accentDim: "#2563eb",
    text: "#f3f4f6", textDim: "#9ca3af", textMuted: "#6b7280",
    success: "#34d399", warning: "#fbbf24", danger: "#f87171", info: "#818cf8",
    tagBg: "#374151", logoFilter: ""
  },
  ocean: {
    name: "Ocean", desc: "Cool blue-grey, lighter cards",
    bg: "#0f172a", sidebar: "#1e293b", card: "#1e293b", cardHover: "#334155",
    border: "#334155", accent: "#0ea5e9", accentLight: "#38bdf8", accentDim: "#0284c7",
    text: "#e2e8f0", textDim: "#94a3b8", textMuted: "#64748b",
    success: "#2dd4bf", warning: "#fbbf24", danger: "#fb7185", info: "#a78bfa",
    tagBg: "#334155", logoFilter: ""
  },
  frost: {
    name: "Frost", desc: "Light mode with blue accents",
    bg: "#f1f5f9", sidebar: "#1e293b", card: "#ffffff", cardHover: "#f8fafc",
    border: "#e2e8f0", accent: "#2563eb", accentLight: "#3b82f6", accentDim: "#1d4ed8",
    text: "#1e293b", textDim: "#64748b", textMuted: "#94a3b8",
    success: "#059669", warning: "#d97706", danger: "#dc2626", info: "#4f46e5",
    tagBg: "#f1f5f9", logoFilter: ""
  },
  steel: {
    name: "Steel", desc: "Neutral dark with warm accents",
    bg: "#18181b", sidebar: "#1c1c22", card: "#27272a", cardHover: "#3f3f46",
    border: "#3f3f46", accent: "#3b82f6", accentLight: "#60a5fa", accentDim: "#2563eb",
    text: "#fafafa", textDim: "#a1a1aa", textMuted: "#71717a",
    success: "#4ade80", warning: "#facc15", danger: "#f87171", info: "#a78bfa",
    tagBg: "#3f3f46", logoFilter: ""
  },
};

// Load theme from config at startup
const _loadedTheme = (() => { try { const c = JSON.parse(localStorage.getItem("sentinel_config")); return c?.theme || "midnight"; } catch { return "midnight"; } })();
let COLORS = { ...THEMES[_loadedTheme] || THEMES.midnight };

const NAV_SECTIONS = [
  { label: null, items: [
    { id: "briefing", label: "Morning Briefing", icon: "☀", key: "1" },
    { id: "dashboard", label: "Dashboard", icon: "◉", key: "2" },
    { id: "tasks", label: "Tasks", icon: "☑", key: "3" },
    { id: "calendar", label: "Calendar", icon: "▦" },
    { id: "reports", label: "Reports", icon: "▤" },
  ]},
  { label: "Service", items: [
    { id: "service", label: "Service View", icon: "☰", key: "4" },
    { id: "retention", label: "Retention Tracker", icon: "⛨" },
    { id: "allstate", label: "Allstate Hub", icon: "★", key: "5" },
    { id: "outreach", label: "Outreach Hub", icon: "✉" },
    { id: "clients", label: "Clients", icon: "◎", key: "6" },
    { id: "policies", label: "Policies", icon: "◇", key: "7" },
    { id: "certificates", label: "Certificates", icon: "▣" },
  ]},
  { label: "Sales", items: [
    { id: "pipeline", label: "Pipeline", icon: "◈", key: "8" },
    { id: "sales", label: "Sales Log", icon: "◆", key: "9" },
  ]},
];
const NAV_BOTTOM = [{ id: "settings", label: "Settings", icon: "⚙", key: "0" }];
const NAV = [...NAV_SECTIONS.flatMap(s => s.items), ...NAV_BOTTOM];

const SERVICE_TYPES = ["Allstate Termination","Allstate Cancel","Allstate P-Cancel","Ivantage Renewal","Ivantage Installment","Commercial Renewal","UW Cancellation","New Business","2026 Renewal","2027 Renewal","Endorsement","General"];
const SERVICE_STATUSES = ["Uncontacted","Emailed","Called","Needs Attention","Auto Pay","Mortgagee Billed","Done"];
// Returns status options for a given service item — adds "Renewed" for Ivantage Renewal types
function getServiceStatuses(si) {
  if (si && si.type === "Ivantage Renewal" && si.status !== "Done") {
    return [...SERVICE_STATUSES.filter(s => s !== "Done"), "Renewed", "Done"];
  }
  return SERVICE_STATUSES;
}

// Renewal popup — shown when "Renewed" status is selected on an Ivantage Renewal
function RenewalPopup({ si, data, setData, config, onClose }) {
  const pol = data.policies.find(p => p.id === si.policyId);
  const acct = data.accounts.find(a => a.id === si.accountId);
  const todayStr = today();
  const advanceYear = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); dt.setFullYear(dt.getFullYear() + 1); return dt.toISOString().split("T")[0]; };
  const [form, setForm] = React.useState({
    effectiveDate: pol ? advanceYear(pol.effectiveDate) : "",
    expirationDate: pol ? advanceYear(pol.expirationDate) : "",
    premium: "",
    carrier: pol ? pol.carrier : si.carrier || "",
    lob: pol ? pol.lob : si.lob || "",
    policyNumber: pol ? pol.policyNumber : si.policyNumber || "",
  });

  const handleConfirm = () => {
    if (!pol) { alert("No linked policy found for this service item."); return; }
    const newPolId = uid();
    const newPol = {
      ...pol, id: newPolId,
      effectiveDate: form.effectiveDate, expirationDate: form.expirationDate,
      premium: Number(form.premium) || 0, policyNumber: form.policyNumber,
      status: form.effectiveDate <= todayStr ? "Active" : "Pending Renewal",
      notes: `Renewed from policy ${pol.policyNumber || pol.id}`
    };
    // Mark service item as Done
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, status: "Done", lastAction: "Renewed", lastActionDate: todayStr } : s) };
    // Create new policy
    updated = { ...updated, policies: [...updated.policies, newPol] };
    // Auto-create renewal SI for new policy if within renewal window (with dedup)
    const _renExpDate = newPol.expirationDate;
    const _renDays = _renExpDate ? daysBetween(todayStr, _renExpDate) : -1;
    const _renTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal"];
    const _hasExisting = updated.serviceItems.some(s => s.policyId === newPolId && _renTypes.some(rt => s.type.includes("Renewal")));
    if (_renDays >= 0 && _renDays <= renewalWindow(newPol.lob) && !_hasExisting) {
      const _siType = isCommercialLob(newPol.lob) ? "Commercial Renewal" : (newPol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
      const newSI = {
        id: uid(), type: _siType, accountId: si.accountId, accountName: acct ? acct.name : si.accountName || "",
        policyId: newPolId, policyNumber: newPol.policyNumber, carrier: newPol.carrier, lob: newPol.lob,
        description: `${newPol.carrier} ${newPol.lob || ""} Renewal`.trim(), dueDate: _renExpDate || todayStr,
        amountDue: 0, status: "Uncontacted", urgency: _renDays <= 14 ? "High" : "Medium",
        assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
        followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
      };
      updated = { ...updated, serviceItems: [...updated.serviceItems, newSI] };
    }
    // If new policy is already active (effective today or past), expire the old one
    if (newPol.status === "Active") {
      updated = { ...updated, policies: updated.policies.map(p => p.id === pol.id ? { ...p, status: "Expired" } : p) };
    }
    updated = addActivity(updated, si.accountId, "status_change", `Policy renewed via service item: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
    setData(updated, { undo: true, message: `Renewed: ${pol.carrier} — ${pol.lob}` });
    onClose();
  };

  const inputStyle = { ...S.input, padding: "6px 10px", fontSize: 13 };
  return (
    <div style={S.overlay} onClick={onClose} data-modal="true">
      <div style={{ ...S.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🔄 Renew Policy</div>
          <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={onClose}>✕</button>
        </div>
        {!pol ? (
          <div style={{ color: COLORS.danger, fontSize: 13 }}>No linked policy found for this service item. Cannot renew.</div>
        ) : (
          <>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{pol.carrier} — {pol.lob}</div>
              <div style={{ color: COLORS.textDim, fontSize: 12 }}>{si.accountName} · Policy #{pol.policyNumber || "—"}</div>
              <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>Current: {pol.effectiveDate || "—"} → {pol.expirationDate || "—"} · ${Number(pol.premium || 0).toLocaleString()}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Policy Number</div>
              <input style={inputStyle} value={form.policyNumber} onChange={e => setForm({ ...form, policyNumber: e.target.value })} placeholder="Policy #" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>New Effective Date</div><input style={inputStyle} type="date" value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>New Expiration Date</div><input style={inputStyle} type="date" value={form.expirationDate} onChange={e => setForm({ ...form, expirationDate: e.target.value })} /></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>New Premium</div>
              <input style={inputStyle} type="number" min="0" placeholder="0" value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btn("ghost")} onClick={onClose}>Cancel</button>
              <button style={{ ...S.btn(), background: COLORS.success }} onClick={handleConfirm}>Renew Policy</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Cancellation modal — shown when a policy status is changed to "Cancelled"
function CancellationModal({ policyId, data, setData, config, onClose }) {
  const pol = data.policies.find(p => p.id === policyId);
  const acct = pol ? data.accounts.find(a => a.id === pol.accountId) : null;
  const todayStr = today();
  const reasons = config.cancellationReasons || ["Replaced Coverage","Non-Payment","Underwriting","Property/Vehicle Sold","Death","Moved"];
  const [form, setForm] = React.useState({ cancellationDate: todayStr, cancellationReason: "" });

  const handleConfirm = () => {
    if (!form.cancellationReason) { alert("Please select a reason for cancellation."); return; }
    if (!form.cancellationDate) { alert("Please enter a cancellation date."); return; }
    // Update policy with Cancelled status + cancellation fields
    let updated = { ...data, policies: data.policies.map(p => p.id === policyId ? { ...p, status: "Cancelled", cancellationDate: form.cancellationDate, cancellationReason: form.cancellationReason } : p) };
    // Log activity
    if (pol) updated = addActivity(updated, pol.accountId, "status_change", `Policy cancelled: ${pol.carrier} — ${pol.lob} (${form.cancellationReason})`, pol.policyNumber || "");
    // Auto-create win-back prospect for Replaced Coverage or Non-Payment
    if (["Replaced Coverage","Non-Payment"].includes(form.cancellationReason) && pol && acct) {
      const isAuto = pol.lob === "Auto";
      const cancelDt = new Date(form.cancellationDate + "T12:00:00");
      if (!isNaN(cancelDt)) {
        if (isAuto) cancelDt.setMonth(cancelDt.getMonth() + 6);
        else cancelDt.setFullYear(cancelDt.getFullYear() + 1);
        const xDate = cancelDt.toISOString().split("T")[0];
        // Follow-up = 45 days before xDate
        const fuDt = new Date(cancelDt);
        fuDt.setDate(fuDt.getDate() - 45);
        const followUpDate = fuDt.toISOString().split("T")[0];
        const newProspect = {
          id: uid(), firstName: acct.firstName || acct.name.split(" ")[0] || "", lastName: acct.lastName || acct.name.split(" ").slice(1).join(" ") || "",
          business: "", phone: acct.phone || "", email: acct.email || "",
          source: "Win-Back", sourceDetail: `Policy cancelled — ${form.cancellationReason}`,
          lob: pol.lob || "Auto", estimatedPremium: pol.premium || 0,
          stage: "New Lead", zip: acct.zip || "", created: todayStr,
          xDate, currentCarrier: pol.carrier || "",
          followUpDate, notes: `Win-back from cancelled ${pol.carrier} ${pol.lob} policy #${pol.policyNumber || "—"}. ${isAuto ? "6-month" : "12-month"} re-quote window.`
        };
        updated = { ...updated, prospects: [...(updated.prospects || []), newProspect] };
        updated = addActivity(updated, pol.accountId, "pipeline_created", `Win-back prospect created for ${pol.carrier} ${pol.lob} (x-date: ${xDate})`, pol.policyNumber || "");
      }
    }
    // Mark related Allstate service items (P-Cancel, Cancel, Termination) as Done
    const allstateTypes = ["Allstate P-Cancel", "Allstate Cancel", "Allstate Termination"];
    updated = { ...updated, serviceItems: updated.serviceItems.map(si =>
      si.policyId === policyId && allstateTypes.includes(si.type) && si.status !== "Done"
        ? { ...si, status: "Done", lastAction: `Cancelled — ${form.cancellationReason}`, lastActionDate: todayStr }
        : si
    ) };
    setData(updated, { undo: true, message: `Cancelled: ${pol ? `${pol.carrier} — ${pol.lob}` : "Policy"}` });
    onClose();
  };

  const inputStyle = { ...S.input, padding: "6px 10px", fontSize: 13 };
  return (
    <div style={S.overlay} onClick={onClose} data-modal="true">
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.danger }}>⚠️ Cancel Policy</div>
          <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={onClose}>✕</button>
        </div>
        {pol && (
          <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{pol.carrier} — {pol.lob}</div>
            <div style={{ color: COLORS.textDim, fontSize: 12 }}>{acct ? acct.name : "—"} · Policy #{pol.policyNumber || "—"}</div>
            <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>${Number(pol.premium || 0).toLocaleString()} · {pol.effectiveDate || "—"} → {pol.expirationDate || "—"}</div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Cancellation Date *</div>
          <input style={inputStyle} type="date" value={form.cancellationDate} onChange={e => setForm({ ...form, cancellationDate: e.target.value })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Reason for Cancellation *</div>
          <select style={{ ...inputStyle, width: "100%" }} value={form.cancellationReason} onChange={e => setForm({ ...form, cancellationReason: e.target.value })}>
            <option value="">— Select reason —</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {["Replaced Coverage","Non-Payment"].includes(form.cancellationReason) && (
          <div style={{ background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}30`, borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>📋 Win-Back Prospect</div>
            <div style={{ color: COLORS.textDim }}>A Sales/Win-Back prospect will be auto-created in the Pipeline with an x-date of {pol && pol.lob === "Auto" ? "6 months" : "12 months"} from cancellation and a follow-up 45 days prior.</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn(), background: COLORS.danger }} onClick={handleConfirm}>Confirm Cancellation</button>
        </div>
      </div>
    </div>
  );
}
const SERVICE_FLAGS = ["Auto Pay","Requested Cancel","Don't Send Reminders","No Email - Call"];

// Carrier abbreviations — used only on Service View & Kanban Board
const CARRIER_ABBREV = {
  // Group names
  "Allstate": "Allstate",
  "Tower Hill Insurance Group": "Tower Hill",
  "Universal North America Insurance Company": "Universal NA",
  "Winward Risk Managers": "Winward",
  "Citizens Property & Casualty Insurance Company": "Citizens",
  "Slide Insurance Company": "Slide",
  "Cypress Property & Casualty Insurance Company": "Cypress",
  "American Integrity Insurance Company": "American Integrity",
  "Beyond Floods": "Beyond Floods",
  "Cabrillo Coastal Insurance Company": "Cabrillo",
  "Homeowners Choice Property & Casualty Insurance Company": "HO Choice",
  "Manatee Insurance Exchange": "Manatee",
  "Monarch National Insurance Company": "Monarch",
  "Mount Vernon Fire Insurance Company": "Mount Vernon",
  "National General Insurance Company": "NatGen",
  "Ovation Insurance Exchange": "Ovation",
  "RLI": "RLI",
  "Security First Insurance Company": "Security First",
  "Southern Oak Insurance Company": "Southern Oak",
  // Writing companies
  "Allstate Fire and Casualty Insurance Company": "AFCIC",
  "Allstate North American Insurance Company": "ANAIC",
  "Allstate Insurance Company": "AIC",
  "Allstate Property and Casualty Insurance Company": "APC",
  "Allstate Indemnity Company": "AIND",
  "Castle Key Indemnity": "CKI",
  "Castle Key Insurance Company": "CKIC",
  "Tower Hill Insurance Exchange": "Tower Hill",
  "Florida Peninsula Insurance Company": "FL Peninsula",
  "Edison Insurance Company": "Edison",
  // Legacy short names (backward compat for existing data)
  "Citizens": "Citizens",
  "Tower Hill": "Tower Hill",
  "Universal": "Universal NA",
  "Slide": "Slide",
};
const carrierShort = (name) => CARRIER_ABBREV[name] || name;

// Normalize a raw carrier string to match a carrierGroups key
// Handles: exact match, case-insensitive, writing company → group, short name → group, partial match
const normalizeCarrier = (raw, carrierGroups) => {
  if (!raw || !carrierGroups) return raw || "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const keys = Object.keys(carrierGroups);
  // Exact match
  if (keys.includes(trimmed)) return trimmed;
  // Case-insensitive match
  const lower = trimmed.toLowerCase();
  const ciMatch = keys.find(k => k.toLowerCase() === lower);
  if (ciMatch) return ciMatch;
  // Check if it's a writing company name → return the parent group
  for (const [group, companies] of Object.entries(carrierGroups)) {
    if (companies.some(c => c.toLowerCase() === lower)) return group;
  }
  // Partial / starts-with on group names
  const startsWith = keys.find(k => k.toLowerCase().startsWith(lower) || lower.startsWith(k.toLowerCase()));
  if (startsWith) return startsWith;
  // Check abbreviation keys → find matching group
  for (const [full, abbr] of Object.entries(CARRIER_ABBREV)) {
    if (abbr.toLowerCase() === lower || full.toLowerCase() === lower) {
      const groupMatch = keys.find(k => k === full || k.toLowerCase().includes(full.toLowerCase()));
      if (groupMatch) return groupMatch;
    }
  }
  // Common alias patterns: "Allstate Flood" → "Allstate", "Citizens" → "Citizens Property..."
  const firstWord = lower.split(/\s+/)[0];
  const wordMatch = keys.find(k => k.toLowerCase().startsWith(firstWord));
  if (wordMatch) return wordMatch;
  // No match — return as-is (will show as custom carrier)
  return trimmed;
};
const URGENCY = ["Low","Medium","High","Critical"];

// Transaction type row colors (matching Google Sheets)
const TXN_COLORS = {
  "Allstate Termination": "#f87171",
  "Allstate Cancel": "#fb923c",
  "Allstate P-Cancel": "#e879f9",
  "Ivantage Renewal": "#4ade80",
  "Ivantage Installment": "#34d399",
  "Commercial Renewal": "#2dd4bf",
  "UW Cancellation": "#facc15",
  "New Business": "#60a5fa",
  "2026 Renewal": "#f59e0b",
  "2027 Renewal": "#22d3ee",
  "Endorsement": "#a78bfa",
  "General": "#94a3b8",
};

// Due date urgency color
const dueDateColor = (d) => {
  if (!d) return COLORS.textDim;
  const diff = daysBetween(today(), d);
  if (diff < 0) return "#ef4444";   // Overdue — red
  if (diff === 0) return "#ea580c"; // Due today — dark orange
  if (diff <= 3) return "#f97316";  // 3 days — orange
  if (diff <= 10) return "#eab308"; // 10 days — yellow
  if (diff > 30) return COLORS.textMuted; // 30+ days — gray
  return COLORS.textDim;
};

// Traffic light zone for service items
const trafficZone = (dueDate, todayStr) => {
  if (!dueDate) return { zone: "none", sort: 4, color: COLORS.textMuted, bg: "transparent", rowBg: "transparent", label: "—" };
  const diff = daysBetween(todayStr, dueDate);
  if (diff < 0) return { zone: "critical", sort: 0, color: "#000", bg: "#dc262660", rowBg: "#dc262618", label: `${Math.abs(diff)}d overdue` };
  if (diff === 0) return { zone: "critical", sort: 0, color: "#000", bg: "#dc262660", rowBg: "#dc262618", label: "TODAY" };
  if (diff <= 10) return { zone: "red", sort: 1, color: "#ef4444", bg: "#ef444425", rowBg: "transparent", label: `${diff}d` };
  if (diff <= 30) return { zone: "yellow", sort: 2, color: "#eab308", bg: "#eab30825", rowBg: "transparent", label: `${diff}d` };
  return { zone: "green", sort: 3, color: "#22c55e", bg: "#22c55e25", rowBg: "transparent", label: `${diff}d` };
};

// Status badge styling
const statusBadgeStyle = (s) => {
  if (s === "Done") return { background: `${COLORS.textMuted}30`, color: COLORS.textMuted, textDecoration: "line-through" };
  if (s === "Renewed") return { background: "#4ade8030", color: "#4ade80", fontWeight: 700 };
  if (s === "Emailed") return { background: "#6366f130", color: "#818cf8" };
  if (s === "Called") return { background: "#06b6d430", color: "#22d3ee" };
  if (s === "Needs Attention") return { background: "#ef444430", color: "#f87171", fontWeight: 700 };
  if (s === "Auto Pay") return { background: "#06b6d420", color: "#22d3ee" };
  if (s === "Uncontacted") return { background: `${COLORS.border}`, color: COLORS.textDim };
  return { background: `${COLORS.border}`, color: COLORS.textDim };
};

// Flag badge styling
const flagBadgeStyle = (f) => {
  if (f === "Auto Pay") return { background: "#06b6d420", color: "#22d3ee", icon: "💳" };
  if (f === "Requested Cancel") return { background: "#f4364820", color: "#fb7185", icon: "✕" };
  if (f === "Don't Send Reminders") return { background: "#78716c20", color: "#a8a29e", icon: "🔕" };
  if (f === "No Email - Call") return { background: "#d946ef20", color: "#e879f9", icon: "📞" };
  return { background: `${COLORS.border}`, color: COLORS.textDim, icon: "🏷" };
};

// Migrate old statuses to new system (runs on data load)
const migrateServiceStatus = (si) => {
  const oldStatus = si.status;
  const flags = [...(si.flags || [])];
  let newStatus = oldStatus;

  // Map old statuses to new
  const statusMap = {
    "Not Started": "Uncontacted",
    "Contacted": "Emailed",
    "In Progress": "Needs Attention",
    "Action Required": "Needs Attention",
    "Completed": "Done",
    "Resolved": "Done",
  };

  // Statuses that become flags
  if (oldStatus === "Urgent - Call" || oldStatus === "No Email - Call") {
    newStatus = "Needs Attention";
    if (!flags.includes("No Email - Call")) flags.push("No Email - Call");
  } else if (oldStatus === "Auto Pay") {
    newStatus = si._prevStatus || "Uncontacted";
    if (!flags.includes("Auto Pay")) flags.push("Auto Pay");
  } else if (oldStatus === "Requested Cancel") {
    newStatus = "Needs Attention";
    if (!flags.includes("Requested Cancel")) flags.push("Requested Cancel");
  } else if (oldStatus === "Don't Send Reminders") {
    newStatus = si._prevStatus || "Uncontacted";
    if (!flags.includes("Don't Send Reminders")) flags.push("Don't Send Reminders");
  } else if (oldStatus === "Waiting on Client") {
    // Determine based on last contact method
    const lastMethod = (si.contactAttempts || [])[0]?.method;
    newStatus = lastMethod === "Phone" || lastMethod === "Voicemail" ? "Called" : "Emailed";
  } else if (oldStatus === "Waiting on Carrier") {
    newStatus = "Emailed";
  } else if (statusMap[oldStatus]) {
    newStatus = statusMap[oldStatus];
  }

  // Only return changes if status is actually old
  if (!SERVICE_STATUSES.includes(oldStatus)) {
    return { ...si, status: newStatus, flags };
  }
  // Already new status — just ensure flags array exists
  return { ...si, flags };
};
const PIPELINE_STAGES = ["New Lead","Contacted","Quoting","Proposal Sent","Negotiating","Won","Lost"];
const POLICY_STATUSES = ["Active","Pending","Pending Renewal","Requested Cancel","Cancelled","Expired","Non-Renewed"];
const LOB_OPTIONS = ["Auto","Homeowners","DP-3","DP-1","Umbrella","Renters","Condo","Life","Roadside","Flood","Boat","Motorcycle or ORV","Classic Car","RV","CPL","Excess CPL","Scheduled Personal Property","Jewelry/Valuables","Commercial GL","Commercial Property","Commercial Auto","Workers Comp","BOP"];
const LOB_NORMALIZE = {
  "home": "Homeowners", "homeowner": "Homeowners", "homeowners": "Homeowners", "ho": "Homeowners", "ho3": "Homeowners", "ho-3": "Homeowners", "ho 3": "Homeowners",
  "residential": "Homeowners", "home owner": "Homeowners", "homeowners ho3": "Homeowners", "homeowners - ho3": "Homeowners", "homeowner ho3": "Homeowners", "personal home": "Homeowners",
  "dp3": "DP-3", "dp-3": "DP-3", "dp 3": "DP-3", "dwelling fire": "DP-3", "dwelling": "DP-3", "dwelling property": "DP-3", "dwelling fire dp3": "DP-3", "dwelling fire - dp3": "DP-3",
  "dp1": "DP-1", "dp-1": "DP-1", "dp 1": "DP-1", "dwelling fire dp1": "DP-1", "dwelling fire - dp1": "DP-1",
  "auto": "Auto", "car": "Auto", "vehicle": "Auto", "automobile": "Auto",
  "personal auto": "Auto", "private passenger auto": "Auto", "ppa": "Auto", "personal automobile": "Auto", "auto - personal": "Auto", "pvt passenger": "Auto",
  "umbrella": "Umbrella", "umb": "Umbrella", "pup": "Umbrella", "personal umbrella": "Umbrella", "excess liability": "Umbrella", "personal umbrella policy": "Umbrella",
  "renters": "Renters", "renter": "Renters", "tenant": "Renters", "ho4": "Renters", "ho-4": "Renters",
  "condo": "Condo", "ho6": "Condo", "ho-6": "Condo", "condominium": "Condo",
  "life": "Life", "term": "Life", "whole life": "Life", "term life": "Life",
  "roadside": "Roadside", "ers": "Roadside", "towing": "Roadside", "motor club": "Roadside",
  "flood": "Flood", "nfip": "Flood", "private flood": "Flood",
  "boat": "Boat", "watercraft": "Boat", "yacht": "Boat", "personal watercraft": "Boat",
  "motorcycle": "Motorcycle or ORV", "bike": "Motorcycle or ORV", "mc": "Motorcycle or ORV", "orv": "Motorcycle or ORV", "off road": "Motorcycle or ORV", "atv": "Motorcycle or ORV", "off-road": "Motorcycle or ORV",
  "classic car": "Classic Car", "classic": "Classic Car", "antique auto": "Classic Car", "collector": "Classic Car", "classic auto": "Classic Car", "collector auto": "Classic Car",
  "rv": "RV", "recreational": "RV", "motorhome": "RV", "recreational vehicle": "RV", "motor home": "RV",
  "jewelry": "Jewelry/Valuables", "valuables": "Jewelry/Valuables",
  "commercial gl": "Commercial GL", "gl": "Commercial GL", "general liability": "Commercial GL", "liability": "Commercial GL", "commercial general liability": "Commercial GL", "cgl": "Commercial GL",
  "commercial property": "Commercial Property", "comm prop": "Commercial Property", "commercial fire": "Commercial Property",
  "commercial auto": "Commercial Auto", "comm auto": "Commercial Auto", "commercial automobile": "Commercial Auto", "business auto": "Commercial Auto",
  "workers comp": "Workers Comp", "wc": "Workers Comp", "work comp": "Workers Comp", "workers compensation": "Workers Comp",
  "bop": "BOP", "business owners": "BOP", "business owner": "BOP", "business owners policy": "BOP", "businessowners": "BOP",
  "cpl": "CPL", "commercial personal liability": "CPL", "personal liability": "CPL",
  "excess cpl": "Excess CPL", "xcpl": "Excess CPL", "excess": "Excess CPL",
  "scheduled personal property": "Scheduled Personal Property", "spp": "Scheduled Personal Property", "scheduled property": "Scheduled Personal Property", "personal property": "Scheduled Personal Property",
  "inland marine": "Scheduled Personal Property", "personal inland marine": "Scheduled Personal Property", "pim": "Scheduled Personal Property",
};
const normalizeLOB = (input) => {
  if (!input) return "";
  const lower = input.trim().toLowerCase();
  if (LOB_NORMALIZE[lower]) return LOB_NORMALIZE[lower];
  // Partial match - find first LOB_OPTION that starts with the input
  const match = LOB_OPTIONS.find(o => o.toLowerCase().startsWith(lower));
  if (match) return match;
  // Reverse partial - check if input contains an LOB option name
  const containsMatch = LOB_OPTIONS.find(o => lower.includes(o.toLowerCase()));
  if (containsMatch) return containsMatch;
  // Check if input contains a key from the normalize map
  for (const [key, val] of Object.entries(LOB_NORMALIZE)) {
    if (key.length >= 3 && lower.includes(key)) return val;
  }
  return input.trim();
};

// Auto-calculate expiration date: 6 months for auto/motorcycle, 1 year for everything else
const isAutoTermLob = (lob) => lob === "Auto";
const COMMERCIAL_LOBS = ["Commercial GL","Commercial Property","Commercial Auto","Workers Comp","BOP"];
const isCommercialLob = (lob) => COMMERCIAL_LOBS.includes(lob);
const renewalWindow = (lob) => isCommercialLob(lob) ? 150 : 55;
const calcExpiration = (effDate, lob) => {
  if (!effDate) return "";
  const d = new Date(effDate + "T12:00:00");
  if (isNaN(d)) return "";
  if (isAutoTermLob(lob)) { d.setMonth(d.getMonth() + 6); }
  else { d.setFullYear(d.getFullYear() + 1); }
  return d.toISOString().split("T")[0];
};
const SOURCES = ["Referral","Web","Walk-in","Marketing","Cross-Sell","Rewrite","Win-Back","Other"];
const CONTACT_METHODS = ["Phone","Email","Text","In Person","Voicemail","Mail"];
const CONTACT_RELATIONSHIPS = ["Primary","Spouse","Child","Parent","Sibling","Business Partner","Other"];

// Communication templates — pre-built messages for common outreach (uses config for agent identity)
const getTemplates = (cfg) => {
  const sign = `${cfg.agentName || "Agent"}\n${cfg.agencyName || ""}\n${cfg.agentPhone || ""}`.trim();
  return [
  { id: "renewal_reminder", label: "Renewal Reminder", channel: "Email", subject: "Your {lob} Policy Renewal",
    body: `Hi {name},\n\nThis is a reminder that your {lob} policy with {carrier} (#{policyNumber}) is coming up for renewal on {expirationDate}.\n\nI'd like to review your coverage and ensure you're getting the best rate available. Please give me a call at your convenience, or let me know a good time to connect.\n\nBest regards,\n${sign}` },
  { id: "payment_followup", label: "Payment Follow-Up", channel: "Email", subject: "Action Needed: Payment on Your {lob} Policy",
    body: `Hi {name},\n\nI'm reaching out regarding a payment issue on your {lob} policy with {carrier} (#{policyNumber}). To keep your coverage active, we need to get this resolved as soon as possible.\n\nPlease call me at your earliest convenience so we can discuss options.\n\nBest regards,\n${sign}` },
  { id: "welcome", label: "Welcome New Client", channel: "Email", subject: `Welcome to ${cfg.agencyName || "Our Agency"}!`,
    body: `Hi {name},\n\nWelcome to ${cfg.agencyName || "our agency"}! I'm excited to have you as a client.\n\nYour {lob} policy with {carrier} is now active. Here are a few things to keep in mind:\n\n- Keep your policy documents in a safe place\n- Contact me anytime with questions or changes\n- I'll reach out before your renewal to review your coverage\n\nLooking forward to working with you!\n\nBest regards,\n${sign}` },
  { id: "missing_docs", label: "Missing Documents", channel: "Email", subject: "Documents Needed for Your {lob} Policy",
    body: `Hi {name},\n\nI'm following up on your {lob} policy with {carrier}. We still need the following documents to complete your file:\n\n[LIST MISSING DOCS]\n\nCould you please send these at your earliest convenience? You can email them directly to this address or drop them off at our office.\n\nThank you,\n${sign}` },
  { id: "overdue_payment", label: "Overdue Payment / Lapsed Policy", channel: "Email", subject: "URGENT: Overdue Payment on Your {lob} Policy",
    body: `Hi {name},\n\nI'm reaching out regarding an overdue payment on your {lob} policy with {carrier} (#{policyNumber}).\n\nYour payment was originally due on {dueDate}, and because it was not received, your policy has lapsed. This means you currently do not have active coverage, which puts you at serious financial risk.\n\nThe good news is that your policy may still be eligible for reinstatement if payment is made as soon as possible. Please do not delay — the window for reinstatement is limited.\n\nYou can make your payment online here:\n{paymentLink}\n\nIf you are unable to pay online, please call me immediately at {agentPhone} so we can discuss your options and get your coverage restored.\n\nBest regards,\n${sign}` },
  { id: "cross_sell", label: "Cross-Sell Outreach", channel: "Email", subject: "Additional Coverage Options for You",
    body: `Hi {name},\n\nAs your agent, I wanted to check in about your overall coverage. Based on your current policies, you may benefit from additional protection.\n\nI'd love to run some quick quotes to see what options and savings might be available. No obligation — just want to make sure you're fully covered.\n\nWould you have a few minutes this week to chat?\n\nBest regards,\n${sign}` },
  { id: "text_checkin", label: "Quick Text Check-In", channel: "Text",
    body: `Hi {name}, this is ${cfg.agentName || "your agent"} from ${cfg.agencyName || "our agency"}. Just checking in on your {lob} policy. Any questions or changes needed? Happy to help! 😊` },
  { id: "text_followup", label: "Text Follow-Up", channel: "Text",
    body: "Hi {name}, following up on our conversation about your {lob} policy. Were you able to get those documents together? Let me know if you need anything!" },
];
};

// Document types tracked per policy
const POLICY_DOCS = {
  personal_home: ["Dec Page", "Wind Mitigation", "4-Point Inspection", "Roof Inspection", "Proof of Prior", "Elevation Certificate", "Photos"],
  personal_auto: ["Dec Page", "Proof of Prior", "Driver License", "Vehicle Registration", "MVR Report"],
  commercial: ["Dec Page", "ACORD App", "Loss Runs", "Certificates of Insurance", "Additional Insured Endorsement", "Audit Worksheet", "Financial Statements"],
  default: ["Dec Page", "Proof of Prior", "Application"],
};
const getDocTypes = (lob) => {
  if (["Home","Homeowners","Condo","Renters","DP-3","DP-1"].includes(lob)) return POLICY_DOCS.personal_home;
  if (["Auto"].includes(lob)) return POLICY_DOCS.personal_auto;
  if (["Commercial GL","Commercial Property","Commercial Auto","Workers Comp","BOP"].includes(lob)) return POLICY_DOCS.commercial;
  return POLICY_DOCS.default;
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (d) => { if (!d) return "—"; const dt = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00"); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const fmtShort = (d) => { if (!d) return "—"; const dt = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00"); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const today = () => new Date().toISOString().split("T")[0];
const normalizeDate = (d) => {
  if (d == null || d === "") return "";
  // Handle Excel serial date numbers (days since 1900-01-01) — as number OR string
  const numVal = typeof d === "number" ? d : (typeof d === "string" && /^\d{4,5}(\.\d+)?$/.test(String(d).trim())) ? Number(String(d).trim()) : null;
  if (numVal !== null && numVal > 40000 && numVal < 60000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + Math.floor(numVal));
    return epoch.toISOString().split("T")[0];
  }
  if (typeof d === "number") return "";
  // Strip invisible characters, non-breaking spaces, BOM, zero-width chars, carriage returns
  const s = String(d).replace(/[\r\u00A0\u200B\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Explicitly handle M/D/YYYY, MM/DD/YYYY, M-D-YYYY, M.D.YYYY FIRST (most common from Excel)
  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    let [, m, day, yr] = slashMatch.map(Number);
    if (yr < 100) yr += 2000;
    if (m >= 1 && m <= 12 && day >= 1 && day <= 31 && yr >= 1900 && yr <= 2100) {
      return `${yr}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }
  // Try parsing with Date
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    if (y < 100) parsed.setFullYear(y + 2000);
    return parsed.toISOString().split("T")[0];
  }
  return s;
};

// CSV export utility
let _exportCallback = null;
function exportCSV(headers, rows, filename) {
  const escape = (v) => { const s = String(v ?? ""); return s.includes("\t") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
  const tsv = [headers.map(escape).join("\t"), ...rows.map(r => r.map(escape).join("\t"))].join("\n");
  if (_exportCallback) _exportCallback({ csv: tsv, filename });
}
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: filename.endsWith(".json") ? "application/json" : "text/tab-separated-values" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Config defaults
const DEFAULT_CONFIG = {
  carriers: ["Allstate","American Integrity Insurance Company","Beyond Floods","Cabrillo Coastal Insurance Company","Citizens Property & Casualty Insurance Company","Cypress Property & Casualty Insurance Company","Homeowners Choice Property & Casualty Insurance Company","Manatee Insurance Exchange","Monarch National Insurance Company","Mount Vernon Fire Insurance Company","National General Insurance Company","Ovation Insurance Exchange","RLI","Security First Insurance Company","Slide Insurance Company","Southern Oak Insurance Company","Tower Hill Insurance Group","Universal North America Insurance Company","Winward Risk Managers"],
  carrierGroups: {
    "Allstate": ["Allstate Fire and Casualty Insurance Company","Allstate North American Insurance Company","Allstate Insurance Company","Allstate Property and Casualty Insurance Company","Allstate Indemnity Company","Castle Key Indemnity","Castle Key Insurance Company"],
    "Tower Hill Insurance Group": ["Tower Hill Insurance Exchange"],
    "Universal North America Insurance Company": ["Universal North America Insurance Company"],
    "Winward Risk Managers": ["Florida Peninsula Insurance Company","Edison Insurance Company","Ovation Insurance Exchange"],
    "Citizens Property & Casualty Insurance Company": ["Citizens Property & Casualty Insurance Company"],
    "Slide Insurance Company": ["Slide Insurance Company"],
    "Cypress Property & Casualty Insurance Company": ["Cypress Property & Casualty Insurance Company"],
    "American Integrity Insurance Company": ["American Integrity Insurance Company"],
    "Beyond Floods": ["Beyond Floods"],
    "Cabrillo Coastal Insurance Company": ["Cabrillo Coastal Insurance Company"],
    "Homeowners Choice Property & Casualty Insurance Company": ["Homeowners Choice Property & Casualty Insurance Company"],
    "Manatee Insurance Exchange": ["Manatee Insurance Exchange"],
    "Monarch National Insurance Company": ["Monarch National Insurance Company"],
    "Mount Vernon Fire Insurance Company": ["Mount Vernon Fire Insurance Company"],
    "National General Insurance Company": ["National General Insurance Company"],
    "Ovation Insurance Exchange": ["Ovation Insurance Exchange"],
    "RLI": ["RLI"],
    "Security First Insurance Company": ["Security First Insurance Company"],
    "Southern Oak Insurance Company": ["Southern Oak Insurance Company"],
  },

  transactionTypes: ["Allstate Termination","Allstate Cancel","Allstate P-Cancel","Ivantage Renewal","Ivantage Installment","Commercial Renewal","UW Cancellation","New Business","2026 Renewal","2027 Renewal","Endorsement","General"],
  cancellationReasons: ["Replaced Coverage","Non-Payment","Underwriting","Property/Vehicle Sold","Death","Moved"],
  sources: ["Referral","Web","Walk-in","Marketing","Cross-Sell","Rewrite","Win-Back","Other"],
  brokers: ["Brown & Brown","USI Insurance Services","Hub International","Marsh McLennan Agency","Gallagher","Risk Strategies","AssuredPartners","Lockton","Acrisure","Other"],
  lobOptions: ["Auto","Homeowners","DP-3","DP-1","Umbrella","Renters","Condo","Life","Roadside","Flood","Boat","Motorcycle or ORV","Classic Car","RV","CPL","Excess CPL","Scheduled Personal Property","Jewelry/Valuables","Commercial GL","Commercial Property","Commercial Auto","Workers Comp","BOP"],
  quotaTarget: 13,
  agentName: "Alec",
  agencyName: "Sentinel Insurance, LLC",
  agentPhone: "954-555-0000",
  agentEmail: "",
  commissionRates: {
    "Allstate|Auto": 10, "Allstate|Home": 10, "Allstate|Umbrella": 10, "Allstate|Renters": 10, "Allstate|Condo": 10, "Allstate|Life": 25,
    "Citizens|Home": 8, "Tower Hill|Home": 12, "Hartford|Commercial GL": 15, "Hartford|BOP": 15,
    "Travelers|BOP": 15, "Travelers|Commercial GL": 15, "TypTap|Home": 10, "Universal|Home": 10,
    "default": 10
  },
  monthlyOverhead: 15000,
};
// Config storage: localStorage = synchronous cache for instant reads, window.storage = persistent source of truth.
// On startup, restoreConfig() hydrates localStorage from window.storage. saveConfig() writes to both.
// When migrating to Supabase, replace both with a single async source.
const CONFIG_KEY = "sentinel_config";
const CONFIG_STORAGE_KEY = "sentinel-platform-config";
const loadConfig = () => { try { const c = JSON.parse(localStorage.getItem(CONFIG_KEY)); const merged = c ? { ...DEFAULT_CONFIG, ...c } : { ...DEFAULT_CONFIG }; if (merged.carrierGroups) { merged.carriers = Object.keys(merged.carrierGroups).sort(); } if (merged.lobOptions) { const idx = merged.lobOptions.indexOf("Home"); if (idx !== -1 && merged.lobOptions.includes("Homeowners")) merged.lobOptions.splice(idx, 1); else if (idx !== -1) merged.lobOptions[idx] = "Homeowners"; LOB_OPTIONS.forEach(l => { if (!merged.lobOptions.includes(l)) merged.lobOptions.push(l); }); } return merged; } catch { return { ...DEFAULT_CONFIG }; } };
const saveConfig = (c) => { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); try { window.storage.set(CONFIG_STORAGE_KEY, JSON.stringify(c)); } catch {} };
// Restore config from persistent storage into localStorage (called once on boot)
async function restoreConfig() {
  try {
    const result = await window.storage.get(CONFIG_STORAGE_KEY);
    if (result && result.value) {
      localStorage.setItem(CONFIG_KEY, result.value);
      return true;
    }
  } catch {}
  return false;
}

// Clickable account name link — usable from any page
function AccountLink({ accountId, name, nav }) {
  if (!nav || !accountId) return <span style={{ color: COLORS.accentLight }}>{name || "—"}</span>;
  return (
    <span
      style={{ color: COLORS.accentLight, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
      onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
      onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
      onClick={e => { e.stopPropagation(); nav(accountId); }}
    >{name || "—"}</span>
  );
}

function ClientQuickView({ accountId, data, setData, config, onClose, onFullPage }) {
  const acct = data.accounts.find(a => a.id === accountId);
  const [tab, setTab] = useState("service");
  const [expandedPolId, setExpandedPolId] = useState(null);
  const [noteText, setNoteText] = useState("");
  if (!acct) return null;
  const pols = data.policies.filter(p => p.accountId === accountId);
  const svcItems = (data.serviceItems || []).filter(s => s.accountId === accountId);
  const notes = (data.notes || []).filter(n => n.accountId === accountId).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const tasks = (data.tasks || []).filter(t => t.linkedId === accountId);
  const todayStr = today();
  const upAcct = (field, value) => {
    setData({ ...data, accounts: data.accounts.map(a => a.id === accountId ? { ...a, [field]: value } : a) });
  };
  const upPol = (polId, field, value) => {
    // Intercept Cancelled status — open cancellation modal
    if (field === "status" && value === "Cancelled") { setCancellingPolicyId(polId); return; }
    // Inline validation for numeric fields
    if (["premium","agencyFee"].includes(field) && value !== "" && Number(value) < 0) return;
    if (field === "commissionPct" && value !== "" && (Number(value) < 0 || Number(value) > 100)) return;
    if (field === "vehicleCount" && value !== "" && Number(value) < 0) return;
    const updatedPolicies = data.policies.map(p => p.id === polId ? { ...p, [field]: ["premium","vehicleCount","agencyFee","commissionPct"].includes(field) ? (Number(value) || 0) : value } : p);
    let updated = { ...data, policies: updatedPolicies };
    // Auto-create renewal service item when expiration date is set within renewal window
    if (field === "expirationDate" && value) {
      const daysToExp = daysBetween(todayStr, value);
      const pol = updatedPolicies.find(p => p.id === polId);
      const renewalTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal"];
      const hasRenewal = updated.serviceItems.some(si => si.policyId === polId && renewalTypes.some(rt => si.type.includes("Renewal")));
      const window = pol ? renewalWindow(pol.lob) : 55;
      if (pol && pol.status === "Active" && daysToExp >= 0 && daysToExp <= window && !hasRenewal) {
        const type = isCommercialLob(pol.lob) ? "Commercial Renewal" : (pol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
        const newSI = {
          id: uid(), type, accountId, accountName: acct.name, policyId: polId,
          policyNumber: pol.policyNumber, carrier: pol.carrier, lob: pol.lob,
          description: (pol.carrier || "") + " " + (pol.lob || "") + " Renewal",
          dueDate: value, amountDue: pol.premium || 0, status: "Uncontacted",
          urgency: daysToExp <= 14 ? "High" : "Medium", assignedTo: config.agentName || "Agent",
          created: todayStr, lastAction: "", lastActionDate: "", followUpDate: todayStr,
          notes: "", ballInCourt: false, flags: [], contactAttempts: []
        };
        updated = { ...updated, serviceItems: [...updated.serviceItems, newSI] };
      }
    }
    setData(updated);
  };
  const addNote = () => {
    if (!noteText.trim()) return;
    const note = { id: uid(), accountId, text: noteText.trim(), createdBy: config.agentName || "Agent", createdAt: new Date().toISOString() };
    setData({ ...data, notes: [...(data.notes || []), note] });
    setNoteText("");
  };
  const [renewalPopupSI, setRenewalPopupSI] = React.useState(null);
  const [cancellingPolicyId, setCancellingPolicyId] = React.useState(null);
  const upSvc = (siId, field, value) => {
    // Intercept "Renewed" status — open renewal popup instead of directly changing
    if (field === "status" && value === "Renewed") {
      const si = data.serviceItems.find(s => s.id === siId);
      if (si) { setRenewalPopupSI(si); return; }
    }
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === siId ? { ...s, [field]: value } : s) };
    // When a renewal service item is marked Done, activate the linked policy
    if (field === "status" && value === "Done") {
      const si = data.serviceItems.find(s => s.id === siId);
      if (si) updated = safeActivateRenewalPolicy(updated, si);
    }
    setData(updated);
  };
  const iS = { ...S.input, padding: "4px 8px", fontSize: 12 };
  const activePols = pols.filter(p => p.status === "Active");
  const openSvc = svcItems.filter(s => s.status !== "Done");
  const lobOpts = config.lobOptions || LOB_OPTIONS;
  const cgList = Object.keys(config.carrierGroups || {}).sort();
  const tabs = [
    { id: "info", label: "Contact & Policies" },
    { id: "service", label: "Service Items (" + String(openSvc.length) + ")" },
    { id: "notes", label: "Notes (" + String(notes.length) + ")" },
    { id: "tasks", label: "Tasks (" + String(tasks.filter(t => t.status !== "Completed").length) + ")" }
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose} data-modal="true">
      <div style={{ width: "90%", maxWidth: 1100, height: "88vh", background: COLORS.bg, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid " + COLORS.border }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: COLORS.card, borderBottom: "1px solid " + COLORS.border, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{acct.name}</div>
            <div style={{ fontSize: 12, color: COLORS.textDim }}>{acct.type + " · " + String(activePols.length) + " active " + (activePols.length === 1 ? "policy" : "policies") + " · $" + String(activePols.reduce((s, p) => s + (p.premium || 0), 0).toLocaleString()) + " premium"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ ...S.btn("ghost"), padding: "5px 14px", fontSize: 11 }} onClick={onFullPage}>Open Full Page →</button>
            <span style={{ cursor: "pointer", fontSize: 22, color: COLORS.textDim, lineHeight: 1 }} onClick={onClose}>✕</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + COLORS.border, flexShrink: 0, background: COLORS.card }}>
          {tabs.map(t => (
            <div key={t.id} style={{ padding: "9px 18px", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? COLORS.accentLight : COLORS.textDim, borderBottom: tab === t.id ? "2px solid " + COLORS.accent : "2px solid transparent" }} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

          {tab === "info" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {/* Contacts box */}
                <div style={{ ...S.card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>CONTACTS ({(acct.contacts || []).length})</div>
                    <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "2px 6px" }} onClick={() => {
                      const contacts = [...(acct.contacts || []), { id: uid(), name: "", relationship: "Spouse", phone: "", email: "" }];
                      upAcct("contacts", contacts);
                    }}>+ Add</button>
                  </div>
                  {(acct.contacts || []).map((c, ci) => {
                    const isPrimary = ci === 0;
                    const updateContact = (field, value) => {
                      const contacts = (acct.contacts || []).map((ct, i) => i === ci ? { ...ct, [field]: value } : ct);
                      let up = { ...data, accounts: data.accounts.map(a => a.id === accountId ? { ...a, contacts } : a) };
                      if (isPrimary && (field === "phone" || field === "email")) up = { ...up, accounts: up.accounts.map(a => a.id === accountId ? { ...a, [field]: value } : a) };
                      setData(up);
                    };
                    const removeContact = () => { if (isPrimary) return; upAcct("contacts", (acct.contacts || []).filter((_, i) => i !== ci)); };
                    return (
                      <div key={c.id || ci} style={{ marginBottom: ci < (acct.contacts || []).length - 1 ? 6 : 0, paddingBottom: ci < (acct.contacts || []).length - 1 ? 6 : 0, borderBottom: ci < (acct.contacts || []).length - 1 ? `1px solid ${COLORS.border}20` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, background: `${COLORS.accent}20`, color: COLORS.accentLight, padding: "1px 5px", borderRadius: 3 }}>PRIMARY</span>}
                          {!isPrimary && <select style={{ background: "transparent", border: "none", fontSize: 10, color: COLORS.textDim, padding: 0, cursor: "pointer", fontWeight: 600 }} value={c.relationship || "Other"} onChange={e => updateContact("relationship", e.target.value)}>{CONTACT_RELATIONSHIPS.filter(r => r !== "Primary").map(r => <option key={r} value={r}>{r}</option>)}</select>}
                          {!isPrimary && <button style={{ marginLeft: "auto", background: "none", border: "none", color: COLORS.textMuted, fontSize: 11, cursor: "pointer", padding: 0 }} onClick={removeContact}>✕</button>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                          <div><input style={{ ...iS, fontSize: 11, padding: "2px 5px" }} value={c.name || ""} onChange={e => updateContact("name", e.target.value)} placeholder="Name" /></div>
                          <div><input style={{ ...iS, fontSize: 11, padding: "2px 5px" }} value={c.phone || ""} onChange={e => updateContact("phone", e.target.value)} placeholder="Phone" /></div>
                          <div style={{ gridColumn: "span 2" }}><input style={{ ...iS, fontSize: 11, padding: "2px 5px" }} value={c.email || ""} onChange={e => updateContact("email", e.target.value)} placeholder="Email" /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Address box */}
                <div style={{ ...S.card }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>ACCOUNT & ADDRESS</div>
                  <div><div style={S.formLabel}>Account Name</div><input style={iS} value={acct.name || ""} onChange={e => upAcct("name", e.target.value)} /></div>
                  <div style={{ marginTop: 6 }}><div style={S.formLabel}>Type</div><select style={iS} value={acct.type || "Personal"} onChange={e => upAcct("type", e.target.value)}><option value="Personal">Personal</option><option value="Commercial">Commercial</option></select></div>
                  {acct.type === "Commercial" && <div style={{ marginTop: 6 }}><div style={S.formLabel}>Contact Name (Owner/POC)</div><input style={iS} value={acct.contactName || ""} onChange={e => upAcct("contactName", e.target.value)} placeholder="Business owner or point of contact" /></div>}
                  <div style={{ marginTop: 6 }}><div style={S.formLabel}>Street Address</div><input style={iS} value={acct.address || ""} onChange={e => upAcct("address", e.target.value)} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 4, marginTop: 6 }}>
                    <div><div style={S.formLabel}>City</div><input style={iS} value={acct.city || ""} onChange={e => upAcct("city", e.target.value)} /></div>
                    <div><div style={S.formLabel}>State</div><input style={{ ...iS, width: 45, textAlign: "center" }} value={acct.state || ""} onChange={e => upAcct("state", e.target.value)} maxLength={2} /></div>
                    <div><div style={S.formLabel}>Zip</div><input style={{ ...iS, width: 65 }} value={acct.zip || ""} onChange={e => upAcct("zip", e.target.value)} maxLength={5} /></div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, letterSpacing: "0.5px" }}>{"POLICIES (" + String(pols.length) + ")"}</div>
              {pols.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 16 }}>No policies</div>}
              {pols.map(pol => {
                const isExp = expandedPolId === pol.id;
                const daysLeft = pol.expirationDate ? daysBetween(todayStr, pol.expirationDate) : null;
                const isAuto = pol.lob === "Auto" || pol.lob === "Commercial Auto";
                return (
                  <div key={pol.id} style={{ ...S.card, marginBottom: 6, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedPolId(isExp ? null : pol.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{isExp ? "▾" : "▸"}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{pol.carrier || "—"}</span>
                        <span style={{ fontSize: 12, color: COLORS.textDim }}>{pol.lob || ""}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.textDim }}>{pol.policyNumber || ""}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{"$" + String((pol.premium || 0).toLocaleString())}</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: statusColor(pol.status) + "18", color: statusColor(pol.status), fontWeight: 600 }}>{pol.status || "Active"}</span>
                        {daysLeft !== null && daysLeft <= 60 && daysLeft >= 0 ? <span style={{ fontSize: 10, color: COLORS.warning }}>{String(daysLeft) + "d left"}</span> : null}
                      </div>
                    </div>
                    {isExp && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + COLORS.border }}>
                        <div style={S.grid(3)}>
                          <div><div style={S.formLabel}>Carrier</div><select style={iS} value={pol.carrier || ""} onChange={e => upPol(pol.id, "carrier", e.target.value)}>{[...(!cgList.includes(pol.carrier) && pol.carrier ? [pol.carrier] : []), ...cgList].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                          <div><div style={S.formLabel}>LOB</div><select style={iS} value={pol.lob || ""} onChange={e => upPol(pol.id, "lob", e.target.value)}>{lobOpts.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                          <div><div style={S.formLabel}>Policy #</div><input style={iS} value={pol.policyNumber || ""} onChange={e => upPol(pol.id, "policyNumber", e.target.value)} /></div>
                          <div><div style={S.formLabel}>Status</div><select style={iS} value={pol.status || "Active"} onChange={e => upPol(pol.id, "status", e.target.value)}>{POLICY_STATUSES.map(sv => <option key={sv} value={sv}>{sv}</option>)}</select></div>
                          {pol.status === "Cancelled" && <div><div style={S.formLabel}>Cancel Date</div><input style={iS} type="date" value={pol.cancellationDate || ""} onChange={e => upPol(pol.id, "cancellationDate", e.target.value)} /></div>}
                          {pol.status === "Cancelled" && <div><div style={S.formLabel}>Cancel Reason</div><select style={iS} value={pol.cancellationReason || ""} onChange={e => upPol(pol.id, "cancellationReason", e.target.value)}><option value="">—</option>{(config.cancellationReasons || []).map(r => <option key={r} value={r}>{r}</option>)}</select></div>}
                          <div><div style={S.formLabel}>Effective</div><input style={iS} type="date" value={pol.effectiveDate || ""} onChange={e => { upPol(pol.id, "effectiveDate", e.target.value); if (e.target.value) { const exp = calcExpiration(e.target.value, pol.lob); if (exp) upPol(pol.id, "expirationDate", exp); } }} /></div>
                          <div><div style={S.formLabel}>Expiration</div><input style={iS} type="date" value={pol.expirationDate || ""} onChange={e => upPol(pol.id, "expirationDate", e.target.value)} /></div>
                          <div><div style={S.formLabel}>Premium</div><input style={iS} type="number" value={pol.premium || ""} onChange={e => upPol(pol.id, "premium", e.target.value)} /></div>
                          {acct.type === "Commercial" && <div><div style={S.formLabel}>Agency Fee</div><input style={iS} type="number" value={pol.agencyFee || ""} onChange={e => upPol(pol.id, "agencyFee", e.target.value)} placeholder="0" /></div>}
                          <div><div style={S.formLabel}>Payment</div><select style={iS} value={pol.paymentPlan || "Monthly"} onChange={e => upPol(pol.id, "paymentPlan", e.target.value)}>{["Annual","Semi-Annual","Quarterly","Monthly","EFT"].map(pp => <option key={pp} value={pp}>{pp}</option>)}</select></div>
                          {isAuto ? <div><div style={S.formLabel}>Vehicles</div><input style={{ ...iS, width: 50 }} type="number" min="1" value={pol.vehicleCount || 1} onChange={e => upPol(pol.id, "vehicleCount", e.target.value)} /></div> : null}
                          {acct.type === "Commercial" && <div><div style={S.formLabel}>Broker</div><select style={iS} value={pol.broker || ""} onChange={e => upPol(pol.id, "broker", e.target.value)}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}{pol.broker && !(config.brokers || []).includes(pol.broker) && <option value={pol.broker}>{pol.broker}</option>}</select></div>}
                          {acct.type === "Commercial" && <div><div style={S.formLabel}>Commission %</div><input style={{ ...iS, width: 70 }} type="number" min="0" max="100" step="0.5" value={pol.commissionPct != null ? pol.commissionPct : 10} onChange={e => upPol(pol.id, "commissionPct", e.target.value)} /></div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "service" && (
            <div>
              {svcItems.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 16 }}>No service items</div>}
              {svcItems.sort((a, b) => (a.status === "Done" ? 1 : 0) - (b.status === "Done" ? 1 : 0) || (a.dueDate || "z").localeCompare(b.dueDate || "z")).map(si => {
                const pol = data.policies.find(p => p.id === si.policyId);
                const polReqCancel = pol && pol.status === "Requested Cancel";
                const sbStyle = statusBadgeStyle(si.status);
                return (
                  <div key={si.id} style={{ ...S.card, marginBottom: 8, padding: "12px 16px", opacity: si.status === "Done" || polReqCancel ? 0.5 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{si.type || "—"}</span>
                        <span style={{ fontSize: 11, color: COLORS.textDim, fontFamily: "monospace" }}>{pol ? (pol.policyNumber || "") : ""}</span>
                        <span style={{ fontSize: 11, color: COLORS.textDim }}>{pol ? (pol.lob || "") : ""}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: COLORS.textDim }}>{fmtShort(si.dueDate)}</span>
                        {si.amountDue ? <span style={{ fontSize: 12, fontWeight: 600 }}>{"$" + String(Number(si.amountDue).toLocaleString())}</span> : null}
                      </div>
                    </div>
                    <div style={S.grid(3)}>
                      <div>
                        <div style={S.formLabel}>Status</div>
                        <select style={{ ...iS, fontWeight: 600, background: sbStyle.background, color: sbStyle.color, border: "none" }} value={si.status || ""} onChange={e => upSvc(si.id, "status", e.target.value)}>
                          {getServiceStatuses(si).map(sv => <option key={sv} value={sv}>{sv}</option>)}
                        </select>
                      </div>
                      {pol && <div>
                        <div style={S.formLabel}>Policy Status</div>
                        <select style={iS} value={pol.status || "Active"} onChange={e => upPol(pol.id, "status", e.target.value)}>
                          {POLICY_STATUSES.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                        </select>
                      </div>}
                      <div>
                        <div style={S.formLabel}>Last Action</div>
                        <input style={iS} value={si.lastAction || ""} onChange={e => upSvc(si.id, "lastAction", e.target.value)} placeholder="What was done..." />
                      </div>
                      <div>
                        <div style={S.formLabel}>Next Step</div>
                        <input style={iS} value={si.nextStep || ""} onChange={e => upSvc(si.id, "nextStep", e.target.value)} placeholder="What's next..." />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "notes" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Add a note..." value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addNote(); }} />
                <button style={S.btn()} onClick={addNote} disabled={!noteText.trim()}>Add</button>
              </div>
              {notes.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 16 }}>No notes yet</div>}
              {notes.map(n => (
                <div key={n.id} style={{ padding: "10px 14px", background: COLORS.card, borderRadius: 6, marginBottom: 6, border: "1px solid " + COLORS.border }}>
                  <div style={{ fontSize: 13 }}>{n.text || ""}</div>
                  <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>{(n.createdBy || "") + " · " + fmt(n.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "tasks" && (
            <div>
              {tasks.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 16 }}>No tasks</div>}
              {tasks.sort((a, b) => (a.status === "Completed" ? 1 : 0) - (b.status === "Completed" ? 1 : 0) || (a.dueDate || "z").localeCompare(b.dueDate || "z")).map(t => (
                <div key={t.id} style={{ padding: "10px 14px", background: COLORS.card, borderRadius: 6, marginBottom: 6, border: "1px solid " + COLORS.border, opacity: t.status === "Completed" ? 0.4 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{t.title || "—"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: t.dueDate < todayStr && t.status !== "Completed" ? COLORS.danger : COLORS.textDim }}>{fmtShort(t.dueDate)}</span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: statusBadgeStyle(t.status).background, color: statusBadgeStyle(t.status).color }}>{t.status || "—"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
      {renewalPopupSI && <RenewalPopup si={renewalPopupSI} data={data} setData={setData} config={config} onClose={() => setRenewalPopupSI(null)} />}
      {cancellingPolicyId && <CancellationModal policyId={cancellingPolicyId} data={data} setData={setData} config={config} onClose={() => setCancellingPolicyId(null)} />}
    </div>
  );
}


// ==================== SEED DATA ====================
const APP_VERSION = "0.7.0";
function createSeedData() {
  const now = new Date();
  const accounts = [
    { id: uid(), name: "Rodriguez Family", type: "Personal", phone: "954-555-0101", email: "mrodriguez@email.com", address: "1420 SE 17th St", city: "Fort Lauderdale", state: "FL", zip: "33316", status: "Active", created: "2024-06-15",
      contacts: [{ id: uid(), name: "Miguel Rodriguez", relationship: "Primary", phone: "954-555-0101", email: "mrodriguez@email.com" }, { id: uid(), name: "Sofia Rodriguez", relationship: "Spouse", phone: "954-555-0102", email: "srodriguez@email.com" }],
      policyType: "home", lineOfBusiness: "personal", carrier: "Allstate", autoItemCount: 2, xDate: "2026-05-15", xDateSource: "carrier_list", roofYear: 2018, windMitigation: "full", constructionType: "CBS", propertyAddress: "1420 SE 17th St, Fort Lauderdale, FL 33316", pipelineStatus: "service_only", serviceLog: [] },
    { id: uid(), name: "Chen Household", type: "Personal", phone: "954-555-0202", email: "lchen@email.com", address: "800 Las Olas Blvd", city: "Fort Lauderdale", state: "FL", zip: "33301", status: "Active", created: "2024-03-20",
      contacts: [{ id: uid(), name: "Linda Chen", relationship: "Primary", phone: "954-555-0202", email: "lchen@email.com" }, { id: uid(), name: "David Chen", relationship: "Spouse", phone: "954-555-0203", email: "dchen@email.com" }, { id: uid(), name: "Emily Chen", relationship: "Child", phone: "", email: "echen@email.com" }],
      policyType: "home", lineOfBusiness: "personal", carrier: "Citizens", autoItemCount: 1, xDate: "2026-03-01", xDateSource: "carrier_list", roofYear: 2005, windMitigation: "none", constructionType: "Frame", propertyAddress: "800 Las Olas Blvd, Fort Lauderdale, FL 33301", pipelineStatus: "service_only", serviceLog: [] },
    { id: uid(), name: "Sunrise Pest Control", type: "Commercial", phone: "954-555-0303", email: "info@sunrisepest.com", address: "3200 N Federal Hwy", city: "Fort Lauderdale", state: "FL", zip: "33306", status: "Active", created: "2024-09-01",
      policyType: "commercial", lineOfBusiness: "commercial", carrier: "", autoItemCount: 0, xDate: "2026-09-01", xDateSource: "carrier_list", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "service_only", serviceLog: [] },
    { id: uid(), name: "Bright Horizons Daycare", type: "Commercial", phone: "954-555-0404", email: "admin@brighthorizons.com", address: "500 NW 1st Ave", city: "Fort Lauderdale", state: "FL", zip: "33311", status: "Active", created: "2025-01-10",
      policyType: "commercial", lineOfBusiness: "commercial", carrier: "", autoItemCount: 0, xDate: "2026-01-15", xDateSource: "carrier_list", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "service_only", serviceLog: [] },
    { id: uid(), name: "Thompson Family", type: "Personal", phone: "954-555-0505", email: "jthompson@email.com", address: "2100 E Sunrise Blvd", city: "Fort Lauderdale", state: "FL", zip: "33304", status: "Active", created: "2023-11-05",
      policyType: "auto", lineOfBusiness: "personal", carrier: "Allstate", autoItemCount: 1, xDate: "2026-04-01", xDateSource: "carrier_list", roofYear: 2020, windMitigation: "full", constructionType: "CBS", propertyAddress: "2100 E Sunrise Blvd, Fort Lauderdale, FL 33304", pipelineStatus: "service_only", serviceLog: [] },
  ];

  const policies = [
    { id: uid(), accountId: accounts[0].id, accountName: accounts[0].name, carrier: "Allstate", lob: "Auto", policyNumber: "ALT-90442881", effectiveDate: "2025-07-01", expirationDate: "2026-07-01", premium: 2340, status: "Active", paymentPlan: "Monthly", vehicleCount: 2, documents: { "Dec Page": true, "Proof of Prior": true, "Driver License": true, "Vehicle Registration": false, "MVR Report": true }, notes: "" },
    { id: uid(), accountId: accounts[0].id, accountName: accounts[0].name, carrier: "Allstate", lob: "Homeowners", policyNumber: "ALT-90442882", effectiveDate: "2025-05-15", expirationDate: "2026-05-15", premium: 3100, status: "Active", paymentPlan: "Annual", vehicleCount: 0, documents: { "Dec Page": true, "Wind Mitigation": true, "4-Point Inspection": true, "Roof Inspection": false, "Proof of Prior": true, "Elevation Certificate": false, "Photos": true }, notes: "Wind mit credit applied, saves ~$400/yr" },
    { id: uid(), accountId: accounts[1].id, accountName: accounts[1].name, carrier: "Citizens", lob: "Homeowners", policyNumber: "CIT-7742001", effectiveDate: "2025-03-01", expirationDate: "2026-03-01", premium: 4200, status: "Active", paymentPlan: "Quarterly", vehicleCount: 0, documents: { "Dec Page": true, "Wind Mitigation": false, "4-Point Inspection": false, "Roof Inspection": false, "Proof of Prior": true, "Elevation Certificate": false, "Photos": true }, notes: "Needs wind mit and 4-point for renewal — potential savings if obtained" },
    { id: uid(), accountId: accounts[1].id, accountName: accounts[1].name, carrier: "Allstate", lob: "Auto", policyNumber: "ALT-90443010", effectiveDate: "2025-08-15", expirationDate: "2026-08-15", premium: 1890, status: "Active", paymentPlan: "Monthly", vehicleCount: 1, documents: { "Dec Page": true, "Proof of Prior": true, "Driver License": true, "Vehicle Registration": true, "MVR Report": false }, notes: "" },
    { id: uid(), accountId: accounts[2].id, accountName: accounts[2].name, carrier: "Hartford", lob: "Commercial GL", policyNumber: "HRT-BOP-44210", effectiveDate: "2025-09-01", expirationDate: "2026-09-01", premium: 5600, status: "Active", paymentPlan: "Quarterly", vehicleCount: 0, documents: { "Dec Page": true, "ACORD App": true, "Loss Runs": true, "Certificates of Insurance": true, "Additional Insured Endorsement": false, "Audit Worksheet": false, "Financial Statements": false }, notes: "Hartford BOP — includes pest control specific coverage" },
    { id: uid(), accountId: accounts[3].id, accountName: accounts[3].name, carrier: "Travelers", lob: "BOP", policyNumber: "TRV-DC-88120", effectiveDate: "2025-01-15", expirationDate: "2026-01-15", premium: 7200, status: "Active", paymentPlan: "Monthly", vehicleCount: 0, documents: { "Dec Page": true, "ACORD App": true, "Loss Runs": false, "Certificates of Insurance": true, "Additional Insured Endorsement": true, "Audit Worksheet": false, "Financial Statements": false }, notes: "Daycare-specific GL, abuse & molestation coverage included" },
    { id: uid(), accountId: accounts[4].id, accountName: accounts[4].name, carrier: "Allstate", lob: "Auto", policyNumber: "ALT-90443201", effectiveDate: "2025-04-01", expirationDate: "2026-04-01", premium: 1560, status: "Active", paymentPlan: "EFT", vehicleCount: 1, documents: { "Dec Page": true, "Proof of Prior": true, "Driver License": true, "Vehicle Registration": true, "MVR Report": true }, notes: "Quota item — EFT discount applied" },
    { id: uid(), accountId: accounts[4].id, accountName: accounts[4].name, namedInsured: "Jessica Thompson", carrier: "Tower Hill", lob: "Homeowners", policyNumber: "TWH-FL-55012", effectiveDate: "2025-06-01", expirationDate: "2026-06-01", premium: 2800, status: "Active", paymentPlan: "Annual", vehicleCount: 0, documents: { "Dec Page": true, "Wind Mitigation": true, "4-Point Inspection": true, "Roof Inspection": true, "Proof of Prior": true, "Elevation Certificate": false, "Photos": true }, notes: "Good wind mit — all clips, hip roof" },
  ];

  const serviceItems = [
    { id: uid(), type: "Ivantage Renewal", accountId: accounts[1].id, accountName: accounts[1].name, policyId: policies[2].id, description: "Citizens Home renewal - review rates", status: "Called", flags: [], assignedTo: "Alec", dueDate: "2026-03-01", urgency: "High", created: "2026-01-15", amountDue: 4200, lastAction: "Sent renewal comparison via email", lastActionDate: "2026-02-10", nextStep: "Follow up on quote comparison - Citizens vs Tower Hill vs TypTap", followUpDate: "2026-02-17", contactAttempts: [{ date: "2026-02-10", method: "Phone", notes: "Discussed renewal options" }, { date: "2026-02-05", method: "Email", notes: "Sent renewal comparison" }] },
    { id: uid(), type: "Endorsement", accountId: accounts[0].id, accountName: accounts[0].name, policyId: policies[0].id, description: "Added teen driver - review auto coverage", status: "Called", flags: [], assignedTo: "Alec", dueDate: "2026-02-18", urgency: "Medium", created: "2026-02-01", amountDue: 0, lastAction: "Left voicemail requesting updated driver info", lastActionDate: "2026-02-12", nextStep: "Need teen driver license # and VIN if adding vehicle", followUpDate: "2026-02-15", ballInCourt: true, contactAttempts: [{ date: "2026-02-12", method: "Phone", notes: "Left voicemail" }, { date: "2026-02-08", method: "Text", notes: "Requested updated driver info" }, { date: "2026-02-03", method: "Email", notes: "Initial outreach" }] },
    { id: uid(), type: "Ivantage Installment", accountId: accounts[3].id, accountName: accounts[3].name, policyId: policies[5].id, description: "Missed January installment", status: "Needs Attention", flags: ["No Email - Call"], assignedTo: "Alec", dueDate: "2026-02-15", urgency: "Critical", created: "2026-02-10", amountDue: 1800, lastAction: "Called admin - no answer", lastActionDate: "2026-02-13", nextStep: "Call again, send certified letter if no response by 2/17", followUpDate: "2026-02-16", contactAttempts: [{ date: "2026-02-13", method: "Phone", notes: "No answer" }] },
    { id: uid(), type: "Endorsement", accountId: accounts[4].id, accountName: accounts[4].name, policyId: policies[7].id, description: "Add wind mitigation credit", status: "Uncontacted", flags: [], assignedTo: "Alec", dueDate: "2026-02-25", urgency: "Low", created: "2026-02-12", amountDue: 0, lastAction: "", lastActionDate: "", nextStep: "Submit wind mitigation docs to Tower Hill", followUpDate: "2026-02-20", contactAttempts: [] },
    { id: uid(), type: "2026 Renewal", accountId: accounts[4].id, accountName: accounts[4].name, policyId: policies[6].id, description: "Auto renewal - Allstate quota item", status: "Uncontacted", flags: [], assignedTo: "Alec", dueDate: "2026-03-15", urgency: "Medium", created: "2026-02-10", amountDue: 1560, lastAction: "", lastActionDate: "", nextStep: "Run renewal review in Gateway - check for better rates", followUpDate: "2026-02-28", contactAttempts: [] },
    { id: uid(), type: "Allstate Termination", accountId: accounts[2].id, accountName: accounts[2].name, policyId: policies[4].id, description: "Client requesting cancellation - shopping rates", status: "Called", flags: ["Requested Cancel"], assignedTo: "Alec", dueDate: "2026-02-20", urgency: "High", created: "2026-02-08", amountDue: 0, lastAction: "Offered rewrite to Ivantage carrier", lastActionDate: "2026-02-11", nextStep: "Waiting for client decision on rewrite vs cancel", followUpDate: "2026-02-16", contactAttempts: [{ date: "2026-02-11", method: "Phone", notes: "Offered rewrite option" }, { date: "2026-02-08", method: "Phone", notes: "Client called to cancel" }] },
    { id: uid(), type: "Commercial Renewal", accountId: accounts[3].id, accountName: accounts[3].name, policyId: policies[5].id, description: "GL/Property renewal - Bright Horizons", status: "Uncontacted", flags: [], assignedTo: "Alec", dueDate: "2026-04-01", urgency: "Medium", created: "2026-02-01", amountDue: 8500, lastAction: "", lastActionDate: "", nextStep: "Request loss runs and start remarketing at 90 days", followUpDate: "2026-03-01", contactAttempts: [] },
  ];

  const prospects = [
    { id: uid(), firstName: "Maria", lastName: "Gonzalez", business: "", phone: "954-555-0601", email: "mgonzalez@email.com", source: "Referral", sourceDetail: "Rodriguez family referral", lob: "Auto", estimatedPremium: 2200, stage: "Quoting", zip: "33316", created: "2026-01-20", xDate: "2026-03-15", currentCarrier: "GEICO" },
    { id: uid(), firstName: "James", lastName: "Wilson", business: "Wilson Landscaping", phone: "954-555-0702", email: "jwilson@wilsonlandscaping.com", source: "Web", sourceDetail: "Google search", lob: "Commercial GL", estimatedPremium: 4500, stage: "Contacted", zip: "33306", created: "2026-02-01", xDate: "2026-04-01", currentCarrier: "Progressive" },
    { id: uid(), firstName: "Ashley", lastName: "Park", business: "", phone: "954-555-0803", email: "apark@email.com", source: "Walk-in", sourceDetail: "", lob: "Homeowners", estimatedPremium: 3000, stage: "Proposal Sent", zip: "33301", created: "2026-01-28", xDate: "2026-02-28", currentCarrier: "Citizens" },
    { id: uid(), firstName: "David", lastName: "Nguyen", business: "", phone: "954-555-0904", email: "dnguyen@email.com", source: "Marketing", sourceDetail: "Facebook ad", lob: "Auto", estimatedPremium: 1800, stage: "New Lead", zip: "33304", created: "2026-02-10", xDate: "2026-05-01", currentCarrier: "State Farm" },
  ];

  const salesLog = [
    { id: uid(), date: "2026-02-01", accountName: "Garcia Family", lob: "Auto", premium: 1950, carrier: "Allstate", source: "Referral", saleType: "New Business", zip: "33316", itemCount: 2 },
    { id: uid(), date: "2026-02-03", accountName: "Kim Household", lob: "Auto", premium: 2100, carrier: "Allstate", source: "Web", saleType: "New Business", zip: "33301", itemCount: 1 },
    { id: uid(), date: "2026-02-05", accountName: "Kim Household", lob: "Homeowners", premium: 2800, carrier: "Citizens", source: "Cross-Sell", saleType: "Cross-Sell", zip: "33301", itemCount: 1 },
    { id: uid(), date: "2026-02-07", accountName: "Adams LLC", lob: "BOP", premium: 4200, carrier: "Hartford", source: "Referral", saleType: "New Business", zip: "33306", itemCount: 1 },
    { id: uid(), date: "2026-02-10", accountName: "Martinez Family", lob: "Auto", premium: 1750, carrier: "Allstate", source: "Walk-in", saleType: "New Business", zip: "33311", itemCount: 3 },
    { id: uid(), date: "2026-01-15", accountName: "Roberts Family", lob: "Auto", premium: 2300, carrier: "Allstate", source: "Web", saleType: "New Business", zip: "33304", itemCount: 2 },
    { id: uid(), date: "2026-01-20", accountName: "Patel Household", lob: "Homeowners", premium: 3400, carrier: "Tower Hill", source: "Referral", saleType: "New Business", zip: "33316", itemCount: 1 },
    { id: uid(), date: "2026-01-25", accountName: "Lee Family", lob: "Auto", premium: 1600, carrier: "Allstate", source: "Marketing", saleType: "New Business", zip: "33301", itemCount: 1 },
  ];

  const tasks = [
    { id: uid(), title: "Call Chen about Citizens renewal options", linkedType: "account", linkedId: accounts[1].id, linkedName: accounts[1].name, assignedTo: "Alec", dueDate: "2026-02-15", priority: "High", status: "Open", created: "2026-02-10" },
    { id: uid(), title: "Follow up on Gonzalez auto quote", linkedType: "prospect", linkedId: prospects[0].id, linkedName: "Maria Gonzalez", assignedTo: "Alec", dueDate: "2026-02-16", priority: "Medium", status: "Open", created: "2026-02-12" },
    { id: uid(), title: "Send Bright Horizons payment reminder", linkedType: "account", linkedId: accounts[3].id, linkedName: accounts[3].name, assignedTo: "Alec", dueDate: "2026-02-14", priority: "High", status: "In Progress", created: "2026-02-11" },
    { id: uid(), title: "Review Wilson Landscaping GL app", linkedType: "prospect", linkedId: prospects[1].id, linkedName: "James Wilson", assignedTo: "Alec", dueDate: "2026-02-17", priority: "Medium", status: "Open", created: "2026-02-13" },
    { id: uid(), title: "Submit wind mitigation docs for Thompson", linkedType: "account", linkedId: accounts[4].id, linkedName: accounts[4].name, assignedTo: "Alec", dueDate: "2026-02-20", priority: "Low", status: "Open", created: "2026-02-12" },
  ];

  const notes = [
    { id: uid(), accountId: accounts[0].id, text: "Teen son just got license - need to requote auto with youthful driver. Dad mentioned wanting to increase umbrella limits too.", createdBy: "Alec", createdAt: "2026-02-01T10:30:00" },
    { id: uid(), accountId: accounts[1].id, text: "Citizens renewal coming up. Client is anxious about rate increases. Promised to shop alternatives before renewal date.", createdBy: "Alec", createdAt: "2026-01-20T14:15:00" },
    { id: uid(), accountId: accounts[1].id, text: "Spoke with Mrs. Chen - she wants to compare Citizens vs Tower Hill vs TypTap. Pulling quotes this week.", createdBy: "Alec", createdAt: "2026-02-10T09:00:00" },
    { id: uid(), accountId: accounts[3].id, text: "Bright Horizons missed January payment. Called admin - they said check was mailed. Following up with carrier.", createdBy: "Alec", createdAt: "2026-02-10T11:00:00" },
    { id: uid(), accountId: accounts[4].id, text: "Thompson got a new wind mitigation report. Expect significant savings on Tower Hill home. Need to submit docs.", createdBy: "Alec", createdAt: "2026-02-12T16:00:00" },
  ];

  const activities = [
    { id: uid(), accountId: accounts[0].id, type: "note_added", description: "Note added", detail: "Teen son just got license - need to requote auto...", createdBy: "Alec", createdAt: "2026-02-01T10:30:00" },
    { id: uid(), accountId: accounts[0].id, type: "service_created", description: "Service item created: MidTermReview", detail: "Added teen driver - review auto coverage", createdBy: "Alec", createdAt: "2026-02-01T10:35:00" },
    { id: uid(), accountId: accounts[0].id, type: "contact_attempt", description: "Contact attempt: Email", detail: "Initial outreach", createdBy: "Alec", createdAt: "2026-02-03T09:00:00" },
    { id: uid(), accountId: accounts[0].id, type: "contact_attempt", description: "Contact attempt: Text", detail: "Requested updated driver info", createdBy: "Alec", createdAt: "2026-02-08T14:00:00" },
    { id: uid(), accountId: accounts[0].id, type: "contact_attempt", description: "Contact attempt: Phone", detail: "Left voicemail", createdBy: "Alec", createdAt: "2026-02-12T10:00:00" },
    { id: uid(), accountId: accounts[1].id, type: "note_added", description: "Note added", detail: "Citizens renewal coming up. Client is anxious about rate increases...", createdBy: "Alec", createdAt: "2026-01-20T14:15:00" },
    { id: uid(), accountId: accounts[1].id, type: "service_created", description: "Service item created: Renewal", detail: "Citizens Home renewal - review rates", createdBy: "Alec", createdAt: "2026-01-15T08:00:00" },
    { id: uid(), accountId: accounts[1].id, type: "contact_attempt", description: "Contact attempt: Email", detail: "Sent renewal comparison", createdBy: "Alec", createdAt: "2026-02-05T10:00:00" },
    { id: uid(), accountId: accounts[1].id, type: "contact_attempt", description: "Contact attempt: Phone", detail: "Discussed renewal options", createdBy: "Alec", createdAt: "2026-02-10T09:30:00" },
    { id: uid(), accountId: accounts[1].id, type: "note_added", description: "Note added", detail: "Spoke with Mrs. Chen - she wants to compare Citizens vs Tower Hill vs TypTap...", createdBy: "Alec", createdAt: "2026-02-10T09:00:00" },
    { id: uid(), accountId: accounts[1].id, type: "task_created", description: "Task created", detail: "Call Chen about Citizens renewal options", createdBy: "Alec", createdAt: "2026-02-10T09:05:00" },
    { id: uid(), accountId: accounts[3].id, type: "note_added", description: "Note added", detail: "Bright Horizons missed January payment...", createdBy: "Alec", createdAt: "2026-02-10T11:00:00" },
    { id: uid(), accountId: accounts[3].id, type: "service_created", description: "Service item created: Payment Issue", detail: "Missed January installment", createdBy: "Alec", createdAt: "2026-02-10T11:05:00" },
    { id: uid(), accountId: accounts[3].id, type: "contact_attempt", description: "Contact attempt: Phone", detail: "No answer", createdBy: "Alec", createdAt: "2026-02-13T15:00:00" },
    { id: uid(), accountId: accounts[3].id, type: "task_created", description: "Task created", detail: "Send Bright Horizons payment reminder", createdBy: "Alec", createdAt: "2026-02-11T08:00:00" },
    { id: uid(), accountId: accounts[4].id, type: "note_added", description: "Note added", detail: "Thompson got a new wind mitigation report...", createdBy: "Alec", createdAt: "2026-02-12T16:00:00" },
    { id: uid(), accountId: accounts[4].id, type: "task_created", description: "Task created", detail: "Submit wind mitigation docs for Thompson", createdBy: "Alec", createdAt: "2026-02-12T16:05:00" },
  ];

  return { accounts, policies, serviceItems, prospects, salesLog, tasks, notes, activities, certificates: [], households: [] };
}

function createEmptyData() {
  return { accounts: [], policies: [], serviceItems: [], prospects: [], salesLog: [], tasks: [], notes: [], activities: [], certificates: [], households: [] };
}

// ==================== STORAGE LAYER ====================
// Initialize storage: try Supabase first, fall back to localStorage polyfill
const _supabaseInitialized = !window.storage && initSupabaseStorage();
if (_supabaseInitialized) {
  console.log("[Sentinel] Using Supabase cloud storage");
}
// Polyfill window.storage for standalone HTML (uses localStorage fallback)
if (!window.storage) {
  window.storage = {
    async get(key) { const v = localStorage.getItem("ws_" + key); return v != null ? { key, value: v } : (() => { throw new Error("not found"); })(); },
    async set(key, value) { localStorage.setItem("ws_" + key, value); return { key, value }; },
    async delete(key) { localStorage.removeItem("ws_" + key); return { key, deleted: true }; },
    async list(prefix) { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("ws_" + (prefix || ""))) keys.push(k.slice(3)); } return { keys }; },
  };
}
const STORE_KEY = "sentinel-platform-data";

// Load with retry — distinguishes "no data" from "storage error"
async function loadData() {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await window.storage.get(STORE_KEY);
      if (result && result.value) {
        const parsed = JSON.parse(result.value);
        console.log(`[Sentinel] Data loaded from storage (${parsed.accounts?.length || 0} accounts, attempt ${attempt})`);
        return { data: parsed, status: "loaded" };
      }
      // Result returned but no value — treat as empty
      console.log("[Sentinel] Storage returned empty result — first use");
      return { data: null, status: "empty" };
    } catch (e) {
      console.warn(`[Sentinel] Storage read error (attempt ${attempt}/${MAX_RETRIES}): ${e.message}`);
      // On final attempt, probe storage health instead of guessing from error messages
      if (attempt === MAX_RETRIES) {
        try {
          const probeKey = "__sentinel_probe_" + Date.now();
          await window.storage.set(probeKey, "ok");
          const check = await window.storage.get(probeKey);
          await window.storage.delete(probeKey);
          if (check && check.value === "ok") {
            // Storage works fine — the data key just doesn't exist yet
            console.log("[Sentinel] Storage probe OK — key genuinely missing, first use");
            return { data: null, status: "empty" };
          }
        } catch (probeErr) {
          console.error("[Sentinel] Storage probe failed:", probeErr.message);
        }
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }
  // All retries AND probe failed — storage is truly broken
  console.error("[Sentinel] All storage attempts failed — loading in safe mode");
  return { data: null, status: "error" };
}

async function saveData(data) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) { console.error("[Sentinel] Save failed:", e); }
}

// Ensure existing data has new arrays (backward compat)
function migrateData(d) {
  if (!d.notes) d.notes = [];
  if (!d.activities) d.activities = [];
  if (!d.certificates) d.certificates = [];
  if (!d.households) d.households = [];
  // Normalize all date fields across data
  const normDates = (obj, fields) => { for (const f of fields) { if (obj[f]) obj[f] = normalizeDate(obj[f]); } return obj; };
  d.serviceItems = (d.serviceItems || []).map(si => {
    const normalized = normDates({
      contactAttempts: [], amountDue: 0, lastAction: "", lastActionDate: "", nextStep: "", followUpDate: "", notes: "", ballInCourt: false, flags: [], ...si
    }, ["dueDate", "lastActionDate", "followUpDate", "created"]);
    return migrateServiceStatus(normalized);
  });
  d.policies = (d.policies || []).map(p => normDates({
    documents: {}, notes: "", namedInsured: "", vehicleCount: (p.lob === "Auto" || p.lob === "Commercial Auto") ? (p.vehicleCount || 1) : 0, ...p
  }, ["effectiveDate", "expirationDate"]));
  d.salesLog = (d.salesLog || []).map(s => normDates({
    itemCount: s.itemCount || 1, ...s
  }, ["date"]));
  d.prospects = (d.prospects || []).map(p => normDates({
    xDate: "", currentCarrier: "", ...p
  }, ["xDate", "created"]));
  d.tasks = (d.tasks || []).map(t => normDates(t, ["dueDate", "created"]));

  d.accounts = (d.accounts || []).map(a => {
    if (!a.contacts) {
      a.contacts = [{ id: uid(), name: a.name || "", relationship: "Primary", phone: a.phone || "", email: a.email || "" }];
    }
    // Default new schema fields
    if (a.policyType === undefined) a.policyType = "other";
    if (a.lineOfBusiness === undefined) a.lineOfBusiness = a.type === "Commercial" ? "commercial" : "personal";
    if (a.carrier === undefined) a.carrier = "";
    if (a.autoItemCount === undefined) a.autoItemCount = 0;
    if (a.xDate === undefined) a.xDate = "";
    if (a.xDateSource === undefined) a.xDateSource = "";
    if (a.roofYear === undefined) a.roofYear = null;
    if (a.windMitigation === undefined) a.windMitigation = "unknown";
    if (a.constructionType === undefined) a.constructionType = "";
    if (a.propertyAddress === undefined) a.propertyAddress = "";
    if (a.pipelineStatus === undefined) a.pipelineStatus = "service_only";
    if (a.serviceLog === undefined) a.serviceLog = [];
    return a;
  });

  // Auto-create policies from service items that have carrier/policyNumber but no matching policy
  const existingPolicies = d.policies || [];
  const newPolicies = [];
  (d.serviceItems || []).forEach(si => {
    if (!si.accountId) return;
    const carrier = si.carrier || "";
    const polNum = si.policyNumber || "";
    if (!carrier && !polNum) return;
    // Check if policy already exists
    const exists = [...existingPolicies, ...newPolicies].find(p => {
      if (p.accountId !== si.accountId) return false;
      if (polNum && p.policyNumber && p.policyNumber.toLowerCase() === polNum.toLowerCase()) return true;
      if (!polNum && carrier && (p.carrier || "").toLowerCase() === carrier.toLowerCase() && !p.policyNumber) return true;
      return false;
    });
    if (!exists) {
      const pol = { id: uid(), accountId: si.accountId, accountName: si.accountName || "", carrier, lob: "", policyNumber: polNum, effectiveDate: "", expirationDate: "", premium: 0, status: "Active", paymentPlan: "", vehicleCount: 0, documents: {}, notes: "" };
      newPolicies.push(pol);
    }
  });
  if (newPolicies.length) {
    d.policies = [...existingPolicies, ...newPolicies];
    // Link service items to their new policies
    d.serviceItems = d.serviceItems.map(si => {
      if (si.policyId) return si;
      const carrier = si.carrier || "";
      const polNum = si.policyNumber || "";
      if (!carrier && !polNum) return si;
      const pol = d.policies.find(p => {
        if (p.accountId !== si.accountId) return false;
        if (polNum && p.policyNumber && p.policyNumber.toLowerCase() === polNum.toLowerCase()) return true;
        if (!polNum && carrier && (p.carrier || "").toLowerCase() === carrier.toLowerCase()) return true;
        return false;
      });
      return pol ? { ...si, policyId: pol.id } : si;
    });
  }

  // Auto-promote "Pending Renewal" policies whose effective date has arrived
  const todayMigrate = new Date().toISOString().split("T")[0];
  d.policies = d.policies.map(p => {
    if (p.status !== "Pending Renewal" || !p.effectiveDate || p.effectiveDate > todayMigrate) return p;
    console.log(`[Sentinel] Activating pending renewal: ${p.carrier} ${p.lob} #${p.policyNumber} (effective ${p.effectiveDate})`);
    return { ...p, status: "Active" };
  });

  // Auto-expire old policies that have been renewed and are past their expiration date
  d.policies = d.policies.map(p => {
    if (p.status !== "Active" || !p.expirationDate || p.expirationDate > todayMigrate) return p;
    // Policy is Active but past expiration — check if a newer term exists
    const hasRenewal = d.policies.some(other =>
      other.id !== p.id &&
      other.accountId === p.accountId &&
      (other.carrier || "").toLowerCase() === (p.carrier || "").toLowerCase() &&
      (other.lob || "").toLowerCase() === (p.lob || "").toLowerCase() &&
      (other.status === "Active" || other.status === "Pending Renewal") &&
      other.effectiveDate > p.effectiveDate
    );
    if (hasRenewal) {
      console.log(`[Sentinel] Auto-expiring renewed policy: ${p.carrier} ${p.lob} #${p.policyNumber} (expired ${p.expirationDate})`);
      return { ...p, status: "Expired" };
    }
    return p;
  });

  // Auto-close Allstate service items whose linked policy is Cancelled
  const allstateTypes = ["Allstate P-Cancel", "Allstate Cancel", "Allstate Termination"];
  d.serviceItems = (d.serviceItems || []).map(si => {
    if (!allstateTypes.includes(si.type) || si.status === "Done") return si;
    const pol = d.policies.find(p => p.id === si.policyId);
    if (pol && pol.status === "Cancelled") {
      console.log(`[Sentinel] Auto-closing ${si.type} for cancelled policy: ${pol.carrier} ${pol.lob} #${pol.policyNumber}`);
      return { ...si, status: "Done", lastAction: `Cancelled — ${pol.cancellationReason || ""}`, lastActionDate: todayMigrate };
    }
    return si;
  });

  return d;
}
function validatePolicyFields(fields) {
  const errors = [];
  // Premium: non-negative
  if (fields.premium !== undefined && fields.premium !== "") {
    const prem = Number(fields.premium);
    if (isNaN(prem) || prem < 0) errors.push("Premium must be a positive number");
    if (prem > 500000) errors.push("Premium seems unusually high (>$500,000). Please verify.");
  }
  // Dates: valid format and logical order
  if (fields.effectiveDate && fields.expirationDate) {
    const eff = fields.effectiveDate, exp = fields.expirationDate;
    if (eff && exp && eff >= exp) errors.push("Effective date must be before expiration date");
  }
  if (fields.effectiveDate) {
    const y = parseInt(fields.effectiveDate.slice(0, 4));
    if (y < 2000 || y > 2099) errors.push("Effective date year seems invalid");
  }
  if (fields.expirationDate) {
    const y = parseInt(fields.expirationDate.slice(0, 4));
    if (y < 2000 || y > 2099) errors.push("Expiration date year seems invalid");
  }
  // Agency fee: non-negative
  if (fields.agencyFee !== undefined && fields.agencyFee !== "") {
    const fee = Number(fields.agencyFee);
    if (isNaN(fee) || fee < 0) errors.push("Agency fee must be a positive number");
  }
  // Commission %: 0-100
  if (fields.commissionPct !== undefined && fields.commissionPct !== "") {
    const pct = Number(fields.commissionPct);
    if (isNaN(pct) || pct < 0 || pct > 100) errors.push("Commission % must be between 0 and 100");
  }
  // Vehicle count: non-negative integer
  if (fields.vehicleCount !== undefined && fields.vehicleCount !== "") {
    const vc = Number(fields.vehicleCount);
    if (isNaN(vc) || vc < 0 || !Number.isInteger(vc)) errors.push("Vehicle count must be a whole number ≥ 0");
  }
  return errors;
}

// Immutable activity log — auto-notates account timeline
// Safely activate a policy linked to a renewal SI — only if no newer term already exists
function safeActivateRenewalPolicy(updated, si) {
  if (!si || !si.policyId || !si.type || !si.type.toLowerCase().includes("renewal")) return updated;
  const pol = updated.policies.find(p => p.id === si.policyId);
  if (!pol) return updated;
  // Don't re-activate if a newer term already exists for this account/carrier/LOB
  const hasNewerTerm = updated.policies.some(other =>
    other.id !== pol.id && other.accountId === pol.accountId &&
    (other.carrier || "").toLowerCase() === (pol.carrier || "").toLowerCase() &&
    (other.lob || "").toLowerCase() === (pol.lob || "").toLowerCase() &&
    (other.status === "Active" || other.status === "Pending Renewal") &&
    other.effectiveDate > pol.effectiveDate
  );
  if (hasNewerTerm) return updated;
  // Don't re-activate if already Expired and past expiration
  if (pol.status === "Expired") return updated;
  return { ...updated, policies: updated.policies.map(p => p.id === si.policyId ? { ...p, status: "Active" } : p) };
}

function addActivity(data, accountId, type, description, detail, cfg) {
  if (!accountId) return data;
  const agentName = cfg ? cfg.agentName : (loadConfig().agentName || "Agent");
  const activity = { id: uid(), accountId, type, description, detail: (detail || "").slice(0, 200), createdBy: agentName, createdAt: new Date().toISOString() };
  return { ...data, activities: [...(data.activities || []), activity] };
}

const S = {
  app: { display: "flex", height: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", fontSize: 14, overflow: "hidden", position: "relative" },
  sidebar: { width: 220, minWidth: 220, background: COLORS.sidebar, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", padding: "16px 0" },
  sidebarMobile: { position: "fixed", top: 0, left: 0, bottom: 0, width: 260, background: COLORS.sidebar, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", padding: "16px 0", zIndex: 2000, boxShadow: "4px 0 24px rgba(0,0,0,0.5)", overflowY: "auto" },
  mobileHeader: { display: "flex", alignItems: "center", padding: "10px 16px", background: COLORS.sidebar, borderBottom: `1px solid ${COLORS.border}`, gap: 12 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1999 },
  navItem: (active) => ({ padding: "10px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: active ? 600 : 400, color: active ? COLORS.accentLight : COLORS.textDim, background: active ? `${COLORS.accent}15` : "transparent", borderLeft: active ? `3px solid ${COLORS.accent}` : "3px solid transparent", transition: "all 0.15s" }),
  main: { flex: 1, overflow: "auto", padding: "24px 28px" },
  mainMobile: { flex: 1, overflow: "auto", padding: "16px 12px" },
  pageTitle: { fontSize: 22, fontWeight: 700, marginBottom: 20, letterSpacing: "-0.3px" },
  grid: (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }),
  card: { background: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 18, transition: "border-color 0.15s" },
  statCard: { background: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: "16px 18px" },
  statVal: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" },
  statLabel: { fontSize: 12, color: COLORS.textDim, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" },
  badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}20`, color }),
  btn: (variant = "primary") => ({ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: variant === "primary" ? COLORS.accent : variant === "ghost" ? "transparent" : COLORS.card, color: variant === "primary" ? "#fff" : COLORS.textDim, transition: "all 0.15s" }),
  input: { padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, outline: "none", width: "100%" },
  select: { padding: "8px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, outline: "none" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13 },
  tdClickable: { padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, width: "90%", maxWidth: 520, maxHeight: "80vh", overflow: "auto" },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
  formGroup: { marginBottom: 14 },
  formLabel: { display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" },
  row: { display: "flex", gap: 12, alignItems: "center" },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" },
  emptyState: { textAlign: "center", padding: 40, color: COLORS.textDim },
  pill: (active) => ({ padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? COLORS.accent : COLORS.border}`, background: active ? `${COLORS.accent}20` : "transparent", color: active ? COLORS.accentLight : COLORS.textDim, cursor: "pointer", fontSize: 12, fontWeight: 500 }),
};

const urgencyColor = (u) => ({ Low: COLORS.info, Medium: COLORS.warning, High: "#f97316", Critical: COLORS.danger }[u] || COLORS.textDim);
const statusColor = (s) => {
  if (["Completed","Closed","Won","Paid","Done","Resolved","Active"].includes(s)) return COLORS.success;
  if (["Needs Attention","Action Required","Critical","Past Due","Lost","Cancelled","Expired"].includes(s)) return COLORS.danger;
  if (["Requested Cancel"].includes(s)) return "#f59e0b";
  if (["In Progress","Quoting","Proposal Sent","Negotiating","Called","Pending","Non-Renewal"].includes(s)) return COLORS.warning;
  if (["Pending Renewal"].includes(s)) return "#60a5fa";
  if (["Emailed","Awaiting Insured","Awaiting Carrier","Contacted","Waiting on Client","Waiting on Carrier"].includes(s)) return COLORS.info;
  return COLORS.textDim;
};

// ==================== MODAL COMPONENT ====================
function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={onClose} data-modal="true">
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={S.modalTitle}>{title}</div>
          <span style={{ cursor: "pointer", fontSize: 20, color: COLORS.textDim }} onClick={onClose}>✕</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return <div style={S.formGroup}><label style={S.formLabel}>{label}</label>{children}</div>;
}

// ==================== SERVICE LOG QUICK MODAL ====================
function ServiceLogModal({ data, setData, config, preselectedAccountId, onClose }) {
  const [accountId, setAccountId] = useState(preselectedAccountId || "");
  const [type, setType] = useState("general");
  const [note, setNote] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const noteRef = useRef(null);
  const searchRef = useRef(null);

  // Focus note if account pre-filled, otherwise focus search
  useEffect(() => {
    if (preselectedAccountId && noteRef.current) noteRef.current.focus();
    else if (!preselectedAccountId && searchRef.current) searchRef.current.focus();
  }, [preselectedAccountId]);

  const selectedAccount = accountId ? data.accounts.find(a => a.id === accountId) : null;

  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return data.accounts.slice(0, 8);
    const q = accountSearch.toLowerCase();
    return data.accounts.filter(a =>
      (a.name || "").toLowerCase().includes(q) || (a.phone || "").includes(q) || (a.email || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [accountSearch, data.accounts]);

  const handleSave = useCallback(() => {
    if (!accountId || !note.trim()) return;
    const entry = { date: new Date().toISOString(), type, note: note.trim(), author: config.agentName || "Agent" };
    const acct = data.accounts.find(a => a.id === accountId);
    if (!acct) return;
    const newLog = [...(acct.serviceLog || []), entry];
    let updated = { ...data, accounts: data.accounts.map(a => a.id === accountId ? { ...a, serviceLog: newLog } : a) };
    updated = addActivity(updated, accountId, "service_created", `Service log: ${SERVICE_LOG_TYPE_LABELS[type] || type}`, note.trim());
    setData(updated);
    onClose();
  }, [accountId, type, note, data, config.agentName, setData, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && accountId && note.trim()) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }, [handleSave, onClose, accountId, note]);

  return (
    <div style={S.overlay} onClick={onClose} data-modal="true" onKeyDown={handleKeyDown}>
      <div style={{ ...S.modal, maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Log Service Update</div>
          <span style={{ cursor: "pointer", fontSize: 18, color: COLORS.textDim, lineHeight: 1 }} onClick={onClose}>✕</span>
        </div>

        {/* Client selector */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>Client</div>
          {selectedAccount ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: `${COLORS.accent}10`, borderRadius: 6, border: `1px solid ${COLORS.accent}30` }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{selectedAccount.name}</span>
              {!preselectedAccountId && <span style={{ cursor: "pointer", fontSize: 14, color: COLORS.textDim }} onClick={() => { setAccountId(""); setAccountSearch(""); setTimeout(() => searchRef.current?.focus(), 50); }}>✕</span>}
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                ref={searchRef}
                style={{ ...S.input, fontSize: 13, padding: "7px 10px" }}
                placeholder="Search clients..."
                value={accountSearch}
                onChange={e => { setAccountSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && filteredAccounts.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, maxHeight: 200, overflowY: "auto", marginTop: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
                  {filteredAccounts.map(a => (
                    <div key={a.id} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, borderBottom: `1px solid ${COLORS.border}20` }}
                      onMouseDown={() => { setAccountId(a.id); setAccountSearch(""); setShowDropdown(false); setTimeout(() => noteRef.current?.focus(), 50); }}
                      onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: COLORS.textDim }}>{a.phone}{a.phone && a.email ? " · " : ""}{a.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Type */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>Type</div>
          <select style={{ ...S.select, width: "100%", fontSize: 13, padding: "7px 10px" }} value={type} onChange={e => setType(e.target.value)}>
            {SERVICE_LOG_TYPES.map(t => <option key={t} value={t}>{SERVICE_LOG_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>Note</div>
          <textarea
            ref={noteRef}
            style={{ ...S.input, minHeight: 80, resize: "vertical", fontSize: 13, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What happened..."
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>Ctrl+Enter to save</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn("ghost")} onClick={onClose}>Cancel</button>
            <button style={{ ...S.btn(), opacity: accountId && note.trim() ? 1 : 0.5 }} onClick={handleSave} disabled={!accountId || !note.trim()}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== COMMUNICATION TEMPLATES ====================
function TemplateModal({ onClose, accountName, policy, data, config }) {
  const templates = useMemo(() => getTemplates(config || loadConfig()), [config]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [composedMessage, setComposedMessage] = useState("");
  const [composedSubject, setComposedSubject] = useState("");
  const [copied, setCopied] = useState(false);

  const fillTemplate = (tpl) => {
    let body = tpl.body;
    let subject = tpl.subject || "";
    const cfg = config || loadConfig();
    const replacements = {
      "{name}": accountName || "Client",
      "{lob}": policy ? policy.lob : "[LOB]",
      "{carrier}": policy ? policy.carrier : "[Carrier]",
      "{policyNumber}": policy ? policy.policyNumber : "[Policy #]",
      "{expirationDate}": policy ? fmtShort(policy.expirationDate) : "[Date]",
      "{dueDate}": policy?.dueDate ? fmtShort(policy.dueDate) : "[Due Date]",
      "{paymentLink}": policy?.paymentLink || "[Payment Link]",
      "{agentPhone}": cfg.agentPhone || "[Phone]",
    };
    Object.entries(replacements).forEach(([key, val]) => {
      body = body.replaceAll(key, val);
      subject = subject.replaceAll(key, val);
    });
    setComposedMessage(body);
    setComposedSubject(subject);
    setSelectedTemplate(tpl);
  };

  const copyToClipboard = () => {
    const text = composedSubject ? `Subject: ${composedSubject}\n\n${composedMessage}` : composedMessage;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
    document.body.removeChild(ta);
  };

  return (
    <Modal title="📋 Communication Templates" onClose={onClose}>
      {!selectedTemplate ? (
        <div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>Select a template to auto-fill with client info</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {templates.map(tpl => (
              <div
                key={tpl.id}
                style={{ padding: "12px 14px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, cursor: "pointer", transition: "all 0.15s" }}
                onClick={() => fillTemplate(tpl)}
                onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{tpl.label}</div>
                  <span style={S.badge(tpl.channel === "Email" ? COLORS.info : COLORS.success)}>{tpl.channel}</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{tpl.body.substring(0, 80)}...</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button style={{ ...S.btn("ghost"), marginBottom: 12, padding: "4px 8px", fontSize: 12 }} onClick={() => setSelectedTemplate(null)}>← Back to templates</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>{selectedTemplate.label}</div>
            <span style={S.badge(selectedTemplate.channel === "Email" ? COLORS.info : COLORS.success)}>{selectedTemplate.channel}</span>
          </div>
          {composedSubject && (
            <FormField label="Subject">
              <input style={S.input} value={composedSubject} onChange={e => setComposedSubject(e.target.value)} />
            </FormField>
          )}
          <FormField label="Message">
            <textarea
              style={{ ...S.input, minHeight: 200, resize: "vertical", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}
              value={composedMessage}
              onChange={e => setComposedMessage(e.target.value)}
            />
          </FormField>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button style={S.btn()} onClick={copyToClipboard}>
              {copied ? "✓ Copied!" : "Copy to Clipboard"}
            </button>
            <button style={S.btn("ghost")} onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ==================== DASHBOARD ====================
// ==================== MORNING BRIEFING ====================
function MorningBriefing({ data, setPage, nav, config }) {
  const [search, setSearch] = useState("");
  const { accounts, policies, serviceItems, prospects, salesLog, tasks } = data;
  const todayStr = today();
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const quotaTarget = config.quotaTarget || 13;

  // Quota (Allstate Roadside does NOT count toward quota)
  const monthlySales = salesLog.filter(s => { const d = new Date(s.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });
  const allstateAutoItems = monthlySales.filter(s => s.carrier === "Allstate" && s.lob === "Auto" && s.saleType !== "Rewrite").reduce((sum, s) => sum + (s.itemCount || 1), 0);
  const quotaRemaining = Math.max(0, quotaTarget - allstateAutoItems);
  const daysLeftInMonth = new Date(thisYear, thisMonth + 1, 0).getDate() - new Date().getDate();

  // Follow-ups due today or overdue
  const activeService = serviceItems.filter(s => s.status !== "Done");
  const _bMatch = (name) => !search || (name || "").toLowerCase().includes(search.toLowerCase());
  const followUpsDue = activeService.filter(si => _bMatch(si.accountName) && si.followUpDate && si.followUpDate <= todayStr)
    .sort((a, b) => (a.urgency === "Critical" ? -1 : b.urgency === "Critical" ? 1 : (a.followUpDate || "z").localeCompare(b.followUpDate || "z")));

  // Overdue service items
  const overdueItems = activeService.filter(s => _bMatch(s.accountName) && s.dueDate && s.dueDate < todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Due today
  const dueTodayItems = activeService.filter(s => _bMatch(s.accountName) && s.dueDate === todayStr);

  // Tasks due today or overdue
  const activeTasks = tasks.filter(t => t.status !== "Completed" && t.status !== "Done" && _bMatch(t.linkedName));
  const tasksDueToday = activeTasks.filter(t => t.dueDate === todayStr);
  const tasksOverdue = activeTasks.filter(t => t.dueDate && t.dueDate < todayStr);

  // Policies expiring within 7 days
  const expiringThisWeek = policies.filter(p => {
    if (p.status !== "Active" || !p.expirationDate) return false;
    const diff = daysBetween(todayStr, p.expirationDate);
    return diff >= 0 && diff <= 7;
  });

  // Pipeline deals going cold (no activity in 7+ days, not Won/Lost)
  const coldProspects = prospects.filter(p => {
    if (["Won","Lost"].includes(p.stage)) return false;
    const daysSince = daysBetween(p.created, todayStr);
    return daysSince > 7;
  });

  // X-Dates expiring within 30 days
  const hotXDates = prospects.filter(p => {
    if (["Won","Lost"].includes(p.stage) || !p.xDate) return false;
    const diff = daysBetween(todayStr, p.xDate);
    return diff >= 0 && diff <= 30;
  }).sort((a, b) => (a.xDate || "z").localeCompare(b.xDate || "z"));

  // Stale service items (no action in 7+ days, not completed, not waiting)
  const staleItems = activeService.filter(si => {
    if ((si.flags || []).some(f => ["Auto Pay","Don't Send Reminders"].includes(f))) return false;
    if (si.ballInCourt) return false;
    if (!_bMatch(si.accountName)) return false;
    const lastDate = si.lastActionDate || si.created;
    if (!lastDate) return true; // no date at all = stale
    return -daysBetween(todayStr, lastDate) >= 7;
  }).sort((a, b) => {
    const aAge = -daysBetween(todayStr, a.lastActionDate || a.created || todayStr);
    const bAge = -daysBetween(todayStr, b.lastActionDate || b.created || todayStr);
    return bAge - aAge;
  });

  // Items with no follow-up date (falling through cracks)
  const noFollowUp = activeService.filter(si => {
    if (si.ballInCourt) return false;
    if ((si.flags || []).some(f => ["Auto Pay","Don't Send Reminders"].includes(f))) return false;
    return !si.followUpDate && _bMatch(si.accountName);
  });

  // Today's activity
  const todayActivities = (data.activities || []).filter(a => a.createdAt && a.createdAt.startsWith(todayStr) && _bMatch((accounts.find(ac => ac.id === a.accountId) || {}).name)).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const completedToday = serviceItems.filter(s => s.status === "Done" && s.lastActionDate === todayStr && _bMatch(s.accountName));
  const todayServiceLogs = accounts.flatMap(a => (a.serviceLog || []).filter(l => l.date && l.date.startsWith(todayStr) && _bMatch(a.name)).map(l => ({ ...l, accountName: a.name })));

  const copyTodayActivity = () => {
    const lines = ["=== Today's Activity (" + todayStr + ") ===", ""];
    if (completedToday.length) {
      lines.push("-- Service Items Completed --");
      completedToday.forEach(si => lines.push(`  ${si.accountName} | ${si.type} | ${si.description}`));
      lines.push("");
    }
    if (todayActivities.length) {
      lines.push("-- Activity Log --");
      todayActivities.forEach(a => {
        const acct = accounts.find(ac => ac.id === a.accountId);
        lines.push(`  ${a.createdAt.slice(11,16)} | ${(acct || {}).name || "Unknown"} | ${a.type} | ${a.description}${a.detail ? " — " + a.detail : ""}`);
      });
      lines.push("");
    }
    if (todayServiceLogs.length) {
      lines.push("-- Service Log Entries --");
      todayServiceLogs.forEach(l => lines.push(`  ${l.accountName} | ${l.type || "Note"} | ${l.note || ""}`));
      lines.push("");
    }
    if (!completedToday.length && !todayActivities.length && !todayServiceLogs.length) {
      lines.push("No activity recorded today.");
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  };

  // Yesterday's completions
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const completedYesterday = serviceItems.filter(s =>
    s.status === "Done" && s.lastActionDate === yesterday && _bMatch(s.accountName)
  );

  const urgencyIcon = (u) => u === "Critical" ? "🔴" : u === "High" ? "🟠" : u === "Medium" ? "🟡" : "⚪";
  const totalActionItems = followUpsDue.length + overdueItems.length + dueTodayItems.length + tasksDueToday.length + tasksOverdue.length;
  const totalAttention = totalActionItems + staleItems.length + noFollowUp.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={S.pageTitle}>☀ Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}, {config.agentName}</div>
          <div style={{ color: COLORS.textDim, fontSize: 13, marginTop: -12 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 220 }} placeholder="Filter by client..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={{ ...S.btn("ghost"), fontSize: 12, color: "#60a5fa" }} onClick={() => setPage("allstate")}>★ Allstate</button>
          <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={() => setPage("dashboard")}>◉ Dashboard</button>
        </div>
      </div>

      {/* Priority Score */}
      <div style={{ ...S.card, marginBottom: 20, background: totalActionItems > 10 ? `${COLORS.danger}10` : totalActionItems > 5 ? `${COLORS.warning}10` : `${COLORS.success}10`, border: `1px solid ${totalActionItems > 10 ? COLORS.danger : totalActionItems > 5 ? COLORS.warning : COLORS.success}30` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Today's Action Items: {totalActionItems}</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>
              {followUpsDue.length} follow-ups · {overdueItems.length} overdue · {dueTodayItems.length} due today · {tasksDueToday.length + tasksOverdue.length} tasks
            </div>
            {(staleItems.length > 0 || noFollowUp.length > 0) && (
              <div style={{ fontSize: 12, color: COLORS.warning, marginTop: 2 }}>
                {staleItems.length > 0 ? `${staleItems.length} stale (7d+ no action)` : ""}
                {staleItems.length > 0 && noFollowUp.length > 0 ? " · " : ""}
                {noFollowUp.length > 0 ? `${noFollowUp.length} missing follow-up date` : ""}
              </div>
            )}
            {completedYesterday.length > 0 && (
              <div style={{ fontSize: 12, color: COLORS.success, marginTop: 2 }}>✓ {completedYesterday.length} completed yesterday</div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: allstateAutoItems >= quotaTarget ? COLORS.success : COLORS.warning }}>{allstateAutoItems}<span style={{ fontSize: 16, color: COLORS.textDim }}>/{quotaTarget}</span></div>
            <div style={{ fontSize: 11, color: COLORS.textDim }}>{quotaRemaining > 0 ? `${quotaRemaining} items needed · ${daysLeftInMonth}d left` : "Quota met ✓"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Follow-ups Due */}
          {followUpsDue.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>📞 Follow-Ups Due ({followUpsDue.length})</span></div>
              {followUpsDue.map(si => {
                const daysOver = daysBetween(si.followUpDate, todayStr);
                return (
                  <div key={si.id} style={{ padding: "10px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{urgencyIcon(si.urgency)}</span>
                        <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 22 }}>{si.description}</div>
                      {si.nextStep && <div style={{ fontSize: 11, color: COLORS.accent, marginLeft: 22 }}>→ {si.nextStep}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={S.badge(si.followUpDate < todayStr ? COLORS.danger : COLORS.warning)}>{daysOver > 0 ? `${daysOver}d overdue` : "Today"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Overdue Service Items */}
          {overdueItems.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>🚨 Overdue ({overdueItems.length})</span></div>
              {overdueItems.map(si => (
                <div key={si.id} style={{ padding: "10px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{urgencyIcon(si.urgency)}</span>
                      <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                      <span style={{ ...S.badge(TXN_COLORS[si.type] || COLORS.textDim), fontSize: 10 }}>{si.type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 22 }}>{si.description}</div>
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.danger, fontWeight: 600 }}>{Math.abs(daysBetween(todayStr, si.dueDate))}d overdue</span>
                </div>
              ))}
            </div>
          )}

          {/* Tasks */}
          {(tasksDueToday.length > 0 || tasksOverdue.length > 0) && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>☑ Tasks ({tasksDueToday.length + tasksOverdue.length})</span></div>
              {[...tasksOverdue, ...tasksDueToday].map(t => (
                <div key={t.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{t.linkedName}</div>
                  </div>
                  <span style={S.badge(t.dueDate < todayStr ? COLORS.danger : COLORS.warning)}>{t.dueDate < todayStr ? `${Math.abs(daysBetween(todayStr, t.dueDate))}d overdue` : "Today"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stale Items — no action in 7+ days */}
          {staleItems.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>🕸 Stale — No Action 7d+ ({staleItems.length})</span></div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>These items haven't been touched recently — they may be slipping</div>
              {staleItems.slice(0, 8).map(si => {
                const age = Math.max(0, -daysBetween(todayStr, si.lastActionDate || si.created || todayStr));
                return (
                  <div key={si.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                        <span style={{ ...S.badge(TXN_COLORS[si.type] || COLORS.textDim), fontSize: 10 }}>{si.type}</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 0 }}>{si.description}</div>
                      {si.lastAction && <div style={{ fontSize: 10, color: COLORS.textMuted }}>Last: {si.lastAction}</div>}
                    </div>
                    <span style={S.badge(age >= 14 ? COLORS.danger : COLORS.warning)}>{age}d idle</span>
                  </div>
                );
              })}
              {staleItems.length > 8 && <div style={{ fontSize: 11, color: COLORS.textMuted, padding: "8px 0" }}>+ {staleItems.length - 8} more stale items</div>}
            </div>
          )}

          {/* No Follow-Up Date Set */}
          {noFollowUp.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>📌 No Follow-Up Date ({noFollowUp.length})</span></div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Active items with no follow-up scheduled — set dates to track progress</div>
              {noFollowUp.slice(0, 6).map(si => (
                <div key={si.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{si.type} — {si.description}</div>
                  </div>
                  <span style={S.badge("#a855f7")}>No F/U</span>
                </div>
              ))}
              {noFollowUp.length > 6 && <div style={{ fontSize: 11, color: COLORS.textMuted, padding: "8px 0" }}>+ {noFollowUp.length - 6} more</div>}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Due Today */}
          {dueTodayItems.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>📋 Due Today ({dueTodayItems.length})</span></div>
              {dueTodayItems.map(si => (
                <div key={si.id} style={{ padding: "10px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{urgencyIcon(si.urgency)}</span>
                      <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 22 }}>{si.description}</div>
                  </div>
                  <span style={{ ...S.badge(TXN_COLORS[si.type] || COLORS.textDim), fontSize: 10 }}>{si.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Policies Expiring This Week */}
          {expiringThisWeek.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>⏰ Expiring This Week ({expiringThisWeek.length})</span></div>
              {expiringThisWeek.map(p => (
                <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <AccountLink accountId={p.accountId} name={p.accountName} nav={nav} />
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>{p.carrier} {p.lob} · ${(p.premium || 0).toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.danger, fontWeight: 600 }}>{daysBetween(todayStr, p.expirationDate)}d</span>
                </div>
              ))}
            </div>
          )}

          {/* Hot X-Dates */}
          {hotXDates.length > 0 && (
            <div style={{ ...S.card, border: `1px solid ${COLORS.success}20` }}>
              <div style={S.sectionTitle}><span>🎯 Hot X-Dates ({hotXDates.length})</span></div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Prospect policies expiring within 30 days — time to quote aggressively</div>
              {hotXDates.map(p => {
                const daysToX = daysBetween(todayStr, p.xDate);
                return (
                  <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}{p.business ? ` — ${p.business}` : ""}</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim }}>{p.lob} · ~${(p.estimatedPremium || 0).toLocaleString()} · from {p.currentCarrier || "?"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={S.badge(daysToX <= 7 ? COLORS.danger : daysToX <= 14 ? COLORS.warning : COLORS.success)}>{daysToX}d to X-Date</span>
                      <div style={{ fontSize: 10, color: COLORS.textDim }}>{fmtShort(p.xDate)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cold Pipeline Deals */}
          {coldProspects.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}><span>🧊 Going Cold ({coldProspects.length})</span></div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Pipeline prospects with no update in 7+ days</div>
              {coldProspects.slice(0, 6).map(p => (
                <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{p.firstName} {p.lastName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{p.lob} · {p.stage} · ~${(p.estimatedPremium || 0).toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>{daysBetween(p.created, todayStr)}d old</span>
                </div>
              ))}
            </div>
          )}

          {/* Yesterday's Wins */}
          {completedYesterday.length > 0 && (
            <div style={{ ...S.card, border: `1px solid ${COLORS.success}20` }}>
              <div style={S.sectionTitle}><span>🏆 Completed Yesterday ({completedYesterday.length})</span></div>
              {completedYesterday.map(si => (
                <div key={si.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{si.type} — {si.description}</div>
                  </div>
                  <span style={{ fontSize: 11, color: COLORS.success, fontWeight: 600 }}>✓ Done</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's Activity */}
      {(todayActivities.length > 0 || completedToday.length > 0 || todayServiceLogs.length > 0) && (
        <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.accent}20` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={S.sectionTitle}><span>Today's Activity ({todayActivities.length + completedToday.length + todayServiceLogs.length})</span></div>
            <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={copyTodayActivity}>Copy to Clipboard</button>
          </div>
          {completedToday.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.success, marginBottom: 6 }}>Service Items Completed ({completedToday.length})</div>
              {completedToday.map(si => (
                <div key={si.id} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{si.type} — {si.description}</div>
                  </div>
                  <span style={{ fontSize: 11, color: COLORS.success }}>Done</span>
                </div>
              ))}
            </div>
          )}
          {todayActivities.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent, marginBottom: 6 }}>Activity Log ({todayActivities.length})</div>
              {todayActivities.map(a => {
                const acct = accounts.find(ac => ac.id === a.accountId);
                return (
                  <div key={a.id} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{(acct || {}).name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.type.replace(/_/g, " ")} — {a.description}{a.detail ? ` (${a.detail})` : ""}</div>
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>{a.createdAt.slice(11, 16)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {todayServiceLogs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.warning, marginBottom: 6 }}>Service Log Entries ({todayServiceLogs.length})</div>
              {todayServiceLogs.map((l, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08` }}>
                  <div style={{ fontSize: 13 }}>{l.accountName}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{l.type || "Note"} — {l.note || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {totalAttention === 0 && expiringThisWeek.length === 0 && hotXDates.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>You're all caught up!</div>
          <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 4 }}>No urgent items today. Time to prospect.</div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ data, setData, nav, config }) {
  const [search, setSearch] = useState("");
  const { accounts, policies, serviceItems, prospects, salesLog, tasks } = data;
  const todayStr = today();
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const monthlySales = salesLog.filter(s => { const d = new Date(s.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; });
  // Quota = sum of itemCount for Allstate Auto sales this month (items = vehicles, not policies; Allstate Roadside excluded)
  const monthlyAutoAllstateItems = monthlySales.filter(s => s.carrier === "Allstate" && s.lob === "Auto" && s.saleType !== "Rewrite").reduce((sum, s) => sum + (s.itemCount || 1), 0);
  const monthlyPremium = monthlySales.reduce((sum, s) => sum + (s.premium || 0), 0);

  // Service board metrics (matching Sheets dashboard)
  const activeServiceItems = serviceItems.filter(s => s.status !== "Done");
  const overdueItems = activeServiceItems.filter(s => s.dueDate && s.dueDate < todayStr);
  const dueTodayItems = activeServiceItems.filter(s => s.dueDate === todayStr);
  const dueThisWeek = activeServiceItems.filter(s => {
    if (!s.dueDate) return false;
    const diff = daysBetween(todayStr, s.dueDate);
    return diff >= 0 && diff <= 7;
  });
  const waitingOnOthers = activeServiceItems.filter(s => s.ballInCourt);
  const flaggedItems = activeServiceItems.filter(s => (s.flags || []).length > 0);
  const completedThisMonth = serviceItems.filter(s => s.status === "Done" && s.lastActionDate && new Date(s.lastActionDate).getMonth() === thisMonth);
  const totalAmountDue = activeServiceItems.reduce((sum, s) => sum + (Number(s.amountDue) || 0), 0);

  // Search helper for Dashboard lists
  const _matchSearch = (name) => !search || (name || "").toLowerCase().includes(search.toLowerCase());

  // Follow-ups due — items with followUpDate <= today and not completed
  const followUpsDue = activeServiceItems.filter(si => _matchSearch(si.accountName) && si.followUpDate && si.followUpDate <= todayStr)
    .sort((a, b) => (a.followUpDate || "z").localeCompare(b.followUpDate || "z"));

  // Tasks
  const openTasks = tasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled");
  const overdueTasks = openTasks.filter(t => t.dueDate && t.dueDate < todayStr);

  // Pipeline
  const activePipeline = prospects.filter(p => !["Won","Lost"].includes(p.stage));
  const pipelineValue = activePipeline.reduce((s, p) => s + (p.estimatedPremium || 0), 0);

  // Today's work items — the "open the platform, here's what to do" view
  const todaysWork = [
    ...overdueItems.filter(si => _matchSearch(si.accountName)).map(si => ({ ...si, _reason: "overdue", _sort: 0 })),
    ...dueTodayItems.filter(si => _matchSearch(si.accountName)).map(si => ({ ...si, _reason: "due_today", _sort: 1 })),
    ...activeServiceItems.filter(si => _matchSearch(si.accountName) && si.dueDate && daysBetween(todayStr, si.dueDate) > 0 && daysBetween(todayStr, si.dueDate) <= 3).map(si => ({ ...si, _reason: "due_soon", _sort: 2 })),
  ].sort((a, b) => a._sort - b._sort || (a.dueDate || "z").localeCompare(b.dueDate || "z"));

  const quotaTarget = config.quotaTarget || 13;
  const quotaPercent = Math.min(100, (monthlyAutoAllstateItems / quotaTarget) * 100);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Dashboard</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Filter by client..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ fontSize: 13, color: COLORS.textDim }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
      </div>

      {/* Row 1: Allstate Quota + Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {/* Quota Tracker — the big one */}
        <div style={{ ...S.statCard, gridColumn: "span 1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>ALLSTATE AUTO QUOTA</div>
            <span style={{ fontSize: 11, color: monthlyAutoAllstateItems >= quotaTarget ? COLORS.success : COLORS.textDim }}>{new Date().toLocaleDateString("en-US", { month: "short" })}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "8px 0 6px" }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: monthlyAutoAllstateItems >= quotaTarget ? COLORS.success : monthlyAutoAllstateItems >= 9 ? COLORS.warning : COLORS.danger }}>{monthlyAutoAllstateItems}</span>
            <span style={{ fontSize: 16, color: COLORS.textDim }}>/{quotaTarget}</span>
          </div>
          <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${quotaPercent}%`, background: monthlyAutoAllstateItems >= quotaTarget ? COLORS.success : monthlyAutoAllstateItems >= 9 ? COLORS.warning : COLORS.accent, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{monthlyAutoAllstateItems >= quotaTarget ? "Quota met ✓" : `${quotaTarget - monthlyAutoAllstateItems} items needed`}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Items (vehicles), not policies</div>
        </div>

        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>SALES THIS MONTH</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{monthlySales.length}</div>
          <div style={{ fontSize: 13, color: COLORS.success, marginTop: 2 }}>${monthlyPremium.toLocaleString()}</div>
        </div>

        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>PIPELINE VALUE</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: COLORS.accentLight }}>${pipelineValue.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>{activePipeline.length} prospect{activePipeline.length !== 1 ? "s" : ""}</div>
        </div>

        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>TOTAL AMOUNT DUE</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: totalAmountDue > 0 ? COLORS.warning : COLORS.text }}>${totalAmountDue.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>{activeServiceItems.length} open items</div>
        </div>
      </div>

      {/* Row 2: Service Board Summary Cards (matching Sheets dashboard) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginTop: 12 }}>
        {[
          { label: "Overdue", val: overdueItems.length, color: overdueItems.length > 0 ? COLORS.danger : COLORS.success },
          { label: "Due Today", val: dueTodayItems.length, color: dueTodayItems.length > 0 ? "#ea580c" : COLORS.success },
          { label: "Due This Week", val: dueThisWeek.length, color: COLORS.warning },
          { label: "Follow-Ups Due", val: followUpsDue.length, color: followUpsDue.length > 0 ? "#c084fc" : COLORS.success },
          { label: "Follow-Ups (7d)", val: activeServiceItems.filter(si => si.followUpDate && si.followUpDate > todayStr && daysBetween(todayStr, si.followUpDate) <= 7).length, color: "#818cf8" },
          { label: "Ball in Their Court", val: waitingOnOthers.length, color: "#fbbf24" },
          { label: "Flagged Items", val: flaggedItems.length, color: "#60a5fa" },
          { label: "Completed This Mo.", val: completedThisMonth.length, color: COLORS.success },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ ...S.card, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: COLORS.textDim, fontWeight: 600, letterSpacing: "0.3px", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Row 3: Today's Work + Tasks */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16, marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}>
            <span>Today's Work</span>
            <span style={{ fontSize: 12, color: COLORS.textDim }}>{todaysWork.length} items</span>
          </div>
          {todaysWork.length > 0 ? todaysWork.slice(0, 8).map(si => {
            const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
            return (
              <div key={si.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 28, borderRadius: 2, background: txnColor, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                      <span style={{ color: COLORS.textDim }}> — {si.description}</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                      <span style={{ color: txnColor }}>{si.type}</span>
                      {si.nextStep && <span> · {si.nextStep.substring(0, 50)}{si.nextStep.length > 50 ? "..." : ""}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: si._reason === "overdue" ? `${COLORS.danger}40` : si._reason === "due_today" ? "#ea580c40" : `${COLORS.warning}15`,
                    color: si._reason === "overdue" ? "#000" : si._reason === "due_today" ? "#000" : COLORS.warning,
                  }}>
                    {si._reason === "overdue" ? "OVERDUE" : si._reason === "due_today" ? "TODAY" : `${daysBetween(todayStr, si.dueDate)}d`}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>{fmtShort(si.dueDate)}</div>
                </div>
              </div>
            );
          }) : <div style={S.emptyState}>Nothing urgent — you're caught up 🎉</div>}
          {todaysWork.length > 8 && <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center", padding: 8 }}>+{todaysWork.length - 8} more</div>}
        </div>

        <div style={S.card}>
          <div style={S.sectionTitle}>
            <span>Tasks</span>
            <span style={S.badge(overdueTasks.length > 0 ? COLORS.danger : COLORS.success)}>{overdueTasks.length} overdue</span>
          </div>
          {openTasks.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).slice(0, 8).map(t => (
            <div key={t.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{t.linkedType === "account" ? <AccountLink accountId={t.linkedId} name={t.linkedName} nav={nav} /> : (t.linkedName || "")}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={S.badge(urgencyColor(t.priority))}>{t.priority}</span>
                <span style={{ fontSize: 11, color: t.dueDate < todayStr ? COLORS.danger : COLORS.textDim, fontWeight: t.dueDate < todayStr ? 600 : 400 }}>{fmtShort(t.dueDate)}</span>
              </div>
            </div>
          ))}
          {openTasks.length === 0 && <div style={S.emptyState}>No open tasks</div>}
        </div>
      </div>

      {/* Row 3.5: Follow-Ups Due + Upcoming */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.sectionTitle}>
          <span>⏰ Follow-Ups</span>
          <div style={{ display: "flex", gap: 8 }}>
            {followUpsDue.length > 0 && <span style={S.badge(COLORS.danger)}>{followUpsDue.length} overdue/today</span>}
            {(() => {
              const upcoming = activeServiceItems.filter(si => _matchSearch(si.accountName) && si.followUpDate && si.followUpDate > todayStr && daysBetween(todayStr, si.followUpDate) <= 7);
              return upcoming.length > 0 ? <span style={S.badge(COLORS.info)}>{upcoming.length} this week</span> : null;
            })()}
          </div>
        </div>
        {(() => {
          const upcoming = activeServiceItems.filter(si => _matchSearch(si.accountName) && si.followUpDate && si.followUpDate > todayStr && daysBetween(todayStr, si.followUpDate) <= 7)
            .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
          const allFollowUps = [...followUpsDue, ...upcoming];
          if (allFollowUps.length === 0) return <div style={{ ...S.emptyState, padding: 20 }}>No follow-ups due or upcoming this week — you're clear 🎉</div>;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
              {allFollowUps.slice(0, 12).map(si => {
                const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                const isOverdue = si.followUpDate < todayStr;
                const isToday = si.followUpDate === todayStr;
                const daysUntil = daysBetween(todayStr, si.followUpDate);
                return (
                  <div key={si.id} style={{ padding: "10px 14px", background: isOverdue ? `${COLORS.danger}08` : isToday ? `${COLORS.warning}08` : `${COLORS.info}06`, border: `1px solid ${isOverdue ? COLORS.danger : isToday ? COLORS.warning : COLORS.info}20`, borderRadius: 8, borderLeft: `3px solid ${txnColor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                          <span style={{ color: txnColor }}>{si.type}</span> — {si.description}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: isOverdue ? `${COLORS.danger}20` : isToday ? `${COLORS.warning}20` : `${COLORS.info}15`, color: isOverdue ? COLORS.danger : isToday ? COLORS.warning : COLORS.info, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {isOverdue ? `${Math.abs(daysUntil)}d overdue` : isToday ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil}d`}
                      </div>
                    </div>
                    {si.nextStep && <div style={{ fontSize: 12, color: COLORS.text, marginTop: 6, padding: "4px 8px", background: `${COLORS.bg}80`, borderRadius: 4 }}>→ {si.nextStep}</div>}
                    {si.lastAction && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>Last: {si.lastAction} ({fmtShort(si.lastActionDate)})</div>}
                  </div>
                );
              })}
            </div>
          );
        })()}
        {(() => {
          const upcoming = activeServiceItems.filter(si => _matchSearch(si.accountName) && si.followUpDate && si.followUpDate > todayStr && daysBetween(todayStr, si.followUpDate) <= 7);
          const total = followUpsDue.length + upcoming.length;
          return total > 12 ? <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center", padding: 8, marginTop: 4 }}>+{total - 12} more follow-ups</div> : null;
        })()}
      </div>

      {/* Row 4: Cross-Sell Opportunities */}
      {(() => {
        const opps = [];
        accounts.forEach(acct => {
          const acctPolicies = policies.filter(p => p.accountId === acct.id && p.status === "Active");
          const lobs = acctPolicies.map(p => p.lob);
          const hasAuto = lobs.some(l => l === "Auto");
          const hasHome = lobs.some(l => ["Home","Homeowners","Condo","Renters","DP-3","DP-1"].includes(l));
          const hasUmbrella = lobs.some(l => l === "Umbrella");
          const isPersonal = acct.type === "Personal";
          if (isPersonal && hasHome && !hasAuto) opps.push({ acct, gap: "Auto", reason: "Has Home, no Auto", est: 1800 });
          if (isPersonal && hasAuto && !hasHome) opps.push({ acct, gap: "Home/Renters", reason: "Has Auto, no Home", est: 2400 });
          if (isPersonal && (hasAuto || hasHome) && !hasUmbrella) opps.push({ acct, gap: "Umbrella", reason: "No umbrella policy", est: 350 });
          if (isPersonal && acctPolicies.length > 0 && !lobs.includes("Life")) opps.push({ acct, gap: "Life", reason: "No life policy on file", est: 600 });
          if (acct.type === "Commercial" && !lobs.includes("Workers Comp")) opps.push({ acct, gap: "Workers Comp", reason: "Commercial, no WC", est: 3000 });
        });
        const totalEst = opps.reduce((s, o) => s + o.est, 0);
        return opps.length > 0 ? (
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={S.sectionTitle}>
              <span>Revenue Opportunities</span>
              <span style={{ fontSize: 12, color: COLORS.success, fontWeight: 600 }}>${totalEst.toLocaleString()} est. premium</span>
            </div>
            <div style={S.grid(2)}>
              {opps.slice(0, 8).map((o, i) => (
                <div key={i} style={{ padding: "8px 12px", background: `${COLORS.success}08`, borderRadius: 6, border: `1px solid ${COLORS.success}15`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}><AccountLink accountId={o.acct.id} name={o.acct.name} nav={nav} /></div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{o.reason}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={S.badge(COLORS.success)}>{o.gap}</span>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>~${o.est.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            {opps.length > 8 && <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center", padding: 8 }}>+{opps.length - 8} more opportunities</div>}
          </div>
        ) : null;
      })()}

      {/* Row 5: Renewals + Pipeline */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16, marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>Upcoming Renewals (60 days)</span></div>
          {(() => {
            // Policy-based renewals (expiration within 60 days)
            const policyRenewals = policies.filter(p => p.status === "Active" && p.expirationDate && daysBetween(todayStr, p.expirationDate) <= 60 && daysBetween(todayStr, p.expirationDate) >= 0)
              .map(p => ({ key: `p-${p.id}`, accountId: p.accountId, accountName: p.accountName, label: `${p.carrier} • ${p.lob} • ${p.policyNumber}`, date: p.expirationDate, source: "policy" }));
            // Service item renewals (type contains "renewal", not completed)
            const siRenewals = serviceItems.filter(si => si.type && si.type.toLowerCase().includes("renewal") && si.status !== "Done" && si.dueDate && daysBetween(todayStr, si.dueDate) <= 60)
              .map(si => ({ key: `si-${si.id}`, accountId: si.accountId, accountName: si.accountName, label: `${si.type}${si.carrier ? ` • ${si.carrier}` : ""}${si.policyNumber ? ` • ${si.policyNumber}` : ""}`, date: si.dueDate, source: "service" }));
            // Deduplicate: if a service item has same accountId as a policy renewal, prefer the service item (it has more context)
            const policyAccountIds = new Set(siRenewals.map(r => r.accountId + r.label));
            const combined = [...siRenewals, ...policyRenewals.filter(r => !siRenewals.some(s => s.accountId === r.accountId && s.label.includes(r.label.split(" • ")[0])))];
            const sorted = combined.sort((a, b) => a.date.localeCompare(b.date));
            if (sorted.length === 0) return <div style={S.emptyState}>No renewals in next 60 days</div>;
            return sorted.map(r => (
              <div key={r.key} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13 }}><AccountLink accountId={r.accountId} name={r.accountName} nav={nav} /></div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{r.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: daysBetween(todayStr, r.date) <= 14 ? COLORS.danger : daysBetween(todayStr, r.date) < 0 ? COLORS.danger : COLORS.warning }}>{fmtShort(r.date)}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{daysBetween(todayStr, r.date) < 0 ? `${Math.abs(daysBetween(todayStr, r.date))}d overdue` : `${daysBetween(todayStr, r.date)} days`}</div>
                </div>
              </div>
            ));
          })()}
        </div>

        <div style={S.card}>
          <div style={S.sectionTitle}><span>Pipeline Activity</span></div>
          {activePipeline.sort((a, b) => (b.created || "").localeCompare(a.created || "")).slice(0, 6).map(p => (
            <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13 }}>{p.firstName} {p.lastName}{p.business ? ` — ${p.business}` : ""}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{p.lob} • ${(p.estimatedPremium || 0).toLocaleString()}</div>
              </div>
              <span style={S.badge(statusColor(p.stage))}>{p.stage}</span>
            </div>
          ))}
          {activePipeline.length === 0 && <div style={S.emptyState}>No active prospects</div>}
        </div>
      </div>

      {/* Row 5: Book Snapshot */}
      <div style={{ ...S.grid(1), marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>Book Snapshot</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 16 }}>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{accounts.length}</div><div style={{ fontSize: 11, color: COLORS.textDim }}>Total Accounts</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{policies.filter(p => p.status === "Active").length}</div><div style={{ fontSize: 11, color: COLORS.textDim }}>Active Policies</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>${policies.filter(p => p.status === "Active").reduce((s, p) => s + (p.premium || 0), 0).toLocaleString()}</div><div style={{ fontSize: 11, color: COLORS.textDim }}>Total Premium</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{accounts.filter(a => a.type === "Personal").length}</div><div style={{ fontSize: 11, color: COLORS.textDim }}>Personal</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{accounts.filter(a => a.type === "Commercial").length}</div><div style={{ fontSize: 11, color: COLORS.textDim }}>Commercial</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== SERVICE BOARD ====================

// Smart Priority Score (0–100): higher = needs your attention more
function calcPriority(si, todayStr, polStatus) {
  if (si.status === "Done") return { score: 0, factors: [] };
  if (polStatus === "Requested Cancel") return { score: 1, factors: ["Requested Cancel — deprioritized"] };
  let score = 50;
  const factors = [];
  const flags = si.flags || [];

  // Due date factor
  if (si.dueDate) {
    const diff = daysBetween(todayStr, si.dueDate);
    if (diff < 0) { const pts = Math.min(30, Math.abs(diff) * 2); score += pts; factors.push(`+${pts} Overdue by ${Math.abs(diff)}d`); }
    else if (diff <= 3) { score += 20; factors.push("+20 Due within 3 days"); }
    else if (diff <= 7) { score += 10; factors.push("+10 Due within a week"); }
    else if (diff > 14) { score -= 10; factors.push("-10 Due date 14+ days out"); }
  }

  // Urgency factor
  if (si.urgency === "Critical") { score += 20; factors.push("+20 Critical urgency"); }
  else if (si.urgency === "High") { score += 10; factors.push("+10 High urgency"); }
  else if (si.urgency === "Low") { score -= 10; factors.push("-10 Low urgency"); }

  // Amount due factor
  const amt = Number(si.amountDue) || 0;
  if (amt >= 2000) { score += 8; factors.push("+8 Amount ≥$2K"); }
  else if (amt >= 1000) { score += 4; factors.push("+4 Amount ≥$1K"); }

  // Staleness — skip if ball in their court
  if (si.lastActionDate && !si.ballInCourt) {
    const stale = -daysBetween(todayStr, si.lastActionDate);
    if (stale >= 14) { score += 12; factors.push(`+12 Stale (${stale}d no action)`); }
    else if (stale >= 7) { score += 6; factors.push(`+6 Stale (${stale}d no action)`); }
  }

  // Ball-in-their-court deprioritization
  if (si.ballInCourt) { score -= 35; factors.push("-35 Ball in their court"); }
  const attempts = (si.contactAttempts || []).length;
  if (si.ballInCourt && attempts >= 3) { score -= 10; factors.push(`-10 ${attempts} contact attempts`); }

  // Flag-based adjustments
  if (flags.includes("Don't Send Reminders")) { score -= 20; factors.push("-20 No reminders flag"); }
  if (flags.includes("Auto Pay")) { score -= 20; factors.push("-20 Auto Pay flag"); }
  if (flags.includes("Requested Cancel")) { score += 10; factors.push("+10 Requested Cancel flag"); }

  const final = Math.max(0, Math.min(100, Math.round(score)));
  return { score: final, factors };
}

function priorityLabel(score) {
  if (score >= 75) return { text: "🔴", tip: "High priority — needs attention now" };
  if (score >= 55) return { text: "🟠", tip: "Medium priority — action needed soon" };
  if (score >= 35) return { text: "🟡", tip: "Low priority — monitor" };
  return { text: "⚪", tip: "Parked — waiting or not urgent" };
}

// Grouping logic for the service board
function groupServiceItems(items, todayStr) {
  const groups = {
    action: { label: "🎯 Needs Your Action", items: [], color: "#ef4444" },
    waiting: { label: "⏳ Ball in Their Court", items: [], color: "#f59e0b" },
    upcoming: { label: "📅 Coming Up (Next 7 Days)", items: [], color: "#3b82f6" },
    ontrack: { label: "✅ On Track", items: [], color: "#22c55e" },
    completed: { label: "☑ Done", items: [], color: "#78716c" },
  };
  items.forEach(si => {
    if (si.status === "Done") { groups.completed.items.push(si); return; }
    if (si.ballInCourt || (si.flags || []).includes("Auto Pay") || (si.flags || []).includes("Don't Send Reminders")) {
      groups.waiting.items.push(si);
    } else if (si.dueDate && si.dueDate < todayStr) {
      groups.action.items.push(si); // overdue
    } else if (si.urgency === "Critical" || si.status === "Needs Attention") {
      groups.action.items.push(si); // urgent
    } else if (si.dueDate && daysBetween(todayStr, si.dueDate) <= 7) {
      groups.upcoming.items.push(si);
    } else {
      groups.ontrack.items.push(si);
    }
  });
  return groups;
}



// Default Service View column configuration
const DEFAULT_SV_COLUMNS = [
  { key: "accountName", label: "Insured Name", width: 200, sortable: true },
  { key: "policyNumber", label: "Policy #", width: 110, sortable: true },
  { key: "carrier", label: "Carrier", width: 120, sortable: true },
  { key: "lob", label: "LOB", width: 100, sortable: true },
  { key: "dueDate", label: "Due Date", width: 130, sortable: true },
  { key: "type", label: "Transaction Type", width: 150, sortable: true },
  { key: "amountDue", label: "Amount Due", width: 100, sortable: true },
  { key: "status", label: "Status", width: 120, sortable: true },
  { key: "polStatus", label: "Policy Status", width: 120, sortable: true },
  { key: "lastActionDate", label: "Date", width: 130, sortable: true },
  { key: "notes", label: "Notes", width: 200, sortable: false },
  { key: "actions", label: "Actions", width: 100, sortable: false },
];
const SV_COL_MAP = Object.fromEntries(DEFAULT_SV_COLUMNS.map(c => [c.key, c]));
const SV_COLS_STORAGE_KEY = "sentinel_sv_columns";
const AH_COLS_STORAGE_KEY = "sentinel_ah_columns";

const EditableCell = ({ si, field, type = "text", style = {}, editingCell, editValue, setEditValue, updateField, setEditingCell }) => {
  const isEditing = editingCell && editingCell.id === si.id && editingCell.field === field;
  const val = si[field] || "";
  const normalizedVal = type === "date" ? normalizeDate(val) : val;
  if (isEditing) {
    if (type === "date") {
      return (
        <input
          autoFocus
          type="text"
          placeholder="MM/DD/YYYY"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => updateField(si.id, field, editValue)}
          onKeyDown={e => { if (e.key === "Enter") updateField(si.id, field, editValue); if (e.key === "Escape") setEditingCell(null); }}
          style={{ ...S.input, padding: "3px 6px", fontSize: 12, background: COLORS.bg, width: 90, ...style }}
        />
      );
    }
    return (
      <input
        autoFocus
        type={type === "number" ? "number" : type}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={() => updateField(si.id, field, type === "number" ? (Number(editValue) || 0) : editValue)}
        onKeyDown={e => { if (e.key === "Enter") updateField(si.id, field, type === "number" ? (Number(editValue) || 0) : editValue); if (e.key === "Escape") setEditingCell(null); }}
        style={{ ...S.input, padding: "3px 6px", fontSize: 12, background: COLORS.bg, width: "100%", ...style }}
      />
    );
  }
  let display = val || "—";
  if (type === "date" && normalizedVal) display = fmtShort(normalizedVal);
  else if (type === "number" && val) display = `$${Number(val).toLocaleString()}`;
  return (
    <span
      style={{ cursor: "pointer", display: "block", minHeight: 18, fontSize: 12, color: val ? COLORS.text : COLORS.textMuted, padding: "2px 0", ...style }}
      onClick={() => { setEditingCell({ id: si.id, field }); setEditValue(type === "date" ? (normalizedVal ? new Date(normalizedVal + "T12:00:00").toLocaleDateString("en-US") : "") : val); }}
      title="Click to edit"
    >
      {display}
    </span>
  );
};

function ServiceBoard({ data, setData, nav, navPol, config, setPage }) {
  const [filter, setFilterRaw] = useState(() => { try { return localStorage.getItem("sb_filter") || "active"; } catch { return "active"; } });
  const setFilter = (f) => { setFilterRaw(f); try { localStorage.setItem("sb_filter", f); } catch {} };
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef(null);
  const handleSearch = useCallback((val) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 200);
  }, []);
  const [showAdd, setShowAdd] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientStep, setQuickClientStep] = useState(1); // 1 = client, 2 = policy
  const [quickClientForm, setQuickClientForm] = useState({ name: "", type: "Personal", phone: "", email: "", address: "", city: "Fort Lauderdale", state: "FL", zip: "" });
  const [quickClientId, setQuickClientId] = useState(null);
  const [quickPolicyForm, setQuickPolicyForm] = useState({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly" });
  const [showContact, setShowContact] = useState(null);
  const [showNotes, setShowNotes] = useState(null);
  const [contactForm, setContactForm] = useState({ method: "Phone", notes: "" });
  const [viewMode, setViewModeRaw] = useState(() => { try { return localStorage.getItem("sb_viewMode") || "grouped"; } catch { return "grouped"; } });
  const setViewMode = (m) => { setViewModeRaw(m); try { localStorage.setItem("sb_viewMode", m); } catch {} };
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);  const [quickContactId, setQuickContactId] = useState(null);
  const [svColFilters, setSvColFilters] = useState({});
  const [showSvFilters, setShowSvFilters] = useState(true);
  const svActiveFilterCount = Object.values(svColFilters).filter(v => v !== "").length;
  const [quickMethod, setQuickMethod] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [showTemplate, setShowTemplate] = useState(null); // { accountName, policy }
  const [renewalPopupSI, setRenewalPopupSI] = useState(null);
  const [mailCopied, setMailCopied] = useState(null);

  const copyMailto = (si) => {
    copyMailtoToClipboard(si, data, config, () => {
      setMailCopied(si.id); setTimeout(() => setMailCopied(null), 2000);
      // Auto-log Email contact attempt
      const tplType = detectOutreachType(si);
      const note = `${tplType.charAt(0).toUpperCase() + tplType.slice(1)} email (mailto copied)`;
      const newAttempt = { date: todayStr, method: "Email", notes: note };
      let updated = { ...data, serviceItems: data.serviceItems.map(s =>
        s.id === si.id ? { ...s, contactAttempts: [newAttempt, ...(s.contactAttempts || [])], lastAction: `Email: ${note}`, lastActionDate: todayStr, status: s.status !== "Done" ? "Emailed" : s.status } : s
      ) };
      updated = addActivity(updated, si.accountId, "contact_attempt", "Email contact (mailto)", note);
      setData(updated);
    });
  };

  // Column order & width state (persisted)
  const [svColumns, setSvColumnsRaw] = useState(() => {
    try {
      const stored = localStorage.getItem(SV_COLS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults: keep stored order/widths, add any new columns
        const storedKeys = new Set(parsed.map(c => c.key));
        const merged = parsed.filter(c => SV_COL_MAP[c.key]).map(c => ({ ...c, width: c.width || SV_COL_MAP[c.key].width }));
        DEFAULT_SV_COLUMNS.forEach(c => { if (!storedKeys.has(c.key)) merged.push({ key: c.key, width: c.width }); });
        return merged;
      }
    } catch {}
    return DEFAULT_SV_COLUMNS.map(c => ({ key: c.key, width: c.width }));
  });
  const setSvColumns = (cols) => { setSvColumnsRaw(cols); try { localStorage.setItem(SV_COLS_STORAGE_KEY, JSON.stringify(cols)); } catch {} };

  // Column drag-reorder state
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Column resize state
  const resizeRef = useRef(null);
  const handleResizeStart = (e, colKey) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const col = svColumns.find(c => c.key === colKey);
    const startW = col ? col.width : 100;
    const onMove = (me) => {
      const delta = me.clientX - startX;
      const newW = Math.max(50, startW + delta);
      setSvColumnsRaw(prev => { const next = prev.map(c => c.key === colKey ? { ...c, width: newW } : c); try { localStorage.setItem(SV_COLS_STORAGE_KEY, JSON.stringify(next)); } catch {} return next; });
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resetColumns = () => setSvColumns(DEFAULT_SV_COLUMNS.map(c => ({ key: c.key, width: c.width })));
  const [sortCol, setSortColRaw] = useState(() => { try { return localStorage.getItem("sb_sortCol") || "dueDate"; } catch { return "dueDate"; } });
  const setSortCol = (c) => { setSortColRaw(c); try { localStorage.setItem("sb_sortCol", c); } catch {} };
  const [sortDir, setSortDirRaw] = useState(() => { try { return localStorage.getItem("sb_sortDir") || "desc"; } catch { return "desc"; } });
  const setSortDir = (d) => { setSortDirRaw(d); try { localStorage.setItem("sb_sortDir", d); } catch {} };
  const [form, setForm] = useState({ type: "Ivantage Renewal", accountId: "", policyId: "", description: "", status: "Uncontacted", urgency: "Medium", dueDate: "", amountDue: "", assignedTo: config.agentName || "Agent" });
  const [acctSearch, setAcctSearch] = useState("");
  const acctResults = useMemo(() => {
    if (!acctSearch || acctSearch.length < 1) return [];
    const q = acctSearch.toLowerCase();
    return data.accounts.filter(a => a.name.toLowerCase().includes(q) || (a.phone || "").includes(q) || (a.email || "").toLowerCase().includes(q)).slice(0, 10);
  }, [acctSearch, data.accounts]);

  const todayStr = today();

  const policyMap = useMemo(() => {
    const map = {};
    for (const p of data.policies) map[p.id] = p;
    return map;
  }, [data.policies]);

  const toggleBallInCourt = (id) => {
    const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === id ? { ...s, ballInCourt: !s.ballInCourt } : s) };
    setData(updated);
  };

  // Memoized filtered/sorted/scored items with traffic light zones
  const items = useMemo(() => {
    return data.serviceItems.filter(si => {
      // P-Cancels only appear in Allstate Hub
      if (si.type === "Allstate P-Cancel") return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (!(si.accountName || "").toLowerCase().includes(q) && !(si.description || "").toLowerCase().includes(q) && !(si.type || "").toLowerCase().includes(q) && !(si.nextStep || "").toLowerCase().includes(q)) return false;
      }
      if (filter === "all") return true;
      if (filter === "active") return si.status !== "Done";
      if (filter === "overdue") return si.dueDate < todayStr && si.status !== "Done";
      if (filter === "waiting") return si.ballInCourt || (si.flags || []).some(f => ["Auto Pay","Don't Send Reminders"].includes(f));
      return si.type === filter;
    }).map(si => { const _pol = policyMap[si.policyId]; return { ...si, _pri: calcPriority(si, todayStr, _pol && _pol.status), _tl: trafficZone(si.dueDate, todayStr) }; }).sort((a, b) => {
      const isCompA = a.status === "Done";
      const isCompB = b.status === "Done";
      // Completed items always sink to bottom
      if (isCompA !== isCompB) return isCompA ? 1 : -1;
      // Traffic light zone is primary sort (critical/overdue pinned top)
      if (!isCompA && a._tl.sort !== b._tl.sort) return a._tl.sort - b._tl.sort;
      // Secondary sort by user-selected column
      const dir = sortDir === "asc" ? 1 : -1;
      let av, bv;
      if (sortCol === "accountName") { av = (a.accountName || "").toLowerCase(); bv = (b.accountName || "").toLowerCase(); }
      else if (sortCol === "dueDate") { av = a.dueDate || "z"; bv = b.dueDate || "z"; }
      else if (sortCol === "type") { av = a.type || ""; bv = b.type || ""; }
      else if (sortCol === "amountDue") { return dir * ((Number(a.amountDue) || 0) - (Number(b.amountDue) || 0)); }
      else if (sortCol === "status") { av = a.status || ""; bv = b.status || ""; }
      else if (sortCol === "lastActionDate") { av = a.lastActionDate || ""; bv = b.lastActionDate || ""; }
      else if (sortCol === "followUpDate") { av = a.followUpDate || "z"; bv = b.followUpDate || "z"; }
      else if (sortCol === "polStatus") { const pa = policyMap[a.policyId]; const pb = policyMap[b.policyId]; av = pa ? pa.status : "zzz"; bv = pb ? pb.status : "zzz"; }
      else if (sortCol === "carrier") { const pa = policyMap[a.policyId] || {}; const pb = policyMap[b.policyId] || {}; av = (pa.carrier || a.carrier || "").toLowerCase(); bv = (pb.carrier || b.carrier || "").toLowerCase(); }
      else if (sortCol === "lob") { const pa = policyMap[a.policyId] || {}; const pb = policyMap[b.policyId] || {}; av = (pa.lob || pa.lineOfBusiness || "").toLowerCase(); bv = (pb.lob || pb.lineOfBusiness || "").toLowerCase(); }
      else if (sortCol === "effectiveDate") { const pa = policyMap[a.policyId] || {}; const pb = policyMap[b.policyId] || {}; av = pa.effectiveDate || "z"; bv = pb.effectiveDate || "z"; }
      else { av = a[sortCol] || ""; bv = b[sortCol] || ""; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [data.serviceItems, policyMap, debouncedSearch, filter, sortCol, sortDir, todayStr]);

  const getPolicy = (policyId) => policyMap[policyId] || {};
  const siDisplayName = (si) => { const pol = getPolicy(si.policyId); return pol.namedInsured || si.accountName; };
  const accountPolicies = form.accountId ? data.policies.filter(p => p.accountId === form.accountId) : [];

  // Column filter: extract display value for a service item column
  const getSvCellValue = (si, key) => {
    const pol = getPolicy(si.policyId);
    if (key === "accountName") return si.accountName || "";
    if (key === "policyNumber") return pol.policyNumber || si.policyNumber || "";
    if (key === "carrier") return pol.carrier || si.carrier || "";
    if (key === "lob") return pol.lob || pol.lineOfBusiness || "";
    if (key === "effectiveDate") return pol.effectiveDate || "";
    if (key === "dueDate") return si.dueDate || "";
    if (key === "type") return si.type || "";
    if (key === "amountDue") return String(si.amountDue || 0);
    if (key === "status") return si.status || "";
    if (key === "polStatus") return pol.status || "";
    if (key === "lastAction") return si.lastAction || "";
    if (key === "lastActionDate") return si.lastActionDate || "";
    if (key === "followUpDate") return si.followUpDate || "";
    return si[key] || "";
  };

  const filteredItems = useMemo(() => {
    if (svActiveFilterCount === 0) return items;
    return items.filter(si => {
      for (const [key, val] of Object.entries(svColFilters)) {
        if (!val) continue;
        const cellVal = getSvCellValue(si, key);
        const isDropdown = ["carrier","lob","status","polStatus","type"].includes(key);
        if (isDropdown) { if (cellVal !== val) return false; }
        else { if (!cellVal.toLowerCase().includes(val.toLowerCase())) return false; }
      }
      return true;
    });
  }, [items, svColFilters, svActiveFilterCount]);

  const svDistinctVals = useMemo(() => {
    const vals = {};
    ["carrier","lob","status","polStatus","type"].forEach(key => {
      const set = new Set();
      items.forEach(si => { const v = getSvCellValue(si, key); if (v) set.add(v); });
      vals[key] = [...set].sort();
    });
    return vals;
  }, [items]);

  // Inline field update
  const updateField = (id, field, value) => {
    const si = data.serviceItems.find(s => s.id === id);
    // Normalize date fields
    const dateFields = ["dueDate", "lastActionDate", "followUpDate"];
    const finalValue = dateFields.includes(field) ? normalizeDate(value) : value;
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === id ? { ...s, [field]: finalValue } : s) };
    // Auto-log activity for meaningful updates
    if (si && field === "lastAction" && value) {
      updated = { ...updated, serviceItems: updated.serviceItems.map(s => s.id === id ? { ...s, lastActionDate: todayStr } : s) };
      updated = addActivity(updated, si.accountId, "status_change", `Last action updated`, value);
    }
    setData(updated);
    setEditingCell(null);
  };

  // Update LOB on the linked policy
  const updatePolicyLOB = (si, value) => {
    const normalized = normalizeLOB(value);
    if (!si.policyId || !normalized) { setEditingCell(null); return; }
    const updated = { ...data, policies: data.policies.map(p => p.id === si.policyId ? { ...p, lob: normalized, lineOfBusiness: normalized } : p) };
    setData(updated);
    setEditingCell(null);
  };

  const handleAdd = () => {
    const account = data.accounts.find(a => a.id === form.accountId);
    const newItem = {
      ...form, id: uid(), accountName: account ? account.name : "",
      amountDue: Number(form.amountDue) || 0, contactAttempts: [],
      lastAction: "", lastActionDate: "", nextStep: "", followUpDate: "",
      created: todayStr
    };
    let updated = { ...data, serviceItems: [...data.serviceItems, newItem] };
    updated = addActivity(updated, form.accountId, "service_created", `Service item created: ${form.type}`, form.description);
    setData(updated);
    setShowAdd(false);
    setAcctSearch("");
    setForm({ type: "Ivantage Renewal", accountId: "", policyId: "", description: "", status: "Uncontacted", urgency: "Medium", dueDate: "", amountDue: "", assignedTo: config.agentName || "Agent" });
  };

  const updateStatus = (id, newStatus) => {
    // Intercept "Renewed" status — open renewal popup
    if (newStatus === "Renewed") {
      const si = data.serviceItems.find(s => s.id === id);
      if (si) { setRenewalPopupSI(si); return; }
    }
    const si = data.serviceItems.find(s => s.id === id);
    let updated = { ...data, serviceItems: data.serviceItems.map(s => {
      if (s.id !== id) return s;
      const upd = { ...s, status: newStatus };
      if (newStatus === "Auto Pay" && !(s.notes || "").includes("Auto Pay")) {
        upd.notes = s.notes ? `Auto Pay\n${s.notes}` : "Auto Pay";
      }
      return upd;
    }) };
    if (si) updated = addActivity(updated, si.accountId, "status_change", `Service item status → ${newStatus}`, si.description);
    // When a renewal service item is marked Done, safely activate the linked policy
    if (newStatus === "Done" && si) updated = safeActivateRenewalPolicy(updated, si);
    setData(updated);
  };

  // Auto-determine status based on contact method
  const autoStatusFromMethod = (method) => ["Phone", "Voicemail", "In Person"].includes(method) ? "Called" : "Emailed";

  const logContact = (siId) => {
    const si = data.serviceItems.find(s => s.id === siId);
    const newAttempt = { date: todayStr, method: contactForm.method, notes: contactForm.notes };
    const newStatus = autoStatusFromMethod(contactForm.method);
    let updated = {
      ...data,
      serviceItems: data.serviceItems.map(s =>
        s.id === siId ? { ...s, contactAttempts: [newAttempt, ...(s.contactAttempts || [])], lastAction: `${contactForm.method}: ${contactForm.notes}`, lastActionDate: todayStr, status: s.status !== "Done" ? newStatus : s.status } : s
      )
    };
    if (si) updated = addActivity(updated, si.accountId, "contact_attempt", `Contact attempt: ${contactForm.method}`, contactForm.notes);
    if (si && si.status !== "Done" && si.status !== newStatus) updated = addActivity(updated, si.accountId, "status_change", `Status auto-updated → ${newStatus}`, si.description);
    setData(updated);
    setShowContact(null);
    setContactForm({ method: "Phone", notes: "" });
  };

  // Quick inline contact logger
  const quickLog = (siId, method) => {
    if (quickContactId === siId && quickMethod === method) {
      // Second click = submit with note
      const si = data.serviceItems.find(s => s.id === siId);
      const note = quickNote || `${method} attempt`;
      const newAttempt = { date: todayStr, method, notes: note };
      const newStatus = autoStatusFromMethod(method);
      let updated = {
        ...data,
        serviceItems: data.serviceItems.map(s => {
          if (s.id !== siId) return s;
          const prevNotes = (s.notes || "").trim();
          const noteEntry = `[${todayStr}] ${method}: ${note}`;
          const newNotes = prevNotes ? `${noteEntry}\n${prevNotes}` : noteEntry;
          return { ...s, contactAttempts: [newAttempt, ...(s.contactAttempts || [])], lastAction: `${method}: ${note}`, lastActionDate: todayStr, status: s.status !== "Done" ? newStatus : s.status, notes: newNotes };
        })
      };
      if (si) updated = addActivity(updated, si.accountId, "contact_attempt", `${method} contact`, note);
      if (si && si.status !== "Done" && si.status !== newStatus) updated = addActivity(updated, si.accountId, "status_change", `Status auto-updated → ${newStatus}`, si.description);
      setData(updated);
      setQuickContactId(null); setQuickMethod(""); setQuickNote("");
    } else {
      setQuickContactId(siId); setQuickMethod(method); setQuickNote("");
    }
  };

  // Bulk actions
  const [lastCheckedId, setLastCheckedId] = useState(null);
  const toggleSelect = (id, e) => {
    const next = new Set(selected);
    if (e && e.shiftKey && lastCheckedId !== null && lastCheckedId !== id) {
      const lastIdx = items.findIndex(i => i.id === lastCheckedId);
      const curIdx = items.findIndex(i => i.id === id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        for (let i = start; i <= end; i++) next.add(items[i].id);
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    setLastCheckedId(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filteredItems.length) setSelected(new Set());
    else setSelected(new Set(filteredItems.map(i => i.id)));
    setLastCheckedId(null);
  };
  const bulkStatus = (newStatus) => {
    let updated = { ...data };
    selected.forEach(id => {
      const si = updated.serviceItems.find(s => s.id === id);
      if (si) {
        updated = { ...updated, serviceItems: updated.serviceItems.map(s => s.id === id ? { ...s, status: newStatus } : s) };
        updated = addActivity(updated, si.accountId, "status_change", `Bulk: status → ${newStatus}`, si.description);
        // When a renewal service item is marked Done, safely activate the linked policy
        if (newStatus === "Done") updated = safeActivateRenewalPolicy(updated, si);
      }
    });
    setData(updated, { undo: true, message: `Bulk status → ${newStatus} (${selected.size} items)` });
    setSelected(new Set());
    setLastCheckedId(null);
  };
  const bulkDelete = () => {
    if (!confirmBulkDel) { setConfirmBulkDel(true); return; }
    const count = selected.size;
    let updated = { ...data, serviceItems: data.serviceItems.filter(s => !selected.has(s.id)) };
    setData(updated, { undo: true, message: `Deleted ${count} service item${count > 1 ? "s" : ""}` });
    setSelected(new Set());
    setLastCheckedId(null);
    setConfirmBulkDel(false);
  };

  // Stats — single pass over serviceItems
  const { activeCount, overdueCount, totalAmountDue, waitingCount, needsActionCount, tlCritical, tlRed, tlYellow, tlGreen } = useMemo(() => {
    let active = 0, overdue = 0, amtDue = 0, waiting = 0, needsAction = 0, crit = 0, red = 0, yel = 0, grn = 0;
    for (const si of data.serviceItems) {
      const done = si.status === "Done";
      if (!done) {
        active++;
        amtDue += (Number(si.amountDue) || 0);
        if (si.dueDate < todayStr) overdue++;
        if (calcPriority(si, todayStr, (policyMap[si.policyId] || {}).status).score >= 55) needsAction++;
        const tl = trafficZone(si.dueDate, todayStr);
        if (tl.zone === "critical") crit++;
        else if (tl.zone === "red") red++;
        else if (tl.zone === "yellow") yel++;
        else if (tl.zone === "green") grn++;
      }
      if (si.ballInCourt || (si.flags || []).some(f => ["Auto Pay","Don't Send Reminders"].includes(f))) waiting++;
    }
    return { activeCount: active, overdueCount: overdue, totalAmountDue: amtDue, waitingCount: waiting, needsActionCount: needsAction, tlCritical: crit, tlRed: red, tlYellow: yel, tlGreen: grn };
  }, [data.serviceItems, todayStr, policyMap]);

  const handleExport = () => {
    const headers = ["Insured Name","Policy #","Carrier","Due Date","Transaction Type","Amount Due","Status","Last Action","Last Action Date","Next Step"];
    const rows = data.serviceItems.map(si => {
      const pol = data.policies.find(p => p.id === si.policyId) || {};
      return [si.accountName, pol.policyNumber || si.policyNumber || "", pol.carrier || si.carrier || "", si.dueDate, si.type, si.amountDue || 0, si.status, si.lastAction || "", si.lastActionDate || "", si.nextStep || ""];
    });
    exportCSV(headers, rows, `sentinel-service-board-${todayStr}.csv`);
  };

  const handleExportExcel = () => {
    const headers = ["Insured Name","Policy #","Carrier","Due Date","Transaction Type","Amount Due","Status","Description","Last Action","Last Action Date","Next Step","Urgency","Assigned To","Follow-Up Date","Flags"];
    const rows = data.serviceItems.map(si => {
      const pol = data.policies.find(p => p.id === si.policyId) || {};
      return [si.accountName, pol.policyNumber || si.policyNumber || "", pol.carrier || si.carrier || "", si.dueDate, si.type, si.amountDue || 0, si.status, si.description || "", si.lastAction || "", si.lastActionDate || "", si.nextStep || "", si.urgency || "", si.assignedTo || "", si.followUpDate || "", (si.flags || []).join(", ")];
    });
    const ws = utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((h, i) => ({ wch: i === 0 ? 22 : i === 7 || i === 10 ? 35 : 16 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Service Items");
    writeFile(wb, `sentinel-service-board-${todayStr}.xlsx`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden" }}>
      <div style={{ flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Service View</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Search service items..." value={search} onChange={e => handleSearch(e.target.value)} />
          {svActiveFilterCount > 0 && <span style={{ fontSize: 11, color: COLORS.textDim, whiteSpace: "nowrap" }}>Showing {filteredItems.length} of {items.length}</span>}
          <button style={{ ...S.btn("ghost"), fontSize: 12, color: "#60a5fa" }} onClick={() => setPage("allstate")} title="Open Allstate Hub">★ Allstate Hub</button>
          {svActiveFilterCount > 0 && (
            <button style={{ ...S.btn(), padding: "6px 10px", fontSize: 11, color: COLORS.danger }} onClick={() => setSvColFilters({})} title="Clear all filters">✕ Clear Filters</button>
          )}
          <button style={S.btn("ghost")} onClick={handleExport}>↓ Export CSV</button>
          <button style={{ ...S.btn("ghost"), color: "#22c55e" }} onClick={handleExportExcel}>↓ Export Excel</button>
          <button style={S.btn()} onClick={() => setShowAdd(true)}>+ New Item</button>
          <button style={{ ...S.btn(), background: COLORS.success }} onClick={() => { setShowQuickClient(true); setQuickClientStep(1); setQuickClientForm({ name: "", type: "Personal", phone: "", email: "", address: "", city: "Fort Lauderdale", state: "FL", zip: "" }); setQuickClientId(null); setQuickPolicyForm({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly" }); }}>+ New Client</button>
        </div>
      </div>

      {/* Summary Stats — like Sheets dashboard */}
      <div style={S.grid(5)}>
        <div style={{ ...S.statCard, cursor: "pointer", border: filter === "active" ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}` }} onClick={() => setFilter("active")}>
          <div style={S.statVal}>{activeCount}</div>
          <div style={S.statLabel}>Open Items</div>
        </div>
        <div style={{ ...S.statCard, cursor: "pointer", border: filter === "overdue" ? `1px solid ${COLORS.danger}` : `1px solid ${COLORS.border}` }} onClick={() => setFilter("overdue")}>
          <div style={{ ...S.statVal, color: overdueCount > 0 ? COLORS.danger : COLORS.success }}>{overdueCount}</div>
          <div style={S.statLabel}>Overdue</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.danger }}>{needsActionCount}</div>
          <div style={S.statLabel}>Needs Action</div>
        </div>
        <div style={{ ...S.statCard, cursor: "pointer", border: filter === "waiting" ? `1px solid ${COLORS.warning}` : `1px solid ${COLORS.border}` }} onClick={() => setFilter("waiting")}>
          <div style={{ ...S.statVal, color: COLORS.warning }}>{waitingCount}</div>
          <div style={S.statLabel}>Ball in Their Court</div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.info }}>${totalAmountDue.toLocaleString()}</div>
          <div style={S.statLabel}>Total Amount Due</div>
        </div>
      </div>

      {/* Traffic Light Summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 16px", marginTop: 12, background: `${COLORS.border}15`, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
        <span style={{ color: COLORS.textDim, fontSize: 11, fontWeight: 500, letterSpacing: "0.3px", textTransform: "uppercase" }}>Due Date Pulse</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", display: "inline-block", boxShadow: tlCritical > 0 ? "0 0 6px #dc262680" : "none" }} />
          <span style={{ color: "#ef4444" }}>{tlCritical}</span>
          <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: 11 }}>overdue/today</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
          <span style={{ color: "#ef4444" }}>{tlRed}</span>
          <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: 11 }}>≤10d</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
          <span style={{ color: "#eab308" }}>{tlYellow}</span>
          <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: 11 }}>11–30d</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ color: "#22c55e" }}>{tlGreen}</span>
          <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: 11 }}>31+d</span>
        </span>
      </div>

      {/* View mode toggle + Filter pills */}
      <div style={{ display: "flex", gap: 6, marginTop: 16, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", background: COLORS.border, borderRadius: 6, padding: 2, marginRight: 8 }}>
          {[{key:"grouped",label:"Grouped"},{key:"flat",label:"Flat"}].map(v => (
            <span key={v.key} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: viewMode === v.key ? COLORS.accent : "transparent", color: viewMode === v.key ? "#fff" : COLORS.textDim,
            }} onClick={() => setViewMode(v.key)}>{v.label}</span>
          ))}
        </div>
        <span style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", color: COLORS.textDim, background: COLORS.border, marginRight: 4 }}
          onClick={resetColumns} title="Reset column order and widths to defaults">↺ Reset Columns</span>
        {["all","active","overdue","waiting"].map(f => (
          <span key={f} style={S.pill(filter === f)} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "active" ? "Active" : f === "overdue" ? "Overdue" : "Waiting"}
          </span>
        ))}
        <span style={{ width: 1, background: COLORS.border, margin: "0 4px" }} />
        {SERVICE_TYPES.map(f => (
          <span key={f} style={{ ...S.pill(filter === f), borderColor: filter === f ? TXN_COLORS[f] : COLORS.border, color: filter === f ? TXN_COLORS[f] : COLORS.textDim }} onClick={() => setFilter(f)}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.6 }}>({data.serviceItems.filter(si => si.type === f).length})</span>
          </span>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}30`, borderRadius: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Done","Auto Pay","Emailed","Called","Needs Attention","Uncontacted"].map(s => (
              <button key={s} style={{ ...S.btn("ghost"), padding: "3px 10px", fontSize: 11 }} onClick={() => bulkStatus(s)}>→ {s}</button>
            ))}
          </div>
          <button style={{ ...S.btn("ghost"), padding: "3px 10px", fontSize: 11, color: COLORS.danger, borderColor: `${COLORS.danger}40`, marginLeft: "auto", background: confirmBulkDel ? `${COLORS.danger}20` : "transparent" }} onClick={bulkDelete}>{confirmBulkDel ? `Confirm Delete ${selected.size}?` : "Delete"}</button>
          <button style={{ ...S.btn("ghost"), padding: "3px 10px", fontSize: 11 }} onClick={() => { setSelected(new Set()); setLastCheckedId(null); }}>Clear</button>
        </div>
      )}

      </div>{/* end frozen header */}

      {/* Sheets-style table */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", minHeight: 0 }}>
        <table style={{ ...S.table, minWidth: 800, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col style={{ width: 4 }} />
            {svColumns.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 3 }}><tr>
            <th style={{ ...S.th, width: 32, textAlign: "center", background: COLORS.card }}>
              <input type="checkbox" checked={filteredItems.length > 0 && selected.size === filteredItems.length} onChange={toggleAll} style={{ cursor: "pointer" }} />
            </th>
            <th style={{ ...S.th, width: 4, background: COLORS.card }}></th>
            {svColumns.map((col, idx) => {
              const def = SV_COL_MAP[col.key];
              if (!def) return null;
              return (
                <th key={col.key}
                  draggable
                  onDragStart={(e) => { setDragCol(col.key); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); if (dragCol && dragCol !== col.key) setDragOverCol(col.key); }}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragCol || dragCol === col.key) return;
                    const fromIdx = svColumns.findIndex(c => c.key === dragCol);
                    const toIdx = svColumns.findIndex(c => c.key === col.key);
                    if (fromIdx < 0 || toIdx < 0) return;
                    const next = [...svColumns];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(toIdx, 0, moved);
                    setSvColumns(next);
                    setDragCol(null); setDragOverCol(null);
                  }}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                  style={{
                    ...S.th, cursor: def.sortable ? "pointer" : "default", userSelect: "none", position: "relative", whiteSpace: "nowrap",
                    background: COLORS.card,
                    borderLeft: dragOverCol === col.key ? `2px solid ${COLORS.accent}` : "none",
                    opacity: dragCol === col.key ? 0.4 : 1,
                  }}
                  onClick={() => { if (!def.sortable) return; if (sortCol === col.key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); } else { setSortCol(col.key); setSortDir("asc"); } }}
                >
                  {def.label}{sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  {/* Resize handle */}
                  <span
                    onMouseDown={(e) => handleResizeStart(e, col.key)}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", background: "transparent" }}
                    onMouseEnter={e => e.currentTarget.style.background = `${COLORS.accent}40`}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
              );
            })}
          </tr>
          {showSvFilters && (
            <tr style={{ position: "sticky", top: 39, zIndex: 2 }}>
              <th style={{ padding: "4px 6px", background: COLORS.card }}></th>
              <th style={{ padding: "4px 6px", background: COLORS.card }}></th>
              {svColumns.map(col => {
                const fVal = svColFilters[col.key] || "";
                const filterStyle = { width: "100%", padding: "3px 4px", fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 3, background: COLORS.bg, color: COLORS.text, outline: "none", boxSizing: "border-box" };
                const isDropdown = ["carrier","lob","status","polStatus","type"].includes(col.key);
                if (col.key === "actions") return <th key={col.key} style={{ padding: "4px 6px", background: COLORS.card }}></th>;
                return (
                  <th key={col.key} style={{ padding: "4px 6px", background: COLORS.card, borderBottom: `2px solid ${COLORS.accent}40`, borderRight: `1px solid ${COLORS.border}40` }}>
                    {isDropdown ? (
                      <select style={{ ...filterStyle, cursor: "pointer" }} value={fVal}
                        onChange={e => setSvColFilters(prev => ({ ...prev, [col.key]: e.target.value }))}>
                        <option value="">All</option>
                        {(svDistinctVals[col.key] || []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input style={filterStyle} type="text" placeholder="Filter..." value={fVal}
                        onChange={e => setSvColFilters(prev => ({ ...prev, [col.key]: e.target.value }))} />
                    )}
                  </th>
                );
              })}
            </tr>
          )}
          </thead>
          <tbody>
            {(() => {
              const renderRow = (si) => {
                const pol = getPolicy(si.policyId);
                const attempts = si.contactAttempts || [];
                const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                const isCompleted = si.status === "Done";
                const polReqCancel = pol && pol.status === "Requested Cancel";
                const isBallInCourt = si.ballInCourt;
                const rowOpacity = isCompleted || polReqCancel ? 0.4 : isBallInCourt ? 0.5 : 1;
                const isAllstate = si.type && si.type.toLowerCase().includes("allstate");
                const barColor = isAllstate ? "#3b82f6" : txnColor;
                const isCritical = !isCompleted && si._tl.zone === "critical";
                const staleDays = si.lastActionDate ? Math.max(0, -daysBetween(todayStr, si.lastActionDate)) : (si.created ? Math.max(0, -daysBetween(todayStr, si.created)) : 0);
                const rowBg = selected.has(si.id) ? `${COLORS.accent}12` : isCritical ? si._tl.rowBg : `${barColor}08`;
                const rowHoverBg = selected.has(si.id) ? `${COLORS.accent}12` : isCritical ? "#dc262625" : `${barColor}15`;
                return (<React.Fragment key={si.id}>
                <tr
                  style={{ transition: "background 0.1s", background: rowBg, opacity: rowOpacity }}
                  onMouseEnter={e => { e.currentTarget.style.background = rowHoverBg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                >
                  {/* Checkbox */}
                  <td style={{ ...S.td, textAlign: "center", width: 32 }}>
                    <input type="checkbox" checked={selected.has(si.id)} onChange={(e) => toggleSelect(si.id, e.nativeEvent)} style={{ cursor: "pointer" }} />
                  </td>

                  {/* Transaction type color bar — blue for Allstate */}
                  <td style={{ padding: 0, width: 4, background: barColor, borderBottom: `1px solid ${COLORS.border}08` }} />

                  {/* Dynamic columns */}
                  {svColumns.map(col => {
                    const cKey = col.key;
                    if (cKey === "accountName") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                          {pol.namedInsured && <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 400, fontStyle: "italic" }}>({si.accountName})</span>}
                          {si.ballInCourt && <span title="Ball in their court" style={{ fontSize: 10, background: "#fbbf2430", color: "#fbbf24", padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>THEIR COURT</span>}
                          {polReqCancel && !isCompleted && <span style={{ fontSize: 10, background: "#f59e0b20", color: "#f59e0b", padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>REQ CANCEL</span>}
                          {(si.flags || []).map(f => { const fb = flagBadgeStyle(f); return <span key={f} title={f} style={{ fontSize: 10, background: fb.background, color: fb.color, padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>{fb.icon}</span>; })}
                          {isAllstate && <span title="View in Allstate Hub" style={{ fontSize: 10, background: "#3b82f620", color: "#60a5fa", padding: "1px 5px", borderRadius: 3, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => setPage("allstate")}>★ HUB</span>}
                          {staleDays >= 14 && !isCompleted && <span title={`No action logged in ${staleDays} days`} style={{ fontSize: 10, background: "#ef444420", color: "#ef4444", padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>STALE {staleDays}d</span>}
                          {staleDays >= 7 && staleDays < 14 && !isCompleted && <span title={`No action logged in ${staleDays} days`} style={{ fontSize: 10, background: "#f5890b20", color: "#f59e0b", padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>AGING {staleDays}d</span>}
                          {!si.followUpDate && !isCompleted && !isBallInCourt && <span title="No follow-up date set" style={{ fontSize: 10, background: "#a855f720", color: "#a855f7", padding: "1px 5px", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}>NO F/U</span>}
                        </div>
                      </td>
                    );
                    if (cKey === "policyNumber") { const polNum = pol.policyNumber || si.policyNumber || ""; return (
                      <td key={cKey} style={{ ...S.td, fontFamily: "monospace", fontSize: 12, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {si.policyId ? (
                            <span style={{ cursor: "pointer", color: COLORS.accentLight, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => navPol(si.policyId)} title="View policy">{polNum || "—"}</span>
                          ) : <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{polNum || "—"}</span>}
                          {polNum && <button style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", fontSize: 12, color: COLORS.textMuted, flexShrink: 0, lineHeight: 1 }} title="Copy policy #" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(polNum); e.currentTarget.textContent = "✓"; setTimeout(() => { if (e.currentTarget) e.currentTarget.textContent = "⧉"; }, 1200); }}>⧉</button>}
                        </div>
                      </td>
                    ); }
                    if (cKey === "carrier") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {si.policyId ? (
                          <span style={{ cursor: "pointer", color: COLORS.accentLight }} onClick={() => navPol(si.policyId)} title={pol.carrier || si.carrier || "View policy"}>{carrierShort(pol.carrier || si.carrier || "—")}</span>
                        ) : <span title={pol.carrier || si.carrier || ""}>{carrierShort(pol.carrier || si.carrier || "—")}</span>}
                      </td>
                    );
                    if (cKey === "lob") {
                      const lobVal = pol.lob || pol.lineOfBusiness || "";
                      const isEditingLob = editingCell && editingCell.id === si.id && editingCell.field === "lob";
                      return (
                        <td key={cKey} style={{ ...S.td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                          {isEditingLob ? (
                            <div style={{ position: "relative" }}>
                              <input autoFocus list={`lob-opts-${si.id}`} value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={() => updatePolicyLOB(si, editValue)}
                                onKeyDown={e => { if (e.key === "Enter") updatePolicyLOB(si, editValue); if (e.key === "Escape") setEditingCell(null); }}
                                style={{ ...S.input, padding: "3px 6px", fontSize: 11, background: COLORS.bg, width: "100%" }}
                                placeholder="Type LOB..."
                              />
                              <datalist id={`lob-opts-${si.id}`}>
                                {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l} />)}
                              </datalist>
                            </div>
                          ) : (
                            <span style={{ cursor: si.policyId ? "pointer" : "default", display: "block", minHeight: 18, color: lobVal ? COLORS.text : COLORS.textMuted, padding: "2px 0" }}
                              onClick={() => { if (!si.policyId) return; setEditingCell({ id: si.id, field: "lob" }); setEditValue(lobVal); }}
                              title={si.policyId ? "Click to edit LOB" : "No linked policy"}>
                              {lobVal || "—"}
                            </span>
                          )}
                        </td>
                      );
                    }
                    if (cKey === "effectiveDate") {
                      const effDate = pol.effectiveDate || "";
                      return (
                        <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap", fontSize: 11, color: COLORS.textDim }}>
                          {effDate ? fmt(effDate) : "—"}
                        </td>
                      );
                    }
                    if (cKey === "dueDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap", background: !isCompleted && si._tl.zone !== "none" && si._tl.zone !== "critical" ? si._tl.bg : "transparent", borderRadius: 2 }}>
                        <EditableCell si={si} field="dueDate" type="date" style={{ color: !isCompleted ? si._tl.color : COLORS.textMuted, fontWeight: si._tl.zone === "critical" || si._tl.zone === "red" ? 700 : 400 }} editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                      </td>
                    );
                    if (cKey === "type") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden" }}>
                        <select value={si.type} onChange={e => updateField(si.id, "type", e.target.value)}
                          style={{ ...S.select, padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: `${txnColor}20`, color: txnColor, border: `1px solid ${txnColor}40`, cursor: "pointer", maxWidth: "100%" }}>
                          {(config.transactionTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                          {si.type && !(config.transactionTypes || []).includes(si.type) && <option value={si.type}>{si.type}</option>}
                        </select>
                      </td>
                    );
                    if (cKey === "amountDue") return (
                      <td key={cKey} style={{ ...S.td, fontWeight: 600 }}>
                        <EditableCell si={si} field="amountDue" type="number" style={{ fontWeight: 600 }} editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                      </td>
                    );
                    if (cKey === "status") return (
                      <td key={cKey} style={S.td}>
                        <select value={si.status} onChange={e => updateStatus(si.id, e.target.value)}
                          style={{ ...S.select, padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: statusBadgeStyle(si.status).background, color: statusBadgeStyle(si.status).color, border: "none", textDecoration: statusBadgeStyle(si.status).textDecoration || "none" }}>
                          {getServiceStatuses(si).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    );
                    if (cKey === "polStatus") {
                      const _pol = data.policies.find(p => p.id === si.policyId);
                      return (
                        <td key={cKey} style={S.td}>
                          {_pol ? (
                            <select value={_pol.status || "Active"}
                              style={{ ...S.select, padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: statusColor(_pol.status) + "18", color: statusColor(_pol.status), border: "none" }}
                              onChange={e => {
                                const newStatus = e.target.value;
                                if (newStatus === "Cancelled") return;
                                let updated = { ...data, policies: data.policies.map(p => p.id === si.policyId ? { ...p, status: newStatus } : p) };
                                updated = addActivity(updated, si.accountId, "status_change", `Policy status → ${newStatus}: ${_pol.carrier} — ${_pol.lob}`, _pol.policyNumber || "");
                                setData(updated);
                              }}>
                              {POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : <span style={{ color: COLORS.textDim, fontSize: 11 }}>—</span>}
                        </td>
                      );
                    }
                    if (cKey === "lastAction") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <EditableCell si={si} field="lastAction" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                      </td>
                    );
                    if (cKey === "lastActionDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <EditableCell si={si} field="lastActionDate" type="date" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                      </td>
                    );
                    if (cKey === "followUpDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <EditableCell si={si} field="followUpDate" type="date" style={{ color: si.followUpDate && si.followUpDate <= todayStr && !isCompleted ? "#c084fc" : COLORS.text, fontWeight: si.followUpDate && si.followUpDate <= todayStr && !isCompleted ? 700 : 400 }} editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                        {si.followUpDate && si.followUpDate < todayStr && !isCompleted && <span style={{ fontSize: 10, display: "block", color: "#c084fc" }}>DUE</span>}
                        {si.followUpDate && si.followUpDate === todayStr && !isCompleted && <span style={{ fontSize: 10, display: "block", color: "#fbbf24" }}>TODAY</span>}
                      </td>
                    );
                    if (cKey === "notes") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden" }}>
                        <EditableCell si={si} field="notes" style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }} editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} updateField={updateField} setEditingCell={setEditingCell} />
                      </td>
                    );
                    if (cKey === "actions") {
                      const phoneCt = attempts.filter(a => a.method === "Phone" || a.method === "Voicemail" || a.method === "In Person").length;
                      const emailCt = attempts.filter(a => a.method === "Email").length;
                      return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {[{m:"Phone",icon:"📞",ct:phoneCt},{m:"Email",icon:"✉",ct:emailCt}].map(({m,icon,ct}) => (
                            <span key={m} title={`Log ${m}`} style={{ cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4, background: quickContactId === si.id && quickMethod === m ? `${COLORS.accent}30` : "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }} onClick={() => quickLog(si.id, m)}>
                              <span>{icon}</span>
                              <span style={{ fontSize: 10, color: COLORS.textDim }}>{ct}</span>
                            </span>
                          ))}
                          <span title={mailCopied === si.id ? "Sent!" : `Open email (${detectOutreachType(si)})`} style={{ cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4, background: mailCopied === si.id ? `${COLORS.success}30` : "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }} onClick={() => copyMailto(si)}>
                            <span>{mailCopied === si.id ? "✓" : "📧"}</span>
                            <span style={{ fontSize: 8, color: mailCopied === si.id ? COLORS.success : COLORS.textDim, fontWeight: 600 }}>{mailCopied === si.id ? "Opened" : detectOutreachType(si).slice(0,3)}</span>
                          </span>
                        </div>
                        {quickContactId === si.id && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                              {["Payment reminder", "Renewal reminder", "Cancellation notice"].map(preset => (
                                <span key={preset} style={{ cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${COLORS.accent}20`, color: COLORS.accentLight, fontWeight: 600, whiteSpace: "nowrap" }}
                                  onClick={() => { setQuickNote(preset); }}>{preset}</span>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                            <input autoFocus style={{ ...S.input, padding: "3px 6px", fontSize: 11, flex: 1 }} placeholder={`${quickMethod} note...`} value={quickNote}
                              onChange={e => setQuickNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") quickLog(si.id, quickMethod); if (e.key === "Escape") { setQuickContactId(null); } }} />
                            <button style={{ ...S.btn(), padding: "2px 8px", fontSize: 10 }} onClick={() => quickLog(si.id, quickMethod)}>✓</button>
                            </div>
                          </div>
                        )}
                      </td>
                      );
                    }
                    return <td key={cKey} style={S.td}>—</td>;
                  })}
                </tr>
                {showNotes === si.id && (
                  <tr key={`notes-${si.id}`}>
                    <td colSpan={svColumns.length + 2} style={{ padding: "0 8px 8px 40px", background: `${COLORS.border}10`, borderBottom: `1px solid ${COLORS.border}15` }}>
                      <div style={{ display: "flex", alignItems: "start", gap: 8, padding: "8px 0" }}>
                        <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, minWidth: 40, paddingTop: 4 }}>Notes:</span>
                        <textarea
                          style={{ ...S.input, fontSize: 12, minHeight: 48, resize: "vertical", flex: 1, padding: "6px 8px", background: COLORS.bg }}
                          placeholder="Add notes about this service item..."
                          value={si.notes || ""}
                          onChange={e => { const v = e.target.value; const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, notes: v } : s) }; setData(updated); }}
                          
                        />
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              };

              if (viewMode === "grouped" && (filter === "active" || filter === "all")) {
                const groups = groupServiceItems(filteredItems, todayStr);
                return Object.entries(groups).map(([key, group]) => {
                  if (group.items.length === 0) return null;
                  // Sort items within each group by priority descending
                  const sorted = [...group.items].sort((a, b) => (b._pri.score || 0) - (a._pri.score || 0));
                  return (
                    <React.Fragment key={key}>
                      <tr><td colSpan={svColumns.length + 2} style={{ padding: "12px 8px 6px", fontWeight: 700, fontSize: 13, color: group.color, background: `${group.color}08`, borderBottom: `2px solid ${group.color}30`, letterSpacing: "0.3px" }}>
                        {group.label} <span style={{ fontWeight: 400, fontSize: 11, color: COLORS.textDim }}>({group.items.length})</span>
                      </td></tr>
                      {sorted.map(renderRow)}
                    </React.Fragment>
                  );
                });
              }
              // Flat mode
              return filteredItems.map(renderRow);
            })()}
            {filteredItems.length === 0 && <tr><td style={{ ...S.td, textAlign: "center", color: COLORS.textDim, padding: 32 }} colSpan={svColumns.length + 2}>No service items match this filter</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Contact Modal */}
      {showContact && (
        <Modal title="Log Contact Attempt" onClose={() => setShowContact(null)}>
          <FormField label="Method">
            <select style={S.input} value={contactForm.method} onChange={e => setContactForm({ ...contactForm, method: e.target.value })}>
              {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label="Notes"><input style={S.input} value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} placeholder="Brief note about contact..." /></FormField>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={S.btn()} onClick={() => logContact(showContact)}>Log Contact</button>
            <button style={S.btn("ghost")} onClick={() => setShowContact(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Add Service Item Modal */}
      {showAdd && (
        <Modal title="New Service Item" onClose={() => setShowAdd(false)}>
          <div style={S.grid(2)}>
            <FormField label="Account">
              <div style={{ position: "relative" }}>
                <input style={S.input} placeholder="Type client name..." value={acctSearch}
                  onChange={e => { setAcctSearch(e.target.value); if (form.accountId) setForm({ ...form, accountId: "", policyId: "" }); }} autoFocus />
                {acctSearch && !form.accountId && acctResults.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 99, left: 0, right: 0, border: `1px solid ${COLORS.border}`, borderRadius: 6, marginTop: 2, maxHeight: 180, overflowY: "auto", background: COLORS.card, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
                    {acctResults.map(a => (
                      <div key={a.id} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${COLORS.border}20` }}
                        onClick={() => { setForm({ ...form, accountId: a.id, policyId: "" }); setAcctSearch(a.name); }}
                        onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.type} | {a.phone || a.email || "No contact"}</div>
                      </div>
                    ))}
                  </div>
                )}
                {form.accountId && (
                  <div style={{ marginTop: 4, padding: "6px 10px", background: `${COLORS.accent}10`, borderRadius: 6, border: `1px solid ${COLORS.accent}30`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{acctSearch}</span>
                    <button style={{ background: "none", border: "none", color: COLORS.textDim, cursor: "pointer", fontSize: 14 }} onClick={() => { setForm({ ...form, accountId: "", policyId: "" }); setAcctSearch(""); }}>✕</button>
                  </div>
                )}
              </div>
            </FormField>
            <FormField label="Type">
              <select style={S.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Description"><input style={S.input} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." /></FormField>
          {form.accountId && accountPolicies.length > 0 && (
            <FormField label="Policy (optional)">
              <select style={S.input} value={form.policyId} onChange={e => setForm({ ...form, policyId: e.target.value })}>
                <option value="">— none —</option>
                {accountPolicies.map(p => <option key={p.id} value={p.id}>{p.carrier} — {p.lob} ({p.policyNumber})</option>)}
              </select>
            </FormField>
          )}
          <div style={S.grid(2)}>
            <FormField label="Due Date"><input style={S.input} type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></FormField>
            <FormField label="Amount Due"><input style={S.input} type="number" min="0" value={form.amountDue} onChange={e => setForm({ ...form, amountDue: e.target.value })} placeholder="0" /></FormField>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...S.btn(), opacity: form.accountId ? 1 : 0.5 }} onClick={handleAdd} disabled={!form.accountId}>Create</button>
            <button style={S.btn("ghost")} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Communication Template Modal */}
      {showTemplate && (
        <TemplateModal
          onClose={() => setShowTemplate(null)}
          accountName={showTemplate.accountName}
          policy={showTemplate.policy}
          data={data}
          config={config}
        />
      )}
      {renewalPopupSI && <RenewalPopup si={renewalPopupSI} data={data} setData={setData} config={config} onClose={() => setRenewalPopupSI(null)} />}

      {/* Quick Add Client + Policy Modal */}
      {showQuickClient && (
        <div style={S.overlay} onClick={() => setShowQuickClient(false)} data-modal="true">
          <div style={{ ...S.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{quickClientStep === 1 ? "➕ New Client" : "📋 Add Policy"}</div>
              <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setShowQuickClient(false)}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: quickClientStep >= 1 ? COLORS.accent : COLORS.border, color: quickClientStep >= 1 ? "#fff" : COLORS.textDim }}>1</div>
                <span style={{ fontSize: 12, fontWeight: quickClientStep === 1 ? 600 : 400, color: quickClientStep === 1 ? COLORS.text : COLORS.textDim }}>Client Info</span>
              </div>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: quickClientStep >= 2 ? COLORS.accent : COLORS.border, color: quickClientStep >= 2 ? "#fff" : COLORS.textDim }}>2</div>
                <span style={{ fontSize: 12, fontWeight: quickClientStep === 2 ? 600 : 400, color: quickClientStep === 2 ? COLORS.text : COLORS.textDim }}>Add Policy</span>
              </div>
            </div>

            {quickClientStep === 1 && (
              <div>
                <FormField label="Name *">
                  <input style={S.input} value={quickClientForm.name} onChange={e => setQuickClientForm({ ...quickClientForm, name: e.target.value })} placeholder="Client name" autoFocus />
                </FormField>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <FormField label="Type">
                    <select style={S.input} value={quickClientForm.type} onChange={e => setQuickClientForm({ ...quickClientForm, type: e.target.value })}>
                      <option value="Personal">Personal</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </FormField>
                  <FormField label="Phone">
                    <input style={S.input} value={quickClientForm.phone} onChange={e => setQuickClientForm({ ...quickClientForm, phone: e.target.value })} placeholder="Phone" />
                  </FormField>
                </div>
                <FormField label="Email">
                  <input style={S.input} value={quickClientForm.email} onChange={e => setQuickClientForm({ ...quickClientForm, email: e.target.value })} placeholder="Email" />
                </FormField>
                <FormField label="Address">
                  <input style={S.input} value={quickClientForm.address} onChange={e => setQuickClientForm({ ...quickClientForm, address: e.target.value })} placeholder="Street address" />
                </FormField>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                  <FormField label="City">
                    <input style={S.input} value={quickClientForm.city} onChange={e => setQuickClientForm({ ...quickClientForm, city: e.target.value })} />
                  </FormField>
                  <FormField label="State">
                    <input style={S.input} value={quickClientForm.state} onChange={e => setQuickClientForm({ ...quickClientForm, state: e.target.value })} />
                  </FormField>
                  <FormField label="Zip">
                    <input style={S.input} value={quickClientForm.zip} onChange={e => setQuickClientForm({ ...quickClientForm, zip: e.target.value })} placeholder="Zip" />
                  </FormField>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                  <button style={S.btn("ghost")} onClick={() => setShowQuickClient(false)}>Cancel</button>
                  <button
                    style={{ ...S.btn(), opacity: quickClientForm.name.trim() ? 1 : 0.5 }}
                    disabled={!quickClientForm.name.trim()}
                    onClick={() => {
                      const newId = uid();
                      const newAccount = {
                        id: newId,
                        name: quickClientForm.name.trim(),
                        type: quickClientForm.type,
                        phone: quickClientForm.phone,
                        email: quickClientForm.email,
                        address: quickClientForm.address,
                        city: quickClientForm.city,
                        state: quickClientForm.state,
                        zip: quickClientForm.zip,
                        status: "Active",
                        created: new Date().toISOString(),
                        policyType: "other",
                        lineOfBusiness: quickClientForm.type === "Commercial" ? "commercial" : "personal",
                        carrier: "",
                        autoItemCount: 0,
                        xDate: "",
                        xDateSource: "",
                        pipelineStatus: "new_lead",
                        serviceLog: [],
                        contacts: [],
                        roofYear: null,
                        windMitigation: "unknown",
                        constructionType: "",
                        propertyAddress: ""
                      };
                      let updated = { ...data, accounts: [...data.accounts, newAccount] };
                      updated = addActivity(updated, newId, "pipeline_created", `Account created: ${newAccount.name}`);
                      setData(updated, { undo: true, message: `Created "${newAccount.name}"` });
                      setQuickClientId(newId);
                      setQuickClientStep(2);
                    }}
                  >Create & Add Policy →</button>
                </div>
              </div>
            )}

            {quickClientStep === 2 && (() => {
              const createdAccount = data.accounts.find(a => a.id === quickClientId);
              const accountName = createdAccount ? createdAccount.name : "Client";
              const pf = quickPolicyForm;
              const lobOpts = config.lobOptions || LOB_OPTIONS;
              const carrierList = Object.keys(config.carrierGroups || {}).sort();

              const handleEffChange = (effDate) => {
                const exp = calcExpiration(effDate, pf.lob);
                setQuickPolicyForm({ ...pf, effectiveDate: effDate, expirationDate: exp });
              };
              const handleLobChange = (lob) => {
                const exp = pf.effectiveDate ? calcExpiration(pf.effectiveDate, lob) : pf.expirationDate;
                setQuickPolicyForm({ ...pf, lob, expirationDate: exp });
              };

              const handleAddPolicy = () => {
                const valErrors = validatePolicyFields({ premium: pf.premium, effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate) });
                if (valErrors.length > 0) { alert("Please fix:\n• " + valErrors.join("\n• ")); return; }
                const newPolId = uid();
                const newPol = {
                  id: newPolId, accountId: quickClientId, accountName: accountName, namedInsured: pf.namedInsured || "",
                  carrier: pf.carrier, lob: pf.lob, policyNumber: pf.policyNumber,
                  effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate),
                  premium: Number(pf.premium) || 0, status: "Active", paymentPlan: pf.paymentPlan,
                  vehicleCount: isAutoTermLob(pf.lob) ? 1 : 0, documents: {}, notes: ""
                };
                // Auto-create renewal service item if within renewal window
                const _expDate = normalizeDate(pf.expirationDate);
                const _daysToExp = _expDate ? daysBetween(todayStr, _expDate) : -1;
                const _renWindow = renewalWindow(pf.lob);
                let updated;
                if (_daysToExp >= 0 && _daysToExp <= _renWindow) {
                  const _renType = isCommercialLob(pf.lob) ? "Commercial Renewal" : (pf.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                  const newSI = {
                    id: uid(), type: _renType, accountId: quickClientId, accountName: accountName,
                    policyId: newPolId, policyNumber: pf.policyNumber, carrier: pf.carrier, lob: pf.lob,
                    description: `${pf.carrier} ${pf.lob} Renewal`, dueDate: _expDate || todayStr,
                    amountDue: Number(pf.premium) || 0, status: "Uncontacted", urgency: _daysToExp <= 14 ? "High" : "Medium",
                    assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
                    followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                  };
                  updated = { ...data, policies: [...data.policies, newPol], serviceItems: [...data.serviceItems, newSI] };
                } else {
                  updated = { ...data, policies: [...data.policies, newPol] };
                }
                updated = addActivity(updated, quickClientId, "status_change", `Policy added: ${pf.carrier} — ${pf.lob}`, pf.policyNumber || "");
                setData(updated);
                setShowQuickClient(false);
              };

              return (
                <div>
                  <div style={{ background: `${COLORS.success}15`, border: `1px solid ${COLORS.success}30`, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: COLORS.success }}>
                    ✓ Client <strong>{accountName}</strong> created. Now add their policy.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <FormField label="Carrier *">
                      <select style={S.input} value={pf.carrier} onChange={e => setQuickPolicyForm({ ...pf, carrier: e.target.value })}>
                        <option value="">Select carrier...</option>
                        {carrierList.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </FormField>
                    <FormField label="LOB">
                      <select style={S.input} value={pf.lob} onChange={e => handleLobChange(e.target.value)}>
                        {lobOpts.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Policy #">
                      <input style={S.input} value={pf.policyNumber} onChange={e => setQuickPolicyForm({ ...pf, policyNumber: e.target.value })} placeholder="Policy number" />
                    </FormField>
                    <FormField label="Named Insured">
                      <input style={S.input} value={pf.namedInsured || ""} onChange={e => setQuickPolicyForm({ ...pf, namedInsured: e.target.value })} placeholder="If different from account" />
                    </FormField>
                    <FormField label="Premium">
                      <input style={S.input} type="number" min="0" value={pf.premium} onChange={e => setQuickPolicyForm({ ...pf, premium: e.target.value })} placeholder="0" />
                    </FormField>
                    <FormField label="Effective Date">
                      <input style={S.input} type="date" value={pf.effectiveDate} onChange={e => handleEffChange(e.target.value)} />
                    </FormField>
                    <FormField label="Expiration Date">
                      <input style={S.input} type="date" value={pf.expirationDate} onChange={e => setQuickPolicyForm({ ...pf, expirationDate: e.target.value })} />
                    </FormField>
                  </div>
                  <FormField label="Payment Plan">
                    <select style={{ ...S.input, maxWidth: 200 }} value={pf.paymentPlan} onChange={e => setQuickPolicyForm({ ...pf, paymentPlan: e.target.value })}>
                      {["Annual","Semi-Annual","Quarterly","Monthly","EFT"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FormField>

                  <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                    <button style={S.btn("ghost")} onClick={() => setShowQuickClient(false)}>Skip Policy</button>
                    <button
                      style={{ ...S.btn(), opacity: pf.carrier ? 1 : 0.5 }}
                      disabled={!pf.carrier}
                      onClick={handleAddPolicy}
                    >Add Policy & Done</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}


// ==================== ALLSTATE HUB ====================
const AhEditableCell = ({ si, field, type = "text", style: cellStyle = {}, ahEditingCell, ahEditValue, setAhEditValue, ahUpdateField, setAhEditingCell }) => {
  const isEditing = ahEditingCell === `${si.id}-${field}`;
  const val = si[field] || "";
  if (isEditing) {
    return <input autoFocus type={type} value={ahEditValue}
      style={{ ...S.input, padding: "3px 6px", fontSize: 12, width: "100%", ...cellStyle }}
      onChange={e => setAhEditValue(e.target.value)}
      onBlur={() => { ahUpdateField(si.id, field, ahEditValue); setAhEditingCell(null); }}
      onKeyDown={e => { if (e.key === "Enter") { ahUpdateField(si.id, field, ahEditValue); setAhEditingCell(null); } if (e.key === "Escape") setAhEditingCell(null); }} />;
  }
  const display = type === "date" && val ? fmtShort(val) : type === "number" ? (val ? `$${Number(val).toLocaleString()}` : "—") : (val || "—");
  return <span style={{ cursor: "pointer", color: val ? (cellStyle.color || COLORS.text) : COLORS.textMuted, fontSize: 12, ...cellStyle }}
    onClick={() => { setAhEditingCell(`${si.id}-${field}`); setAhEditValue(val); }}>{display}</span>;
};

function AllstateHub({ data, setData, nav, navPol, config, setPage }) {
  const todayStr = today();
  const [search, setSearch] = useState("");
  const [renewalPopupSI, setRenewalPopupSI] = useState(null);
  const [showTemplate, setShowTemplate] = useState(null);
  const [ahTypeFilters, setAhTypeFilters] = useState(new Set(["Allstate Termination", "Allstate Cancel", "Allstate P-Cancel"]));

  const toggleTypeFilter = (type) => {
    setAhTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Service table state
  const [ahSortCol, setAhSortCol] = useState("dueDate");
  const [ahSortDir, setAhSortDir] = useState("asc");
  const [ahColFilters, setAhColFilters] = useState({});
  const [showAhFilters, setShowAhFilters] = useState(true);
  const ahActiveFilterCount = Object.values(ahColFilters).filter(v => v !== "").length;
  const [ahShowNotes, setAhShowNotes] = useState(null);
  const [ahEditingCell, setAhEditingCell] = useState(null);
  const [ahEditValue, setAhEditValue] = useState("");
  const [ahSelected, setAhSelected] = useState(new Set());
  const [ahViewMode, setAhViewMode] = useState("flat");
  const [ahQuickContactId, setAhQuickContactId] = useState(null);
  const [ahQuickMethod, setAhQuickMethod] = useState("");
  const [ahQuickNote, setAhQuickNote] = useState("");
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [ahMailCopied, setAhMailCopied] = useState(null);
  const [kanbanDragId, setKanbanDragId] = useState(null);
  const [kanbanDragOver, setKanbanDragOver] = useState(null);

  const ahCopyMailto = (si) => {
    copyMailtoToClipboard(si, data, config, () => {
      setAhMailCopied(si.id); setTimeout(() => setAhMailCopied(null), 2000);
      const tplType = detectOutreachType(si);
      const note = `${tplType.charAt(0).toUpperCase() + tplType.slice(1)} email (mailto copied)`;
      const newAttempt = { date: todayStr, method: "Email", notes: note };
      let updated = { ...data, serviceItems: data.serviceItems.map(s =>
        s.id === si.id ? { ...s, contactAttempts: [newAttempt, ...(s.contactAttempts || [])], lastAction: `Email: ${note}`, lastActionDate: todayStr, status: s.status !== "Done" ? "Emailed" : s.status } : s
      ) };
      updated = addActivity(updated, si.accountId, "contact_attempt", "Email contact (mailto)", note);
      setData(updated);
    });
  };

  // Column state
  const [ahColumns, setAhColumnsRaw] = useState(() => {
    try {
      const stored = localStorage.getItem(AH_COLS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedKeys = new Set(parsed.map(c => c.key));
        const merged = parsed.filter(c => SV_COL_MAP[c.key]).map(c => ({ ...c, width: c.width || SV_COL_MAP[c.key].width }));
        DEFAULT_SV_COLUMNS.forEach(c => { if (!storedKeys.has(c.key)) merged.push({ key: c.key, width: c.width }); });
        return merged;
      }
    } catch {}
    return DEFAULT_SV_COLUMNS.map(c => ({ key: c.key, width: c.width }));
  });
  const setAhColumns = (cols) => { setAhColumnsRaw(cols); try { localStorage.setItem(AH_COLS_STORAGE_KEY, JSON.stringify(cols)); } catch {} };
  const [ahDragCol, setAhDragCol] = useState(null);
  const [ahDragOverCol, setAhDragOverCol] = useState(null);
  const ahResizeRef = useRef(null);
  const handleAhResizeStart = (e, colKey) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const col = ahColumns.find(c => c.key === colKey);
    const startW = col ? col.width : 100;
    const onMove = (me) => {
      const delta = me.clientX - startX;
      const newW = Math.max(50, startW + delta);
      setAhColumnsRaw(prev => { const next = prev.map(c => c.key === colKey ? { ...c, width: newW } : c); try { localStorage.setItem(AH_COLS_STORAGE_KEY, JSON.stringify(next)); } catch {} return next; });
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const { accounts, policies, serviceItems, salesLog } = data;

  const policyMap = useMemo(() => {
    const map = {};
    for (const p of data.policies) map[p.id] = p;
    return map;
  }, [data.policies]);
  const siDisplayName = (si) => { const pol = policyMap[si.policyId]; return (pol && pol.namedInsured) || si.accountName; };

  const q = search.toLowerCase();
  const matchSearch = (name) => !search || (name || "").toLowerCase().includes(q);

  // Allstate policies
  const allstatePolicies = policies.filter(p => p.carrier === "Allstate" && matchSearch(accounts.find(a => a.id === p.accountId)?.name));
  const activePolicies = allstatePolicies.filter(p => p.status === "Active");
  const totalPremium = activePolicies.reduce((sum, p) => sum + (p.premium || 0), 0);

  // Allstate service items
  const allstatePolicyIds = useMemo(() => new Set(policies.filter(p => p.carrier === "Allstate").map(p => p.id)), [policies]);
  const allstateServiceItems = useMemo(() =>
    serviceItems.filter(si =>
      (allstatePolicyIds.has(si.policyId) || (si.type && si.type.toLowerCase().includes("allstate")))
      && matchSearch(si.accountName)
    ).map(si => ({ ...si, _tl: trafficZone(si.dueDate, todayStr) })),
  [serviceItems, allstatePolicyIds, search, todayStr]);

  const activeServiceItems = allstateServiceItems.filter(si => si.status !== "Done");
  const terminations = activeServiceItems.filter(si => si.type === "Allstate Termination" || si.type === "Allstate Cancel");
  const pCancels = activeServiceItems.filter(si => si.type === "Allstate P-Cancel");
  const overdueItems = activeServiceItems.filter(si => si._tl.zone === "critical");

  // Allstate sales this month
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const monthSales = salesLog.filter(s => { const d = new Date(s.date); return s.carrier === "Allstate" && d.getMonth() === thisMonth && d.getFullYear() === thisYear; });
  const monthAutoItems = monthSales.filter(s => s.lob === "Auto" && s.saleType !== "Rewrite").reduce((sum, s) => sum + (s.itemCount || 1), 0);
  const monthPremium = monthSales.reduce((sum, s) => sum + (s.premium || 0), 0);
  const quotaTarget = config.quotaTarget || 13;
  const quotaPct = Math.min(100, (monthAutoItems / quotaTarget) * 100);

  // Renewals coming up
  const upcomingRenewals = activePolicies.filter(p => {
    if (!p.expirationDate) return false;
    const days = daysBetween(todayStr, p.expirationDate);
    return days >= 0 && days <= 90;
  }).sort((a, b) => (a.expirationDate || "").localeCompare(b.expirationDate || ""));

  // LOB breakdown
  const lobBreakdown = {};
  activePolicies.forEach(p => {
    if (!lobBreakdown[p.lob]) lobBreakdown[p.lob] = { count: 0, premium: 0 };
    lobBreakdown[p.lob].count++;
    lobBreakdown[p.lob].premium += (p.premium || 0);
  });

  // Service table helpers (mirrors ServiceBoard)
  const getPolicy = (policyId) => policyMap[policyId] || {};
  const ahItems = useMemo(() => {
    let items = allstateServiceItems;
    // Filter by selected transaction types
    if (ahTypeFilters.size > 0) items = items.filter(si => ahTypeFilters.has(si.type));
    // Only show active (not Done)
    items = items.filter(si => si.status !== "Done");
    return items.map(si => { const _pol = policyMap[si.policyId]; return { ...si, _pri: calcPriority(si, todayStr, _pol && _pol.status), _tl: trafficZone(si.dueDate, todayStr) }; });
  }, [allstateServiceItems, ahTypeFilters, todayStr, policyMap]);

  const getAhCellValue = (si, key) => {
    const pol = getPolicy(si.policyId);
    if (key === "accountName") return si.accountName || "";
    if (key === "policyNumber") return pol.policyNumber || si.policyNumber || "";
    if (key === "carrier") return pol.carrier || si.carrier || "";
    if (key === "lob") return pol.lob || "";
    if (key === "effectiveDate") return pol.effectiveDate || "";
    if (key === "dueDate") return si.dueDate || "";
    if (key === "type") return si.type || "";
    if (key === "amountDue") return String(si.amountDue || 0);
    if (key === "status") return si.status || "";
    if (key === "polStatus") return pol.status || "";
    if (key === "lastAction") return si.lastAction || "";
    if (key === "lastActionDate") return si.lastActionDate || "";
    if (key === "followUpDate") return si.followUpDate || "";
    return si[key] || "";
  };

  const ahFilteredItems = useMemo(() => {
    if (ahActiveFilterCount === 0) return ahItems;
    return ahItems.filter(si => {
      for (const [key, val] of Object.entries(ahColFilters)) {
        if (!val) continue;
        const cellVal = getAhCellValue(si, key);
        const isDropdown = ["carrier","lob","status","polStatus","type"].includes(key);
        if (isDropdown ? cellVal !== val : !cellVal.toLowerCase().includes(val.toLowerCase())) return false;
      }
      return true;
    });
  }, [ahItems, ahColFilters, ahActiveFilterCount]);

  const ahDistinctVals = useMemo(() => {
    const vals = {};
    ["carrier","lob","status","polStatus","type"].forEach(key => {
      const set = new Set();
      ahItems.forEach(si => { const v = getAhCellValue(si, key); if (v) set.add(v); });
      vals[key] = [...set].sort();
    });
    return vals;
  }, [ahItems]);

  const ahSortedItems = useMemo(() => {
    return [...ahFilteredItems].sort((a, b) => {
      const isCompA = a.status === "Done"; const isCompB = b.status === "Done";
      if (isCompA !== isCompB) return isCompA ? 1 : -1;
      if (!isCompA && a._tl.sort !== b._tl.sort) return a._tl.sort - b._tl.sort;
      const dir = ahSortDir === "asc" ? 1 : -1;
      let av, bv;
      if (ahSortCol === "accountName") { av = (a.accountName || "").toLowerCase(); bv = (b.accountName || "").toLowerCase(); }
      else if (ahSortCol === "dueDate") { av = a.dueDate || "z"; bv = b.dueDate || "z"; }
      else if (ahSortCol === "type") { av = a.type || ""; bv = b.type || ""; }
      else if (ahSortCol === "amountDue") return dir * ((a.amountDue || 0) - (b.amountDue || 0));
      else if (ahSortCol === "status") { av = a.status || ""; bv = b.status || ""; }
      else if (ahSortCol === "polStatus") { const pa = policyMap[a.policyId]; const pb = policyMap[b.policyId]; av = pa ? pa.status : "zzz"; bv = pb ? pb.status : "zzz"; }
      else if (ahSortCol === "followUpDate") { av = a.followUpDate || "z"; bv = b.followUpDate || "z"; }
      else { av = getAhCellValue(a, ahSortCol); bv = getAhCellValue(b, ahSortCol); }
      if (av === undefined) av = ""; if (bv === undefined) bv = "";
      return dir * String(av).localeCompare(String(bv));
    });
  }, [ahFilteredItems, ahSortCol, ahSortDir, policyMap]);

  const ahUpdateField = (id, field, value) => {
    const si = data.serviceItems.find(s => s.id === id);
    const dateFields = ["dueDate", "lastActionDate", "followUpDate"];
    if (dateFields.includes(field) && value) value = normalizeDate(value);
    if (["amountDue"].includes(field)) value = Number(value) || 0;
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === id ? { ...s, [field]: value } : s) };
    if (field === "lastAction" && value && si) {
      updated = { ...updated, serviceItems: updated.serviceItems.map(s => s.id === id ? { ...s, lastActionDate: todayStr } : s) };
    }
    setData(updated);
  };

  const ahUpdateStatus = (id, newStatus) => {
    const si = data.serviceItems.find(s => s.id === id);
    if (!si) return;
    if (newStatus === "Renewed") { setRenewalPopupSI(si); return; }
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === id ? { ...s, status: newStatus, lastAction: `Status → ${newStatus}`, lastActionDate: todayStr } : s) };
    updated = addActivity(updated, si.accountId, "status_change", `Status → ${newStatus}`, si.description);
    if (newStatus === "Done") updated = safeActivateRenewalPolicy(updated, si);
    setData(updated);
  };

  const ahToggleBall = (id) => {
    const si = data.serviceItems.find(s => s.id === id);
    if (!si) return;
    const newVal = !si.ballInCourt;
    let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === id ? { ...s, ballInCourt: newVal } : s) };
    updated = addActivity(updated, si.accountId, "flag_change", `${newVal ? "Marked" : "Unmarked"} ball in their court`, si.description);
    setData(updated);
  };

  const kanbanDrop = (targetType) => {
    if (!kanbanDragId) return;
    const si = data.serviceItems.find(s => s.id === kanbanDragId);
    if (!si) return;
    if (targetType === "done") {
      let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === kanbanDragId ? { ...s, status: "Done", lastAction: "Moved to Done", lastActionDate: todayStr } : s) };
      updated = addActivity(updated, si.accountId, "status_change", `Service item completed: ${si.description || si.type}`, "");
      setData(updated, { undo: true, message: `Marked done: ${si.accountName || ""} ${si.type}` });
    } else if (si.type !== targetType) {
      let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === kanbanDragId ? { ...s, type: targetType } : s) };
      updated = addActivity(updated, si.accountId, "status_change", `Type changed: ${si.type} → ${targetType}`, si.description || "");
      setData(updated, { undo: true, message: `Moved to ${targetType}: ${si.accountName || ""}` });
    }
    setKanbanDragId(null);
    setKanbanDragOver(null);
  };

  const ahQuickLog = (siId, method) => {
    if (ahQuickContactId === siId && ahQuickMethod === method) {
      const si = data.serviceItems.find(s => s.id === siId);
      if (si) {
        const note = ahQuickNote.trim();
        const attempt = { date: todayStr, method, notes: note || `${method} contact` };
        const newStatus = ["Phone", "Voicemail", "In Person"].includes(method) ? "Called" : "Emailed";
        const noteText = note || `${method} contact`;
        let updated = { ...data, serviceItems: data.serviceItems.map(s => {
          if (s.id !== siId) return s;
          const prevNotes = (s.notes || "").trim();
          const noteEntry = `[${todayStr}] ${method}: ${noteText}`;
          const newNotes = prevNotes ? `${noteEntry}\n${prevNotes}` : noteEntry;
          return { ...s, contactAttempts: [...(s.contactAttempts || []), attempt], lastAction: noteText, lastActionDate: todayStr, status: s.status !== "Done" ? newStatus : s.status, notes: newNotes };
        }) };
        updated = addActivity(updated, si.accountId, "contact", `${method}: ${note || "(no notes)"}`, si.description);
        if (si.status !== "Done" && si.status !== newStatus) updated = addActivity(updated, si.accountId, "status_change", `Status auto-updated → ${newStatus}`, si.description);
        setData(updated);
      }
      setAhQuickContactId(null); setAhQuickNote("");
    } else {
      setAhQuickContactId(siId); setAhQuickMethod(method); setAhQuickNote("");
    }
  };

  const ahToggleAll = () => {
    if (ahSelected.size === ahFilteredItems.length) setAhSelected(new Set());
    else setAhSelected(new Set(ahFilteredItems.map(si => si.id)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ ...S.pageTitle, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, color: "#3b82f6" }}>★</span> Allstate Hub
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Filter by client..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>



      {/* Type Filters */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: COLORS.textDim, marginRight: 4 }}>Show:</span>
        {[
          { type: "Allstate Termination", label: "Terminations", color: COLORS.danger, count: allstateServiceItems.filter(si => si.type === "Allstate Termination" && si.status !== "Done").length },
          { type: "Allstate Cancel", label: "Cancels", color: COLORS.warning, count: allstateServiceItems.filter(si => si.type === "Allstate Cancel" && si.status !== "Done").length },
          { type: "Allstate P-Cancel", label: "P-Cancels", color: "#e879f9", count: allstateServiceItems.filter(si => si.type === "Allstate P-Cancel" && si.status !== "Done").length },
        ].map(f => {
          const active = ahTypeFilters.has(f.type);
          return (
            <span key={f.type} onClick={() => toggleTypeFilter(f.type)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: active ? `${f.color}18` : "transparent",
              border: `1.5px solid ${active ? f.color : COLORS.border}`,
              color: active ? f.color : COLORS.textDim,
              transition: "all 0.15s",
            }}>
              {f.label} ({f.count})
            </span>
          );
        })}
      </div>

      {/* SERVICE ITEMS */}
      {(() => {
        const activeCount = ahFilteredItems.filter(si => si.status !== "Done").length;
        const overdueCount = ahFilteredItems.filter(si => si.dueDate < todayStr && si.status !== "Done").length;
        return (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{ahFilteredItems.length} items</span>
            <span style={{ fontSize: 11, color: COLORS.textDim }}>({overdueCount} overdue)</span>
            <div style={{ flex: 1 }} />
            <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "3px 8px" }} onClick={() => setShowAhFilters(!showAhFilters)} title="Toggle column filters">
              {showAhFilters ? "Hide Filters" : "Show Filters"} {ahActiveFilterCount > 0 ? `(${ahActiveFilterCount})` : ""}
            </button>
            {ahActiveFilterCount > 0 && <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "3px 8px", color: COLORS.danger }} onClick={() => setAhColFilters({})}>✕ Clear</button>}
            <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 5, overflow: "hidden", marginLeft: 4 }}>
              {[{v:"table",icon:"☰"},{v:"kanban",icon:"▥"}].map(m => (
                <span key={m.v} onClick={() => setAhViewMode(m.v)} style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: ahViewMode === m.v ? 700 : 400, background: ahViewMode === m.v ? `${COLORS.accent}20` : "transparent", color: ahViewMode === m.v ? COLORS.accentLight : COLORS.textDim }}>{m.icon} {m.v.charAt(0).toUpperCase() + m.v.slice(1)}</span>
              ))}
            </div>
          </div>

          {/* Bulk actions */}
          {ahViewMode === "kanban" ? (
            <div style={{ display: "flex", gap: 12, overflow: "auto", paddingBottom: 8, minHeight: 400 }}>
              {[
                { type: "Allstate P-Cancel", label: "P-Cancel", color: "#e879f9", icon: "⚠" },
                { type: "Allstate Cancel", label: "Cancel", color: COLORS.warning, icon: "⛔" },
                { type: "Allstate Termination", label: "Termination", color: COLORS.danger, icon: "🚨" },
                { type: "done", label: "Done", color: COLORS.success, icon: "✓" },
              ].map(col => {
                const items = col.type === "done"
                  ? allstateServiceItems.filter(si => si.status === "Done" && matchSearch(si.accountName)).slice(0, 20)
                  : allstateServiceItems.filter(si => si.type === col.type && si.status !== "Done");
                return (
                  <div key={col.type}
                    onDragOver={e => { e.preventDefault(); setKanbanDragOver(col.type); }}
                    onDragLeave={() => setKanbanDragOver(null)}
                    onDrop={() => kanbanDrop(col.type)}
                    style={{ flex: 1, minWidth: 230, maxWidth: 320, background: kanbanDragOver === col.type ? `${col.color}12` : `${COLORS.card}80`, border: `1.5px ${kanbanDragOver === col.type ? "dashed" : "solid"} ${kanbanDragOver === col.type ? col.color : COLORS.border}`, borderRadius: 10, display: "flex", flexDirection: "column", transition: "all 0.15s" }}>
                    {/* Column header */}
                    <div style={{ padding: "12px 14px 8px", borderBottom: `2px solid ${col.color}30`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 14 }}>{col.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: col.color }}>{col.label}</span>
                      <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: `${col.color}18`, color: col.color, fontWeight: 700, marginLeft: "auto" }}>{items.length}</span>
                    </div>
                    {/* Cards */}
                    <div style={{ flex: 1, overflow: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.length === 0 && <div style={{ textAlign: "center", padding: 20, color: COLORS.textDim, fontSize: 11 }}>{col.type === "done" ? "No completed items" : "Drop items here"}</div>}
                      {items.map(si => {
                        const pol = getPolicy(si.policyId);
                        const tl = trafficZone(si.dueDate, todayStr);
                        const daysOut = si.dueDate ? daysBetween(todayStr, si.dueDate) : null;
                        return (
                          <div key={si.id} draggable={col.type !== "done"}
                            onDragStart={() => setKanbanDragId(si.id)}
                            onDragEnd={() => { setKanbanDragId(null); setKanbanDragOver(null); }}
                            style={{ padding: "10px 12px", borderRadius: 8, background: kanbanDragId === si.id ? `${COLORS.accent}15` : COLORS.bg, border: `1px solid ${kanbanDragId === si.id ? COLORS.accent : COLORS.border}40`, cursor: col.type !== "done" ? "grab" : "default", opacity: kanbanDragId === si.id ? 0.5 : 1, transition: "all 0.12s" }}>
                            {/* Client name */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
                              <span onClick={() => nav(si.accountId)} style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, cursor: "pointer" }}>{si.accountName || "—"}</span>
                              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: statusColor(si.status) + "18", color: statusColor(si.status), fontWeight: 600, whiteSpace: "nowrap" }}>{si.status}</span>
                            </div>
                            {/* Policy info */}
                            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>{pol.lob || si.lob || ""}{pol.policyNumber ? ` #${pol.policyNumber}` : ""}</div>
                            {/* Due date + actions */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              {si.dueDate ? (
                                <span style={{ fontSize: 10, fontWeight: 600, color: tl.color }}>
                                  {daysOut < 0 ? `${Math.abs(daysOut)}d overdue` : daysOut === 0 ? "Due today" : `${daysOut}d left`}
                                </span>
                              ) : <span />}
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <span title={ahMailCopied === si.id ? "Opened!" : `Open email (${detectOutreachType(si)})`} style={{ cursor: "pointer", fontSize: 11, padding: "2px 4px", borderRadius: 3, background: ahMailCopied === si.id ? `${COLORS.success}30` : "transparent" }} onClick={e => { e.stopPropagation(); ahCopyMailto(si); }}>
                                  {ahMailCopied === si.id ? "✓" : "📧"}
                                </span>
                                <span title="Open client" style={{ cursor: "pointer", fontSize: 11, padding: "2px 4px", borderRadius: 3 }} onClick={() => nav(si.accountId)}>→</span>
                              </div>
                            </div>
                            {/* Contact attempts */}
                            {(si.contactAttempts || []).length > 0 && (
                              <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 4, borderTop: `1px solid ${COLORS.border}30`, paddingTop: 4 }}>
                                {(si.contactAttempts || []).length} contact{(si.contactAttempts || []).length !== 1 ? "s" : ""} · last {si.lastActionDate || "—"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (<>
          {/* Bulk actions (table view) */}
          {ahSelected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 12px", background: `${COLORS.danger}10`, borderRadius: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{ahSelected.size} selected</span>
              {!confirmBulkDel ? (
                <button style={{ ...S.btn(), background: COLORS.danger, fontSize: 11, padding: "3px 10px" }} onClick={() => setConfirmBulkDel(true)}>Delete</button>
              ) : (
                <>
                  <button style={{ ...S.btn(), background: COLORS.danger, fontSize: 11, padding: "3px 10px" }} onClick={() => {
                    let updated = { ...data, serviceItems: data.serviceItems.filter(s => !ahSelected.has(s.id)) };
                    setData(updated, { undo: true, message: `Deleted ${ahSelected.size} items` });
                    setAhSelected(new Set()); setConfirmBulkDel(false);
                  }}>Confirm Delete</button>
                  <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "3px 10px" }} onClick={() => setConfirmBulkDel(false)}>Cancel</button>
                </>
              )}
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...S.table, tableLayout: "fixed", minWidth: ahColumns.reduce((s, c) => s + c.width, 60) }}>
              <colgroup>
                <col style={{ width: 36 }} />
                {ahColumns.map(c => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 3 }}>
                <th style={{ ...S.th, width: 36, textAlign: "center" }}><input type="checkbox" checked={ahFilteredItems.length > 0 && ahSelected.size === ahFilteredItems.length} onChange={ahToggleAll} style={{ cursor: "pointer" }} /></th>
                {ahColumns.map(col => {
                  const meta = SV_COL_MAP[col.key];
                  if (!meta) return null;
                  return (
                    <th key={col.key}
                      draggable={col.key !== "actions"}
                      onDragStart={() => setAhDragCol(col.key)}
                      onDragOver={e => { e.preventDefault(); setAhDragOverCol(col.key); }}
                      onDrop={() => {
                        if (ahDragCol && ahDragCol !== col.key) {
                          const from = ahColumns.findIndex(c => c.key === ahDragCol);
                          const to = ahColumns.findIndex(c => c.key === col.key);
                          const next = [...ahColumns]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
                          setAhColumns(next);
                        }
                        setAhDragCol(null); setAhDragOverCol(null);
                      }}
                      onDragEnd={() => { setAhDragCol(null); setAhDragOverCol(null); }}
                      style={{ ...S.th, cursor: meta.sortable ? "pointer" : "default", userSelect: "none", position: "relative",
                        background: ahDragOverCol === col.key ? `${COLORS.accent}20` : S.th.background,
                        borderRight: `1px solid ${COLORS.border}40` }}
                      onClick={() => { if (!meta.sortable) return; setAhSortCol(prev => { setAhSortDir(prev === col.key ? (ahSortDir === "asc" ? "desc" : "asc") : "asc"); return col.key; }); }}>
                      <span style={{ fontSize: 11 }}>{meta.label}{ahSortCol === col.key ? (ahSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      {col.key !== "actions" && (
                        <span style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", background: "transparent" }}
                          onMouseDown={e => handleAhResizeStart(e, col.key)} onClick={e => e.stopPropagation()}
                          onMouseEnter={e => e.currentTarget.style.background = COLORS.accent + "40"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"} />
                      )}
                    </th>
                  );
                })}
              </tr>
              {showAhFilters && (
                <tr style={{ position: "sticky", top: 39, zIndex: 2 }}>
                  <th style={{ padding: "4px 6px", background: COLORS.card }}></th>
                  {ahColumns.map(col => {
                    const fVal = ahColFilters[col.key] || "";
                    const filterStyle = { width: "100%", padding: "3px 4px", fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 3, background: COLORS.bg, color: COLORS.text, outline: "none", boxSizing: "border-box" };
                    const isDropdown = ["carrier","lob","status","polStatus","type"].includes(col.key);
                    if (col.key === "actions") return <th key={col.key} style={{ padding: "4px 6px", background: COLORS.card }}></th>;
                    return (
                      <th key={col.key} style={{ padding: "4px 6px", background: COLORS.card, borderBottom: `2px solid ${COLORS.accent}40`, borderRight: `1px solid ${COLORS.border}40` }}>
                        {isDropdown ? (
                          <select style={{ ...filterStyle, cursor: "pointer" }} value={fVal}
                            onChange={e => setAhColFilters(prev => ({ ...prev, [col.key]: e.target.value }))}>
                            <option value="">All</option>
                            {(ahDistinctVals[col.key] || []).map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : (
                          <input style={filterStyle} type="text" placeholder="Filter..." value={fVal}
                            onChange={e => setAhColFilters(prev => ({ ...prev, [col.key]: e.target.value }))} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              )}
              </thead>
              <tbody>
                {ahSortedItems.map(si => {
                  const pol = getPolicy(si.policyId);
                  const attempts = si.contactAttempts || [];
                  const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                  const isCompleted = si.status === "Done";
                  const polReqCancel = pol && pol.status === "Requested Cancel";
                  const isBallInCourt = si.ballInCourt;
                  const rowOpacity = isCompleted || polReqCancel ? 0.4 : isBallInCourt ? 0.5 : 1;
                  const isAllstate = si.type && si.type.toLowerCase().includes("allstate");
                  const barColor = isAllstate ? "#3b82f6" : txnColor;
                  const isCritical = !isCompleted && si._tl.zone === "critical";
                  const staleDays = si.lastActionDate ? Math.max(0, -daysBetween(todayStr, si.lastActionDate)) : (si.created ? Math.max(0, -daysBetween(todayStr, si.created)) : 0);
                  const rowBg = ahSelected.has(si.id) ? `${COLORS.accent}12` : isCritical ? si._tl.rowBg : `${barColor}08`;
                  return (<React.Fragment key={si.id}>
                <tr style={{ opacity: rowOpacity, background: rowBg }}>
                  <td style={{ ...S.td, textAlign: "center", width: 36 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={ahSelected.has(si.id)} onChange={() => { const next = new Set(ahSelected); if (next.has(si.id)) next.delete(si.id); else next.add(si.id); setAhSelected(next); }} style={{ cursor: "pointer" }} />
                  </td>
                  {ahColumns.map(col => {
                    const cKey = col.key;
                    if (cKey === "accountName") return (
                      <td key={cKey} style={{ ...S.td, fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <AccountLink accountId={si.accountId} name={siDisplayName(si)} nav={nav} />
                        </div>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                          {polReqCancel && !isCompleted && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", fontWeight: 600 }}>REQ CANCEL</span>}
                          {si.ballInCourt && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "#fbbf2420", color: "#fbbf24", fontWeight: 600 }}>THEIR COURT</span>}
                          {(si.flags || []).map(f => { const fb = flagBadgeStyle(f); return <span key={f} title={f} style={{ fontSize: 9, background: fb.background, color: fb.color, padding: "1px 4px", borderRadius: 3, fontWeight: 600 }}>{fb.icon}</span>; })}
                          {staleDays >= 14 && !isCompleted && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "#ef444420", color: "#ef4444", fontWeight: 600 }}>STALE {staleDays}d</span>}
                        </div>
                      </td>
                    );
                    if (cKey === "policyNumber") { const polNum = pol.policyNumber || si.policyNumber || ""; return (
                      <td key={cKey} style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {si.policyId ? <span style={{ cursor: "pointer", color: COLORS.accentLight, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => navPol(si.policyId)}>{polNum || "—"}</span> : <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{polNum || "—"}</span>}
                          {polNum && <button style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", fontSize: 12, color: COLORS.textMuted, flexShrink: 0, lineHeight: 1 }} title="Copy policy #" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(polNum); e.currentTarget.textContent = "✓"; setTimeout(() => { if (e.currentTarget) e.currentTarget.textContent = "⧉"; }, 1200); }}>⧉</button>}
                        </div>
                      </td>
                    ); }
                    if (cKey === "effectiveDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap", fontSize: 11, color: COLORS.textDim }}>{pol.effectiveDate ? fmt(pol.effectiveDate) : "—"}</td>
                    );
                    if (cKey === "carrier") return (
                      <td key={cKey} style={{ ...S.td, fontSize: 12 }}>{pol.carrier || si.carrier || "—"}</td>
                    );
                    if (cKey === "lob") return (
                      <td key={cKey} style={{ ...S.td, fontSize: 12 }}>{pol.lob || "—"}</td>
                    );
                    if (cKey === "dueDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap", background: !isCompleted && si._tl.zone !== "none" && si._tl.zone !== "critical" ? si._tl.bg : "transparent" }}>
                        <AhEditableCell si={si} field="dueDate" type="date" style={{ color: !isCompleted ? si._tl.color : COLORS.textMuted, fontWeight: si._tl.zone === "critical" || si._tl.zone === "red" ? 700 : 400 }} ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} />
                      </td>
                    );
                    if (cKey === "type") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden" }}>
                        <select value={si.type} onChange={e => ahUpdateField(si.id, "type", e.target.value)}
                          style={{ ...S.select, padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: `${txnColor}20`, color: txnColor, border: `1px solid ${txnColor}40`, cursor: "pointer", maxWidth: "100%" }}>
                          {(config.transactionTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                          {si.type && !(config.transactionTypes || []).includes(si.type) && <option value={si.type}>{si.type}</option>}
                        </select>
                      </td>
                    );
                    if (cKey === "amountDue") return (
                      <td key={cKey} style={{ ...S.td, fontWeight: 600 }}><AhEditableCell si={si} field="amountDue" type="number" style={{ fontWeight: 600 }} ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} /></td>
                    );
                    if (cKey === "status") return (
                      <td key={cKey} style={S.td}>
                        <select value={si.status} onChange={e => ahUpdateStatus(si.id, e.target.value)}
                          style={{ ...S.select, padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: statusBadgeStyle(si.status).background, color: statusBadgeStyle(si.status).color, border: "none", textDecoration: statusBadgeStyle(si.status).textDecoration || "none" }}>
                          {getServiceStatuses(si).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    );
                    if (cKey === "polStatus") {
                      const _pol = policyMap[si.policyId];
                      return (
                        <td key={cKey} style={S.td}>
                          {_pol ? (
                            <select value={_pol.status || "Active"}
                              style={{ ...S.select, padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: statusColor(_pol.status) + "18", color: statusColor(_pol.status), border: "none" }}
                              onChange={e => {
                                const newStatus = e.target.value;
                                if (newStatus === "Cancelled") return;
                                let updated = { ...data, policies: data.policies.map(p => p.id === si.policyId ? { ...p, status: newStatus } : p) };
                                updated = addActivity(updated, si.accountId, "status_change", `Policy status → ${newStatus}: ${_pol.carrier} — ${_pol.lob}`, _pol.policyNumber || "");
                                setData(updated);
                              }}>
                              {POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : <span style={{ color: COLORS.textDim, fontSize: 11 }}>—</span>}
                        </td>
                      );
                    }
                    if (cKey === "lastAction") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden", textOverflow: "ellipsis" }}><AhEditableCell si={si} field="lastAction" ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} /></td>
                    );
                    if (cKey === "lastActionDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}><AhEditableCell si={si} field="lastActionDate" type="date" ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} /></td>
                    );
                    if (cKey === "followUpDate") return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <AhEditableCell si={si} field="followUpDate" type="date" style={{ color: si.followUpDate && si.followUpDate <= todayStr && !isCompleted ? "#c084fc" : COLORS.text, fontWeight: si.followUpDate && si.followUpDate <= todayStr && !isCompleted ? 700 : 400 }} ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} />
                        {si.followUpDate && si.followUpDate < todayStr && !isCompleted && <span style={{ fontSize: 10, display: "block", color: "#c084fc" }}>DUE</span>}
                      </td>
                    );
                    if (cKey === "notes") return (
                      <td key={cKey} style={{ ...S.td, overflow: "hidden" }}>
                        <AhEditableCell si={si} field="notes" style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }} ahEditingCell={ahEditingCell} ahEditValue={ahEditValue} setAhEditValue={setAhEditValue} ahUpdateField={ahUpdateField} setAhEditingCell={setAhEditingCell} />
                      </td>
                    );
                    if (cKey === "actions") {
                      const phoneCt = attempts.filter(a => a.method === "Phone" || a.method === "Voicemail" || a.method === "In Person").length;
                      const emailCt = attempts.filter(a => a.method === "Email").length;
                      return (
                      <td key={cKey} style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {[{m:"Phone",icon:"📞",ct:phoneCt},{m:"Email",icon:"✉",ct:emailCt}].map(({m,icon,ct}) => (
                            <span key={m} title={`Log ${m}`} style={{ cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4, background: ahQuickContactId === si.id && ahQuickMethod === m ? `${COLORS.accent}30` : "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }} onClick={() => ahQuickLog(si.id, m)}>
                              <span>{icon}</span>
                              <span style={{ fontSize: 10, color: COLORS.textDim }}>{ct}</span>
                            </span>
                          ))}
                          <span title={ahMailCopied === si.id ? "Opened!" : `Open email (${detectOutreachType(si)})`} style={{ cursor: "pointer", fontSize: 13, padding: "2px 6px", borderRadius: 4, background: ahMailCopied === si.id ? `${COLORS.success}30` : "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }} onClick={() => ahCopyMailto(si)}>
                            <span>{ahMailCopied === si.id ? "✓" : "📧"}</span>
                            <span style={{ fontSize: 8, color: ahMailCopied === si.id ? COLORS.success : COLORS.textDim, fontWeight: 600 }}>{ahMailCopied === si.id ? "Opened" : detectOutreachType(si).slice(0,3)}</span>
                          </span>
                        </div>
                        {ahQuickContactId === si.id && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                              {["Payment reminder", "Renewal reminder", "Cancellation notice"].map(preset => (
                                <span key={preset} style={{ cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 3, background: `${COLORS.accent}20`, color: COLORS.accentLight, fontWeight: 600, whiteSpace: "nowrap" }}
                                  onClick={() => { setAhQuickNote(preset); }}>{preset}</span>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                            <input autoFocus style={{ ...S.input, padding: "3px 6px", fontSize: 11, flex: 1 }} placeholder={`${ahQuickMethod} note...`} value={ahQuickNote}
                              onChange={e => setAhQuickNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ahQuickLog(si.id, ahQuickMethod); if (e.key === "Escape") setAhQuickContactId(null); }} />
                            <button style={{ ...S.btn(), padding: "2px 8px", fontSize: 10 }} onClick={() => ahQuickLog(si.id, ahQuickMethod)}>✓</button>
                            </div>
                          </div>
                        )}
                      </td>
                      );
                    }
                    return <td key={cKey} style={S.td}>—</td>;
                  })}
                </tr>
                {ahShowNotes === si.id && (
                  <tr>
                    <td colSpan={ahColumns.length + 1} style={{ padding: "0 8px 8px 40px", background: `${COLORS.border}10`, borderBottom: `1px solid ${COLORS.border}15` }}>
                      <div style={{ display: "flex", alignItems: "start", gap: 8, padding: "8px 0" }}>
                        <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, minWidth: 40, paddingTop: 4 }}>Notes:</span>
                        <textarea style={{ ...S.input, fontSize: 12, minHeight: 48, resize: "vertical", flex: 1, padding: "6px 8px", background: COLORS.bg }}
                          placeholder="Add notes..." value={si.notes || ""}
                          onChange={e => { const v = e.target.value; const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, notes: v } : s) }; setData(updated); }} />
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>);
                })}
                {ahSortedItems.length === 0 && <tr><td colSpan={ahColumns.length + 1} style={{ ...S.td, textAlign: "center", color: COLORS.textDim, padding: 32 }}>No Allstate service items match this filter</td></tr>}
              </tbody>
            </table>
          </div>
          </>)}
        </div>
        );
      })()}
      {renewalPopupSI && <RenewalPopup si={renewalPopupSI} data={data} setData={setData} config={config} onClose={() => setRenewalPopupSI(null)} />}
      {showTemplate && <TemplateModal onClose={() => setShowTemplate(null)} accountName={showTemplate.accountName} policy={showTemplate.policy} data={data} config={config} />}
    </div>
  );
}

// ==================== PIPELINE ====================
function Pipeline({ data, setData, nav, config }) {
  const todayStr = today();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [showConvert, setShowConvert] = useState(null); // prospect being converted
  const [convertForm, setConvertForm] = useState({});
  const [selectedProspect, setSelectedProspectRaw] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const setSelectedProspect = (p) => {
    setSelectedProspectRaw(p);
    if (p) setEditForm({ ...p });
    else setEditForm(null);
  };
  const saveAndCloseProspect = () => {
    if (editForm && selectedProspect) {
      const updated = { ...data, prospects: data.prospects.map(x => x.id === editForm.id ? { ...editForm } : x) };
      setData(updated);
    }
    setSelectedProspectRaw(null);
    setEditForm(null);
  };
  const [form, setForm] = useState({ firstName: "", lastName: "", business: "", phone: "", email: "", source: "Referral", sourceDetail: "", lob: "Auto", estimatedPremium: "", stage: "New Lead", zip: "", xDate: "", currentCarrier: "" });

  const stages = PIPELINE_STAGES.filter(s => s !== "Won" && s !== "Lost");

  const deleteProspect = (id) => {
    const p = data.prospects.find(x => x.id === id);
    const updated = { ...data, prospects: data.prospects.filter(x => x.id !== id) };
    setData(updated, { undo: true, message: `Deleted prospect: ${p?.firstName || ""} ${p?.lastName || ""}`.trim() });
    setSelectedProspect(null);
  };

  const handleAdd = () => {
    if (!form.firstName.trim() && !form.business.trim()) return;
    const newP = { ...form, id: uid(), estimatedPremium: Number(form.estimatedPremium) || 0, created: todayStr };
    const updated = { ...data, prospects: [...data.prospects, newP] };
    const displayName = form.business || `${form.firstName} ${form.lastName}`.trim();
    setData(updated, { undo: true, message: `Added prospect: ${displayName}` });
    setShowAdd(false);
    setForm({ firstName: "", lastName: "", business: "", phone: "", email: "", source: "Referral", sourceDetail: "", lob: "Auto", estimatedPremium: "", stage: "New Lead", zip: "", xDate: "", currentCarrier: "" });
  };

  const moveStage = (id, stage) => {
    if (stage === "Won") {
      // Open conversion wizard instead of just marking Won
      const prospect = data.prospects.find(p => p.id === id);
      if (!prospect) return;
      const name = prospect.business || `${prospect.firstName} ${prospect.lastName}`;
      setConvertForm({
        prospectId: id,
        // Account
        accountName: name,
        accountType: prospect.business ? "Commercial" : "Personal",
        phone: prospect.phone || "",
        email: prospect.email || "",
        zip: prospect.zip || "",
        // Policy
        carrier: "Allstate",
        lob: prospect.lob || "Auto",
        policyNumber: "",
        effectiveDate: todayStr,
        expirationDate: "",
        premium: prospect.estimatedPremium || "",
        paymentPlan: "Monthly",
        vehicleCount: 1,
        // Sales log
        saleType: "New Business",
        source: prospect.source || "Referral",
        itemCount: 1,
      });
      setShowConvert(prospect);
      return;
    }
    const updated = { ...data, prospects: data.prospects.map(p => p.id === id ? { ...p, stage } : p) };
    setData(updated);
  };

  const handleConvert = () => {
    const f = convertForm;
    // 1. Create account
    const newAccount = { id: uid(), name: f.accountName, type: f.accountType, phone: f.phone, email: f.email, address: "", city: "Fort Lauderdale", state: "FL", zip: f.zip, status: "Active", created: todayStr, policyType: "other", lineOfBusiness: f.accountType === "Commercial" ? "commercial" : "personal", carrier: f.carrier || "", autoItemCount: 0, xDate: f.expirationDate || "", xDateSource: "", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "bound", serviceLog: [] };
    // 2. Create policy
    const docTypes = getDocTypes(f.lob);
    const docs = {}; docTypes.forEach(d => docs[d] = false);
    const isAuto = f.lob === "Auto" || f.lob === "Commercial Auto";
    const newPolicy = { id: uid(), accountId: newAccount.id, accountName: newAccount.name, carrier: f.carrier, lob: f.lob, policyNumber: f.policyNumber, effectiveDate: f.effectiveDate, expirationDate: f.expirationDate, premium: Number(f.premium) || 0, status: "Active", paymentPlan: f.paymentPlan, vehicleCount: isAuto ? (Number(f.vehicleCount) || 1) : 0, documents: docs, notes: "" };
    // 3. Create sales log entry
    const saleEntry = { id: uid(), date: todayStr, accountName: newAccount.name, lob: f.lob, premium: Number(f.premium) || 0, carrier: f.carrier, source: f.source, saleType: f.saleType, zip: f.zip, itemCount: isAuto ? (Number(f.itemCount) || 1) : 1 };
    // 4. Mark prospect as Won
    let updated = {
      ...data,
      accounts: [...data.accounts, newAccount],
      policies: [...data.policies, newPolicy],
      salesLog: [...data.salesLog, saleEntry],
      prospects: data.prospects.map(p => p.id === f.prospectId ? { ...p, stage: "Won" } : p),
    };
    updated = addActivity(updated, newAccount.id, "note", "Account created from pipeline conversion", `Source: ${f.source} · ${f.lob} · $${Number(f.premium || 0).toLocaleString()}`);
    setData(updated);
    setShowConvert(null);
    setConvertForm({});
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Sales Pipeline</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Search prospects..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn()} onClick={() => setShowAdd(true)}>+ New Prospect</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {stages.map(stage => {
          const stageProspects = data.prospects.filter(p => {
            if (p.stage !== stage) return false;
            if (!search) return true;
            const q = search.toLowerCase();
            return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.business || "").toLowerCase().includes(q) || (p.lob || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q) || (p.currentCarrier || "").toLowerCase().includes(q);
          });
          const stageValue = stageProspects.reduce((s, p) => s + (p.estimatedPremium || 0), 0);
          return (
            <div key={stage} style={{ minWidth: 240, flex: "1 0 240px" }}>
              <div style={{ padding: "10px 14px", background: COLORS.card, borderRadius: "8px 8px 0 0", border: `1px solid ${COLORS.border}`, borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{stage}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{stageProspects.length} • ${stageValue.toLocaleString()}</div>
              </div>
              <div style={{ background: `${COLORS.card}80`, border: `1px solid ${COLORS.border}`, borderRadius: "0 0 8px 8px", minHeight: 200, padding: 8 }}>
                {stageProspects.map(p => {
                  const xDays = p.xDate ? daysBetween(todayStr, p.xDate) : null;
                  return (
                  <div key={p.id} style={{ background: COLORS.card, border: `1px solid ${xDays !== null && xDays >= 0 && xDays <= 14 ? COLORS.warning : COLORS.border}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: "pointer" }}
                    onClick={() => setSelectedProspect(p)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.accent}
                    onMouseLeave={e => e.currentTarget.style.borderColor = xDays !== null && xDays >= 0 && xDays <= 14 ? COLORS.warning : COLORS.border}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</div>
                    {p.business && <div style={{ fontSize: 11, color: COLORS.textDim }}>{p.business}</div>}
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>{p.lob} • ${(p.estimatedPremium || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{p.source}{p.sourceDetail ? ` — ${p.sourceDetail}` : ""}</div>
                    {p.currentCarrier && <div style={{ fontSize: 11, color: COLORS.textMuted }}>Current: {p.currentCarrier}</div>}
                    {p.xDate && (
                      <div style={{ marginTop: 4, padding: "3px 8px", borderRadius: 4, background: xDays <= 0 ? `${COLORS.danger}20` : xDays <= 14 ? `${COLORS.warning}20` : xDays <= 30 ? `${COLORS.success}20` : `${COLORS.border}`, display: "inline-block" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: xDays <= 0 ? COLORS.danger : xDays <= 14 ? COLORS.warning : xDays <= 30 ? COLORS.success : COLORS.textDim }}>
                          🎯 X-Date: {fmtShort(p.xDate)} {xDays <= 0 ? "(expired)" : `(${xDays}d)`}
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                      {PIPELINE_STAGES.filter(s => s !== p.stage).map(s => (
                        <button key={s} style={{ ...S.btn(s === "Won" ? undefined : "ghost"), padding: "2px 8px", fontSize: 10, border: s === "Won" ? "none" : `1px solid ${COLORS.border}`, background: s === "Won" ? COLORS.success : s === "Lost" ? `${COLORS.danger}20` : undefined, color: s === "Lost" ? COLORS.danger : undefined }} onClick={() => moveStage(p.id, s)}>
                          {s === "Won" ? "✓ Convert & Close" : s === "Lost" ? "✕ Lost" : `→ ${s}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prospect Detail Modal */}
      {editForm && !showConvert && (() => {
        const p = editForm;
        const xDays = p.xDate ? daysBetween(todayStr, p.xDate) : null;
        const inputStyle = { ...S.input, fontSize: 12 };
        const ef = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));
        return (
          <Modal title={`${p.firstName} ${p.lastName}${p.business ? ` — ${p.business}` : ""}`} onClose={saveAndCloseProspect}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={S.badge(statusColor(p.stage))}>{p.stage}</span>
                {xDays !== null && <span style={{ fontSize: 11, color: xDays <= 0 ? COLORS.danger : xDays <= 14 ? COLORS.warning : COLORS.textDim }}>🎯 X-Date: {fmtShort(p.xDate)} {xDays <= 0 ? "(expired)" : `(${xDays}d)`}</span>}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>Created {fmt(p.created)}</div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>CONTACT INFO</div>
            <div style={S.grid(2)}>
              <FormField label="First Name"><input style={inputStyle} value={p.firstName} onChange={e => ef("firstName", e.target.value)} /></FormField>
              <FormField label="Last Name"><input style={inputStyle} value={p.lastName} onChange={e => ef("lastName", e.target.value)} /></FormField>
            </div>
            <FormField label="Business Name"><input style={inputStyle} value={p.business || ""} onChange={e => ef("business", e.target.value)} placeholder="If commercial" /></FormField>
            <div style={S.grid(2)}>
              <FormField label="Phone"><input style={inputStyle} value={p.phone || ""} onChange={e => ef("phone", e.target.value)} /></FormField>
              <FormField label="Email"><input style={inputStyle} value={p.email || ""} onChange={e => ef("email", e.target.value)} /></FormField>
            </div>
            <FormField label="Zip"><input style={inputStyle} value={p.zip || ""} onChange={e => ef("zip", e.target.value)} /></FormField>

            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginTop: 16, marginBottom: 8 }}>OPPORTUNITY</div>
            <div style={S.grid(2)}>
              <FormField label="LOB Interest">
                <select style={inputStyle} value={p.lob} onChange={e => ef("lob", e.target.value)}>
                  {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </FormField>
              <FormField label="Est. Premium"><input style={inputStyle} type="number" min="0" value={p.estimatedPremium || ""} onChange={e => ef("estimatedPremium", Number(e.target.value) || 0)} /></FormField>
            </div>
            <div style={S.grid(2)}>
              <FormField label="Current Carrier"><input style={inputStyle} value={p.currentCarrier || ""} onChange={e => ef("currentCarrier", e.target.value)} /></FormField>
              <FormField label="X-Date"><input style={inputStyle} type="date" value={p.xDate || ""} onChange={e => ef("xDate", e.target.value)} /></FormField>
            </div>
            <div style={S.grid(2)}>
              <FormField label="Source">
                <select style={inputStyle} value={p.source} onChange={e => ef("source", e.target.value)}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Source Detail"><input style={inputStyle} value={p.sourceDetail || ""} onChange={e => ef("sourceDetail", e.target.value)} /></FormField>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginTop: 16, marginBottom: 8 }}>STAGE</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PIPELINE_STAGES.filter(s => s !== p.stage).map(s => (
                <button key={s} style={{ ...S.btn(s === "Won" ? undefined : "ghost"), padding: "4px 12px", fontSize: 11, border: s === "Won" ? "none" : `1px solid ${COLORS.border}`, background: s === "Won" ? COLORS.success : s === "Lost" ? `${COLORS.danger}20` : undefined, color: s === "Lost" ? COLORS.danger : undefined }} onClick={() => { saveAndCloseProspect(); moveStage(p.id, s); }}>
                  {s === "Won" ? "✓ Convert & Close" : s === "Lost" ? "✕ Lost" : `→ ${s}`}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
              <button style={{ ...S.btn("ghost"), color: COLORS.danger, fontSize: 11 }} onClick={() => { if (confirm(`Delete prospect ${p.firstName} ${p.lastName}?`)) { setSelectedProspectRaw(null); setEditForm(null); deleteProspect(p.id); } }}>🗑️ Delete Prospect</button>
              <button style={S.btn()} onClick={saveAndCloseProspect}>Save & Close</button>
            </div>
          </Modal>
        );
      })()}

      {/* Conversion Wizard Modal */}
      {showConvert && (
        <Modal title={`🎉 Convert — ${showConvert.firstName} ${showConvert.lastName}`} onClose={() => setShowConvert(null)}>
          <div style={{ padding: "8px 12px", background: `${COLORS.success}10`, borderRadius: 6, border: `1px solid ${COLORS.success}30`, marginBottom: 16, fontSize: 12, color: COLORS.success }}>
            This will create a new client account, policy, and sales log entry in one step.
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>CLIENT ACCOUNT</div>
          <div style={S.grid(2)}>
            <FormField label="Name"><input style={S.input} value={convertForm.accountName} onChange={e => setConvertForm({ ...convertForm, accountName: e.target.value })} /></FormField>
            <FormField label="Type">
              <select style={S.input} value={convertForm.accountType} onChange={e => setConvertForm({ ...convertForm, accountType: e.target.value })}>
                <option value="Personal">Personal</option><option value="Commercial">Commercial</option>
              </select>
            </FormField>
          </div>
          <div style={S.grid(3)}>
            <FormField label="Phone"><input style={S.input} value={convertForm.phone} onChange={e => setConvertForm({ ...convertForm, phone: e.target.value })} /></FormField>
            <FormField label="Email"><input style={S.input} value={convertForm.email} onChange={e => setConvertForm({ ...convertForm, email: e.target.value })} /></FormField>
            <FormField label="Zip"><input style={S.input} value={convertForm.zip} onChange={e => setConvertForm({ ...convertForm, zip: e.target.value })} /></FormField>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", margin: "16px 0 8px" }}>POLICY</div>
          <div style={S.grid(2)}>
            <FormField label="Carrier">
              <select style={S.input} value={convertForm.carrier} onChange={e => setConvertForm({ ...convertForm, carrier: e.target.value })}>
                {(config.carriers || []).map(c => <option key={c} value={c}>{c}</option>)}
                {convertForm.carrier && !(config.carriers || []).includes(convertForm.carrier) && <option value={convertForm.carrier}>{convertForm.carrier}</option>}
              </select>
            </FormField>
            <FormField label="LOB">
              <select style={S.input} value={convertForm.lob} onChange={e => setConvertForm({ ...convertForm, lob: e.target.value })}>
                {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
          </div>
          <div style={S.grid(3)}>
            <FormField label="Policy #"><input style={S.input} value={convertForm.policyNumber} onChange={e => setConvertForm({ ...convertForm, policyNumber: e.target.value })} placeholder="Optional" /></FormField>
            <FormField label="Effective"><input style={S.input} type="date" value={convertForm.effectiveDate} onChange={e => setConvertForm({ ...convertForm, effectiveDate: e.target.value })} /></FormField>
            <FormField label="Expiration"><input style={S.input} type="date" value={convertForm.expirationDate} onChange={e => setConvertForm({ ...convertForm, expirationDate: e.target.value })} /></FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="Premium"><input style={S.input} type="number" min="0" value={convertForm.premium} onChange={e => setConvertForm({ ...convertForm, premium: e.target.value })} /></FormField>
            <FormField label="Payment Plan">
              <select style={S.input} value={convertForm.paymentPlan} onChange={e => setConvertForm({ ...convertForm, paymentPlan: e.target.value })}>
                {["Annual","Semi-Annual","Quarterly","Monthly","EFT"].map(pp => <option key={pp} value={pp}>{pp}</option>)}
              </select>
            </FormField>
          </div>
          {(convertForm.lob === "Auto" || convertForm.lob === "Commercial Auto") && (
            <FormField label="# of Vehicles (Items)">
              <input style={S.input} type="number" min="1" value={convertForm.vehicleCount || 1} onChange={e => setConvertForm({ ...convertForm, vehicleCount: e.target.value, itemCount: e.target.value })} />
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Each vehicle = 1 item toward Allstate quota</div>
            </FormField>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", margin: "16px 0 8px" }}>SALES LOG</div>
          <div style={S.grid(2)}>
            <FormField label="Sale Type">
              <select style={S.input} value={convertForm.saleType} onChange={e => setConvertForm({ ...convertForm, saleType: e.target.value })}>
                {["New Business","Rewrite","Cross-Sell"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Source">
              <select style={S.input} value={convertForm.source} onChange={e => setConvertForm({ ...convertForm, source: e.target.value })}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={{ ...S.btn(), background: COLORS.success }} onClick={handleConvert}>✓ Convert & Close Deal</button>
            <button style={S.btn("ghost")} onClick={() => setShowConvert(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="New Prospect" onClose={() => setShowAdd(false)}>
          <div style={S.grid(2)}>
            <FormField label="First Name *"><input style={S.input} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} autoFocus /></FormField>
            <FormField label="Last Name"><input style={S.input} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></FormField>
          </div>
          <FormField label="Business Name"><input style={S.input} value={form.business} onChange={e => setForm({ ...form, business: e.target.value })} placeholder="If commercial" /></FormField>
          <div style={S.grid(2)}>
            <FormField label="Phone"><input style={S.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Email"><input style={S.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="LOB Interest">
              <select style={S.input} value={form.lob} onChange={e => setForm({ ...form, lob: e.target.value })}>
                {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Est. Premium"><input style={S.input} type="number" min="0" value={form.estimatedPremium} onChange={e => setForm({ ...form, estimatedPremium: e.target.value })} /></FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="Source">
              <select style={S.input} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Zip Code"><input style={S.input} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></FormField>
          </div>
          <FormField label="Source Detail"><input style={S.input} value={form.sourceDetail} onChange={e => setForm({ ...form, sourceDetail: e.target.value })} placeholder="e.g., Rodriguez family referral" /></FormField>
          <div style={S.grid(2)}>
            <FormField label="X-Date (Current Policy Expiration)"><input style={S.input} type="date" value={form.xDate} onChange={e => setForm({ ...form, xDate: e.target.value })} /></FormField>
            <FormField label="Current Carrier"><input style={S.input} value={form.currentCarrier} onChange={e => setForm({ ...form, currentCarrier: e.target.value })} placeholder="e.g., GEICO, State Farm" /></FormField>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...S.btn(), opacity: (form.firstName.trim() || form.business.trim()) ? 1 : 0.5 }} onClick={handleAdd} disabled={!form.firstName.trim() && !form.business.trim()}>Add Prospect</button>
            <button style={S.btn("ghost")} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==================== SALES LOG ====================
function SalesLog({ data, setData, config }) {
  const [view, setView] = useState("monthly");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const defaultForm = { date: today(), accountName: "", lob: "Auto", premium: "", carrier: "Allstate", source: "Referral", saleType: "New Business", zip: "", itemCount: 1 };
  const [form, setForm] = useState({ ...defaultForm });

  const handleAdd = () => {
    if (!form.accountName.trim() || !form.date) return;
    const entry = { ...form, accountName: form.accountName.trim(), id: uid(), premium: Number(form.premium) || 0, itemCount: Number(form.itemCount) || 1 };
    const updated = { ...data, salesLog: [...data.salesLog, entry] };
    setData(updated, { undo: true, message: `Logged sale: ${entry.accountName} — ${entry.lob}` });
    setShowAdd(false);
    setForm({ ...defaultForm });
  };

  const handleEdit = (sale) => {
    setForm({ ...sale, premium: sale.premium || 0, itemCount: sale.itemCount || 1 });
    setEditId(sale.id);
  };

  const handleSaveEdit = () => {
    const updated = { ...data, salesLog: data.salesLog.map(s => s.id === editId ? { ...form, premium: Number(form.premium) || 0, itemCount: Number(form.itemCount) || 1 } : s) };
    setData(updated);
    setEditId(null);
    setForm({ ...defaultForm });
  };

  const handleDelete = (id) => {
    const sale = data.salesLog.find(s => s.id === id);
    const updated = { ...data, salesLog: data.salesLog.filter(s => s.id !== id) };
    setData(updated, { undo: true, message: `Deleted sale: ${sale?.accountName || "entry"} — ${sale?.lob || ""}` });
  };

  const sorted = [...data.salesLog].filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.accountName || "").toLowerCase().includes(q) || (s.lob || "").toLowerCase().includes(q) || (s.carrier || "").toLowerCase().includes(q) || (s.source || "").toLowerCase().includes(q);
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const now = new Date();
  const thisMonth = sorted.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const lastMonth = sorted.filter(s => { const d = new Date(s.date); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); });
  const allstateAutoItems = thisMonth.filter(s => s.carrier === "Allstate" && s.lob === "Auto" && s.saleType !== "Rewrite").reduce((sum, s) => sum + (s.itemCount || 1), 0); // Roadside excluded (separate LOB); Rewrites excluded
  const quotaTarget = config.quotaTarget || 13;
  const rewriteCount = thisMonth.filter(s => s.saleType === "Rewrite").length;

  const byLob = {};
  thisMonth.forEach(s => { byLob[s.lob] = (byLob[s.lob] || 0) + 1; });
  const bySource = {};
  thisMonth.forEach(s => { bySource[s.source] = (bySource[s.source] || 0) + 1; });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Sales Performance Log</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Search sales..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn()} onClick={() => setShowAdd(true)}>+ Log Sale</button>
        </div>
      </div>

      <div style={S.grid(5)}>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: allstateAutoItems >= quotaTarget ? COLORS.success : COLORS.warning }}>{allstateAutoItems}<span style={{ fontSize: 14, color: COLORS.textDim }}>/{quotaTarget}</span></div>
          <div style={S.statLabel}>Allstate Auto Items</div>
          <div style={{ marginTop: 6, height: 4, background: COLORS.border, borderRadius: 2 }}>
            <div style={{ height: 4, background: allstateAutoItems >= quotaTarget ? COLORS.success : COLORS.accent, borderRadius: 2, width: `${Math.min(100, (allstateAutoItems / quotaTarget) * 100)}%`, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Excl. Rewrites & Roadside</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statVal}>{thisMonth.length}</div>
          <div style={S.statLabel}>Sales This Month</div>
          <div style={{ fontSize: 11, color: lastMonth.length > 0 ? (thisMonth.length >= lastMonth.length ? COLORS.success : COLORS.danger) : COLORS.textDim, marginTop: 2 }}>
            {lastMonth.length > 0 ? `vs ${lastMonth.length} last month` : ""}
          </div>
        </div>
        <div style={S.statCard}>
          <div style={{ ...S.statVal, color: COLORS.warning }}>{rewriteCount}</div>
          <div style={S.statLabel}>Rewrites This Month</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Not counted toward quota</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statVal}>${thisMonth.reduce((s, e) => s + (e.premium || 0), 0).toLocaleString()}</div>
          <div style={S.statLabel}>Premium This Month</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statVal}>${sorted.length > 0 ? Math.round(sorted.reduce((s, e) => s + (e.premium || 0), 0) / sorted.length).toLocaleString() : 0}</div>
          <div style={S.statLabel}>Avg Premium/Sale</div>
        </div>
      </div>

      <div style={{ ...S.grid(2), marginTop: 20 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>By LOB (This Month)</span></div>
          {Object.entries(byLob).sort((a, b) => b[1] - a[1]).map(([lob, count]) => (
            <div key={lob} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
              <span style={{ fontSize: 13 }}>{lob}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 100, height: 6, background: COLORS.border, borderRadius: 3 }}>
                  <div style={{ height: 6, background: COLORS.accent, borderRadius: 3, width: `${(count / thisMonth.length) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, color: COLORS.textDim, width: 20, textAlign: "right" }}>{count}</span>
              </div>
            </div>
          ))}
          {Object.keys(byLob).length === 0 && <div style={{ ...S.emptyState, padding: 20 }}>No sales this month</div>}
        </div>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>By Source (This Month)</span></div>
          {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
            <div key={source} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
              <span style={{ fontSize: 13 }}>{source}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 100, height: 6, background: COLORS.border, borderRadius: 3 }}>
                  <div style={{ height: 6, background: COLORS.success, borderRadius: 3, width: `${(count / thisMonth.length) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, color: COLORS.textDim, width: 20, textAlign: "right" }}>{count}</span>
              </div>
            </div>
          ))}
          {Object.keys(bySource).length === 0 && <div style={{ ...S.emptyState, padding: 20 }}>No sales this month</div>}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 20 }}>
        <div style={S.sectionTitle}><span>All Sales</span></div>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Date</th><th style={S.th}>Account</th><th style={S.th}>LOB</th>
            <th style={S.th}>Carrier</th><th style={S.th}>Premium</th><th style={S.th}>Items</th><th style={S.th}>Source</th><th style={S.th}>Type</th><th style={{ ...S.th, width: 70 }}>Actions</th>
          </tr></thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.id} style={{ background: s.saleType === "Rewrite" ? `${COLORS.warning}08` : undefined }}>
                <td style={S.td}>{fmtShort(s.date)}</td>
                <td style={S.td}>{s.accountName}</td>
                <td style={S.td}><span style={S.badge(COLORS.info)}>{s.lob}</span></td>
                <td style={S.td}>{s.carrier}</td>
                <td style={S.td}>${(s.premium || 0).toLocaleString()}</td>
                <td style={S.td}>{s.itemCount || 1}</td>
                <td style={S.td}>{s.source}</td>
                <td style={S.td}><span style={S.badge(s.saleType === "New Business" ? COLORS.success : s.saleType === "Rewrite" ? COLORS.warning : COLORS.info)}>{s.saleType}</span></td>
                <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                  <span style={{ cursor: "pointer", fontSize: 14, marginRight: 8, opacity: 0.6 }} title="Edit" onClick={() => handleEdit(s)}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>✏️</span>
                  <span style={{ cursor: "pointer", fontSize: 14, opacity: 0.6 }} title="Delete" onClick={() => { if (confirm("Delete this sale entry?")) handleDelete(s.id); }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>🗑️</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(showAdd || editId) && (
        <Modal title={editId ? "Edit Sale" : "Log New Sale"} onClose={() => { setShowAdd(false); setEditId(null); setForm({ ...defaultForm }); }}>
          <div style={S.grid(2)}>
            <FormField label="Date *"><input style={S.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></FormField>
            <FormField label="Account Name *"><input style={S.input} value={form.accountName} onChange={e => setForm({ ...form, accountName: e.target.value })} autoFocus /></FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="LOB">
              <select style={S.input} value={form.lob} onChange={e => setForm({ ...form, lob: e.target.value })}>
                {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Premium"><input style={S.input} type="number" min="0" value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })} /></FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="Carrier">
              <select style={S.input} value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })}>
                {(config.carriers || []).map(c => <option key={c} value={c}>{c}</option>)}
                {form.carrier && !(config.carriers || []).includes(form.carrier) && <option value={form.carrier}>{form.carrier}</option>}
              </select>
            </FormField>
            <FormField label="Source">
              <select style={S.input} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="Sale Type">
              <select style={S.input} value={form.saleType} onChange={e => setForm({ ...form, saleType: e.target.value })}>
                {["New Business","Rewrite","Cross-Sell"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {form.saleType === "Rewrite" && <div style={{ fontSize: 10, color: COLORS.warning, marginTop: 2 }}>⚠ Rewrites do not count toward Allstate quota</div>}
            </FormField>
            <FormField label="Zip Code"><input style={S.input} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></FormField>
          </div>
          {(form.lob === "Auto" || form.lob === "Commercial Auto") && (
            <FormField label="# of Items (Vehicles)">
              <input style={S.input} type="number" min="1" value={form.itemCount} onChange={e => setForm({ ...form, itemCount: e.target.value })} />
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Each vehicle counts as 1 item toward Allstate quota (Rewrites excluded)</div>
            </FormField>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...S.btn(), opacity: (form.accountName.trim() && form.date) ? 1 : 0.5 }} onClick={editId ? handleSaveEdit : handleAdd} disabled={!form.accountName.trim() || !form.date}>{editId ? "Save Changes" : "Log Sale"}</button>
            <button style={S.btn("ghost")} onClick={() => { setShowAdd(false); setEditId(null); setForm({ ...defaultForm }); }}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==================== CLIENT DETAIL VIEW ====================
const PIPELINE_STATUS_FLOW = ["new_lead","contacted","quoting","quoted","follow_up","bound","lost","service_only"];
const PIPELINE_STATUS_LABELS = { new_lead: "New Lead", contacted: "Contacted", quoting: "Quoting", quoted: "Quoted", follow_up: "Follow Up", bound: "Bound", lost: "Lost", service_only: "Service Only" };
const PIPELINE_STATUS_COLORS = { new_lead: "#60a5fa", contacted: "#a78bfa", quoting: "#f59e0b", quoted: "#fb923c", follow_up: "#e879f9", bound: "#22c55e", lost: "#ef4444", service_only: "#94a3b8" };
const SERVICE_LOG_TYPES = ["endorsement","payment","claim","general","billing","cancellation"];
const SERVICE_LOG_TYPE_LABELS = { endorsement: "Endorsement", payment: "Payment", claim: "Claim", general: "General", billing: "Billing", cancellation: "Cancellation" };
const SERVICE_LOG_TYPE_COLORS = { endorsement: "#a78bfa", payment: "#22c55e", claim: "#ef4444", general: "#94a3b8", billing: "#f59e0b", cancellation: "#fb7185" };
const WIND_MIT_OPTIONS = ["unknown","none","partial","full"];
const WIND_MIT_LABELS = { unknown: "Unknown", none: "None", partial: "Partial", full: "Full" };

function ClientDetailView({ account, data, setData, config, onBack, onLogService, onMerge, onDelete, onNavigateAccount }) {
  const todayStr = today();
  const [expandedPolId, setExpandedPolId] = useState(null);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState({ type: "general", note: "" });
  const [noteText, setNoteText] = useState("");
  const [renewalPopupSI, setRenewalPopupSI] = useState(null);
  const [cancellingPolicyId, setCancellingPolicyId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingPolicyId, setDeletingPolicyId] = useState(null);
  const [showAddSI, setShowAddSI] = useState(false);
  const [siForm, setSiForm] = useState({ type: "Ivantage Renewal", policyId: "", description: "", dueDate: "", amountDue: "" });
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly", broker: "", agencyFee: "", commissionPct: 10 });
  const [showTemplate, setShowTemplate] = useState(null);

  // Keep a local ref to the current account from data (in case it changed)
  const acct = data.accounts.find(a => a.id === account.id) || account;

  const [householdSearch, setHouseholdSearch] = useState("");
  const [showHouseholdLink, setShowHouseholdLink] = useState(false);

  const policies = useMemo(() => data.policies.filter(p => p.accountId === acct.id), [data.policies, acct.id]);
  const activePolicies = useMemo(() => policies.filter(p => p.status === "Active"), [policies]);
  const serviceItems = useMemo(() => (data.serviceItems || []).filter(s => s.accountId === acct.id), [data.serviceItems, acct.id]);
  const notes = useMemo(() => (data.notes || []).filter(n => n.accountId === acct.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [data.notes, acct.id]);
  const activities = useMemo(() => (data.activities || []).filter(a => a.accountId === acct.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [data.activities, acct.id]);
  const pinnedNotes = useMemo(() => notes.filter(n => n.pinned), [notes]);

  // Household
  const household = useMemo(() => acct.householdId ? (data.households || []).find(h => h.id === acct.householdId) : null, [acct.householdId, data.households]);
  const householdMembers = useMemo(() => {
    if (!acct.householdId) return [];
    return data.accounts.filter(a => a.id !== acct.id && a.householdId === acct.householdId);
  }, [acct.householdId, acct.id, data.accounts]);
  const householdPolicies = useMemo(() => {
    if (householdMembers.length === 0) return [];
    const memberIds = new Set(householdMembers.map(m => m.id));
    return data.policies.filter(p => memberIds.has(p.accountId) && p.status === "Active");
  }, [householdMembers, data.policies]);
  const householdSearchResults = useMemo(() => {
    if (!householdSearch) return [];
    const q = householdSearch.toLowerCase();
    return data.accounts.filter(a => a.id !== acct.id && a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [householdSearch, data.accounts, acct.id]);

  const linkToHousehold = useCallback((targetAccount) => {
    // If target has a household, join it. Otherwise create a new one.
    let updated = { ...data };
    let hhId = targetAccount.householdId;
    if (!hhId) {
      hhId = uid();
      const hhName = targetAccount.name.split(" ")[0] + " / " + acct.name.split(" ")[0] + " Household";
      updated.households = [...(updated.households || []), { id: hhId, name: hhName, createdAt: new Date().toISOString() }];
      updated.accounts = updated.accounts.map(a => a.id === targetAccount.id ? { ...a, householdId: hhId } : a);
    }
    updated.accounts = updated.accounts.map(a => a.id === acct.id ? { ...a, householdId: hhId } : a);
    setData(updated);
    setShowHouseholdLink(false);
    setHouseholdSearch("");
  }, [data, acct.id, setData]);

  const leaveHousehold = useCallback(() => {
    let updated = { ...data, accounts: data.accounts.map(a => a.id === acct.id ? { ...a, householdId: null } : a) };
    // If no other members remain, remove the household
    if (household && !updated.accounts.some(a => a.id !== acct.id && a.householdId === household.id)) {
      updated.households = (updated.households || []).filter(h => h.id !== household.id);
    }
    setData(updated);
  }, [data, acct.id, household, setData]);

  const togglePinNote = useCallback((noteId) => {
    setData({ ...data, notes: data.notes.map(n => n.id === noteId ? { ...n, pinned: !n.pinned } : n) });
  }, [data, setData]);

  // Combined feed: activities + serviceLog entries, newest first
  const combinedFeed = useMemo(() => {
    const feed = [];
    activities.forEach(a => feed.push({ source: "activity", id: a.id, date: a.createdAt, type: a.type, description: a.description, detail: a.detail, author: a.createdBy }));
    (acct.serviceLog || []).forEach((entry, i) => feed.push({ source: "serviceLog", id: `sl-${i}`, date: entry.date, type: entry.type, description: SERVICE_LOG_TYPE_LABELS[entry.type] || entry.type, detail: entry.note, author: entry.author }));
    notes.forEach(n => feed.push({ source: "note", id: n.id, date: n.createdAt, type: "note", description: "Note", detail: n.text, author: n.createdBy, pinned: n.pinned }));
    return feed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [activities, acct.serviceLog, notes]);

  // Inline-edit account field
  const updateAccount = useCallback((field, value) => {
    const updated = { ...data, accounts: data.accounts.map(a => a.id === acct.id ? { ...a, [field]: value } : a) };
    if (field === "name") {
      updated.policies = updated.policies.map(p => p.accountId === acct.id ? { ...p, accountName: value } : p);
      updated.serviceItems = updated.serviceItems.map(si => si.accountId === acct.id ? { ...si, accountName: value } : si);
    }
    setData(updated);
  }, [data, acct.id, setData]);

  // Cycle pipeline status
  const cyclePipelineStatus = useCallback(() => {
    const current = acct.pipelineStatus || "service_only";
    const idx = PIPELINE_STATUS_FLOW.indexOf(current);
    const next = PIPELINE_STATUS_FLOW[(idx + 1) % PIPELINE_STATUS_FLOW.length];
    updateAccount("pipelineStatus", next);
  }, [acct.pipelineStatus, updateAccount]);

  // Add note
  const addNote = useCallback(() => {
    if (!noteText.trim()) return;
    const note = { id: uid(), accountId: acct.id, text: noteText.trim(), createdBy: config.agentName || "Agent", createdAt: new Date().toISOString() };
    let updated = { ...data, notes: [...(data.notes || []), note] };
    updated = addActivity(updated, acct.id, "note_added", "Note added", noteText.trim());
    setData(updated);
    setNoteText("");
  }, [noteText, data, acct.id, config.agentName, setData]);

  // Log service update
  const logServiceUpdate = useCallback(() => {
    if (!serviceForm.note.trim()) return;
    const entry = { date: new Date().toISOString(), type: serviceForm.type, note: serviceForm.note.trim(), author: config.agentName || "Agent" };
    const newLog = [...(acct.serviceLog || []), entry];
    let updated = { ...data, accounts: data.accounts.map(a => a.id === acct.id ? { ...a, serviceLog: newLog } : a) };
    updated = addActivity(updated, acct.id, "service_created", `Service log: ${SERVICE_LOG_TYPE_LABELS[serviceForm.type] || serviceForm.type}`, serviceForm.note.trim());
    setData(updated);
    setServiceForm({ type: "general", note: "" });
    setShowServiceForm(false);
  }, [serviceForm, data, acct, config.agentName, setData]);

  // Copy ACORD-style summary
  const copyToACORD = useCallback(() => {
    const primary = (acct.contacts || [])[0];
    const lines = [
      `Named Insured: ${acct.name}`,
      `Address: ${acct.address || ""}${acct.city ? ", " + acct.city : ""}${acct.state ? ", " + acct.state : ""} ${acct.zip || ""}`.trim(),
      `Phone: ${primary?.phone || acct.phone || ""}`,
      `Email: ${primary?.email || acct.email || ""}`,
      `Property Address: ${acct.propertyAddress || acct.address || ""}`,
      "",
      "Active Policies:",
      ...activePolicies.map(p => `  ${p.carrier || "—"} | ${p.lob || "—"} | #${p.policyNumber || "—"} | $${(p.premium || 0).toLocaleString()} | Exp: ${p.expirationDate || "—"}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }, [acct, activePolicies]);

  // Policy inline update
  const upPol = useCallback((polId, field, value) => {
    if (field === "status" && value === "Cancelled") { setCancellingPolicyId(polId); return; }
    if (["premium","agencyFee"].includes(field) && value !== "" && Number(value) < 0) return;
    if (field === "commissionPct" && value !== "" && (Number(value) < 0 || Number(value) > 100)) return;
    if (field === "vehicleCount" && value !== "" && Number(value) < 0) return;
    const updatedPolicies = data.policies.map(p => p.id === polId ? { ...p, [field]: ["premium","vehicleCount","agencyFee","commissionPct"].includes(field) ? (Number(value) || 0) : value } : p);
    let updated = { ...data, policies: updatedPolicies };
    if (field === "expirationDate" && value) {
      const daysToExp = daysBetween(todayStr, value);
      const pol = updatedPolicies.find(p => p.id === polId);
      const renewalTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal"];
      const hasRenewal = data.serviceItems.some(si => si.policyId === polId && renewalTypes.some(rt => si.type.includes("Renewal")));
      const window = pol ? renewalWindow(pol.lob) : 55;
      if (pol && pol.status === "Active" && daysToExp >= 0 && daysToExp <= window && !hasRenewal) {
        const type = isCommercialLob(pol.lob) ? "Commercial Renewal" : (pol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
        const newSI = {
          id: uid(), type, accountId: acct.id, accountName: acct.name, policyId: polId,
          policyNumber: pol.policyNumber, carrier: pol.carrier, lob: pol.lob,
          description: (pol.carrier || "") + " " + (pol.lob || "") + " Renewal",
          dueDate: value, amountDue: pol.premium || 0, status: "Uncontacted",
          urgency: daysToExp <= 14 ? "High" : "Medium", assignedTo: config.agentName || "Agent",
          created: todayStr, lastAction: "", lastActionDate: "", followUpDate: todayStr,
          notes: "", ballInCourt: false, flags: [], contactAttempts: []
        };
        updated = { ...updated, serviceItems: [...updated.serviceItems, newSI] };
      }
    }
    setData(updated);
  }, [data, acct, todayStr, config.agentName, setData]);

  // Shared inline input style
  const iS = { ...S.input, padding: "4px 8px", fontSize: 13 };
  const editableInput = { fontSize: 14, fontWeight: 400, background: "transparent", border: "none", color: COLORS.text, outline: "none", padding: 0, width: "100%", borderBottom: "1px solid transparent" };
  const onFocusBorder = (e) => { e.target.style.borderBottom = `1px solid ${COLORS.accent}`; };
  const onBlurBorder = (e) => { e.target.style.borderBottom = "1px solid transparent"; };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const feedTypeColor = (type) => {
    if (SERVICE_LOG_TYPE_COLORS[type]) return SERVICE_LOG_TYPE_COLORS[type];
    const actColors = { note_added: COLORS.info, note: COLORS.info, task_created: COLORS.accent, task_completed: COLORS.success, task_reopened: COLORS.warning, contact_attempt: COLORS.accentLight, service_created: COLORS.warning, status_change: "#f97316", policy_added: COLORS.success, pipeline_created: COLORS.accent };
    return actColors[type] || COLORS.textDim;
  };
  const feedTypeLabel = (type) => {
    if (SERVICE_LOG_TYPE_LABELS[type]) return SERVICE_LOG_TYPE_LABELS[type];
    const actLabels = { note_added: "Note", note: "Note", task_created: "Task Created", task_completed: "Task Done", task_reopened: "Task Reopened", contact_attempt: "Contact", service_created: "Service Log", status_change: "Status Change", policy_added: "Policy Added", pipeline_created: "Pipeline" };
    return actLabels[type] || type;
  };

  const lobOpts = config.lobOptions || LOB_OPTIONS;
  const cgList = Object.keys(config.carrierGroups || {}).sort();

  return (
    <div>
      <button style={{ ...S.btn("ghost"), marginBottom: 12, fontSize: 12 }} onClick={onBack}>← Back to Clients</button>

      {/* Pinned Notes Alert Banner */}
      {pinnedNotes.length > 0 && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: `${COLORS.warning}15`, border: `1px solid ${COLORS.warning}40`, borderLeft: `4px solid ${COLORS.warning}`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.warning, marginBottom: 6, letterSpacing: "0.5px" }}>📌 PINNED NOTES</div>
          {pinnedNotes.map(n => (
            <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>
                {n.text}
                <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 8 }}>— {n.createdBy}, {fmtShort(n.createdAt)}</span>
              </div>
              <button style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 11, padding: "0 4px", whiteSpace: "nowrap" }} onClick={() => togglePinNote(n.id)}>Unpin</button>
            </div>
          ))}
        </div>
      )}

      {/* Contact Opportunity Flags */}
      {(!acct.email || !acct.phone) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {!acct.email && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, background: `${COLORS.warning}20`, color: COLORS.warning, border: `1px solid ${COLORS.warning}30` }}>⚠ Missing Email — collect during next contact</span>}
          {!acct.phone && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4, background: `${COLORS.warning}20`, color: COLORS.warning, border: `1px solid ${COLORS.warning}30` }}>⚠ Missing Phone — collect during next contact</span>}
        </div>
      )}

      {/* ===== TOP SECTION: Client Header ===== */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
          {/* Left: Name + contact info */}
          <div style={{ flex: 1 }}>
            <input style={{ ...editableInput, fontSize: 22, fontWeight: 700 }} value={acct.name} onChange={e => updateAccount("name", e.target.value)} onFocus={onFocusBorder} onBlur={onBlurBorder} />
            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>📞</span>
                <input style={{ ...editableInput, fontSize: 13, width: 140 }} value={acct.phone || ""} onChange={e => updateAccount("phone", e.target.value)} onFocus={onFocusBorder} onBlur={onBlurBorder} placeholder="Phone" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>✉</span>
                <input style={{ ...editableInput, fontSize: 13, width: 220 }} value={acct.email || ""} onChange={e => updateAccount("email", e.target.value)} onFocus={onFocusBorder} onBlur={onBlurBorder} placeholder="Email" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>⌂</span>
                <input
                  style={{ ...editableInput, fontSize: 13, width: 280, color: COLORS.textDim, cursor: "default" }}
                  value={[acct.address, acct.city, acct.state, acct.zip].filter(Boolean).join(", ") || ""}
                  readOnly
                  title="Edit address in Property Details section below"
                  placeholder="Address"
                  onChange={() => {}}
                />
              </div>
            </div>
          </div>

          {/* Right: Pipeline badge + actions */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            {/* Pipeline status badge */}
            <div
              style={{
                padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: `${PIPELINE_STATUS_COLORS[acct.pipelineStatus || "service_only"]}20`,
                color: PIPELINE_STATUS_COLORS[acct.pipelineStatus || "service_only"],
                border: `1px solid ${PIPELINE_STATUS_COLORS[acct.pipelineStatus || "service_only"]}40`,
                userSelect: "none",
              }}
              onClick={cyclePipelineStatus}
              title="Click to cycle pipeline status"
            >
              {PIPELINE_STATUS_LABELS[acct.pipelineStatus || "service_only"]}
            </div>
            <span style={S.badge(acct.type === "Commercial" ? COLORS.warning : COLORS.info)}>{acct.type}</span>
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
          <button style={{ ...S.btn(), fontSize: 12, padding: "6px 14px" }} onClick={() => onLogService ? onLogService(acct.id) : setShowServiceForm(true)}>+ Log Service Update</button>
          <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px" }} onClick={() => { const el = document.getElementById("cdv-note-input"); if (el) el.focus(); }}>+ Add Note</button>
          <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px" }} onClick={() => setShowTemplate({ accountName: acct.name, policy: activePolicies[0] || null })} title="Communication templates">✉ Templates</button>
          <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px" }} onClick={copyToACORD} title="Copy client + policy summary to clipboard">📋 Copy to ACORD</button>
          {onMerge && <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px" }} onClick={onMerge}>🔗 Merge</button>}
          {onDelete && <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px", color: COLORS.danger }} onClick={() => setShowDeleteConfirm(true)}>🗑 Delete</button>}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: COLORS.textDim, alignSelf: "center" }}>Since {fmt(acct.created)}</div>
        </div>
      </div>

      {/* ===== MIDDLE SECTION: Two columns ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* LEFT: Active Policies */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>
              ACTIVE POLICIES ({activePolicies.length}) · ${activePolicies.reduce((s, p) => s + (p.premium || 0), 0).toLocaleString()} total premium
            </div>
            <button style={{ ...S.btn(), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowAddPolicy(!showAddPolicy)}>
              {showAddPolicy ? "Cancel" : "+ Add Policy"}
            </button>
          </div>
          {showAddPolicy && (() => {
            const pf = policyForm;
            const inputStyle = { ...S.input, fontSize: 12, padding: "6px 8px" };
            const cgList = Object.keys(config.carrierGroups || {}).sort();
            const lobOpts = config.lobOptions || LOB_OPTIONS;
            const handleEffDateChange = (effDate) => {
              const exp = calcExpiration(effDate, pf.lob);
              setPolicyForm({ ...pf, effectiveDate: effDate, expirationDate: exp });
            };
            const handleLobChange = (lob) => {
              const exp = pf.effectiveDate ? calcExpiration(pf.effectiveDate, lob) : pf.expirationDate;
              setPolicyForm({ ...pf, lob, expirationDate: exp });
            };
            const handleAddPolicy = () => {
              if (!pf.carrier) { alert("Please select a carrier."); return; }
              const valErrors = validatePolicyFields({ premium: pf.premium, effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate), agencyFee: pf.agencyFee, commissionPct: pf.commissionPct });
              if (valErrors.length > 0) { alert("Please fix:\n• " + valErrors.join("\n• ")); return; }
              const newPolId = uid();
              const newPol = {
                id: newPolId, accountId: acct.id, accountName: acct.name, namedInsured: pf.namedInsured || "",
                carrier: pf.carrier, lob: pf.lob, policyNumber: pf.policyNumber,
                effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate),
                premium: Number(pf.premium) || 0, status: "Active", paymentPlan: pf.paymentPlan,
                vehicleCount: isAutoTermLob(pf.lob) ? 1 : 0, documents: {}, notes: "",
                broker: pf.broker || "", agencyFee: Number(pf.agencyFee) || 0, commissionPct: Number(pf.commissionPct) ?? 10
              };
              const _expDate = normalizeDate(pf.expirationDate);
              const _daysToExp = _expDate ? daysBetween(todayStr, _expDate) : -1;
              const _renWindow = renewalWindow(pf.lob);
              let updated;
              if (_daysToExp >= 0 && _daysToExp <= _renWindow) {
                const _renType = isCommercialLob(pf.lob) ? "Commercial Renewal" : (pf.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                const newSI = {
                  id: uid(), type: _renType, accountId: acct.id, accountName: acct.name,
                  policyId: newPolId, policyNumber: pf.policyNumber, carrier: pf.carrier, lob: pf.lob,
                  description: `${pf.carrier} ${pf.lob} Renewal`, dueDate: _expDate || todayStr,
                  amountDue: Number(pf.premium) || 0, status: "Uncontacted", urgency: _daysToExp <= 14 ? "High" : "Medium",
                  assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
                  followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                };
                updated = { ...data, policies: [...data.policies, newPol], serviceItems: [...data.serviceItems, newSI] };
              } else {
                updated = { ...data, policies: [...data.policies, newPol] };
              }
              updated = addActivity(updated, acct.id, "policy_added", `Policy added: ${pf.carrier} — ${pf.lob}`, pf.policyNumber || "");
              setData(updated);
              setShowAddPolicy(false);
              setPolicyForm({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly", broker: "", agencyFee: "", commissionPct: 10 });
            };
            return (
              <div style={{ ...S.card, marginBottom: 8, padding: 12, background: `${COLORS.accent}08`, border: `1px solid ${COLORS.accent}20` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Carrier *</div><select style={inputStyle} value={pf.carrier} onChange={e => setPolicyForm({ ...pf, carrier: e.target.value })}><option value="">Select carrier...</option>{cgList.map(c => <option key={c} value={c}>{c}</option>)}{pf.carrier && !cgList.includes(pf.carrier) && <option value={pf.carrier}>{pf.carrier}</option>}</select></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>LOB</div><select style={inputStyle} value={pf.lob} onChange={e => handleLobChange(e.target.value)}>{lobOpts.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Policy #</div><input style={inputStyle} placeholder="Policy number" value={pf.policyNumber} onChange={e => setPolicyForm({ ...pf, policyNumber: e.target.value })} /></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Premium</div><input style={inputStyle} type="number" min="0" placeholder="0" value={pf.premium} onChange={e => setPolicyForm({ ...pf, premium: e.target.value })} /></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Named Insured</div><input style={inputStyle} placeholder="If different from account" value={pf.namedInsured || ""} onChange={e => setPolicyForm({ ...pf, namedInsured: e.target.value })} /></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Effective Date</div><input style={inputStyle} type="date" value={pf.effectiveDate} onChange={e => handleEffDateChange(e.target.value)} /></div>
                  <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Expiration Date</div><input style={inputStyle} type="date" value={pf.expirationDate} onChange={e => setPolicyForm({ ...pf, expirationDate: e.target.value })} /></div>
                  {acct.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Agency Fee</div><input style={inputStyle} type="number" min="0" placeholder="0" value={pf.agencyFee} onChange={e => setPolicyForm({ ...pf, agencyFee: e.target.value })} /></div>}
                  {acct.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Broker</div><select style={inputStyle} value={pf.broker} onChange={e => setPolicyForm({ ...pf, broker: e.target.value })}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}</select></div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.btn(), background: COLORS.success, fontSize: 11, opacity: pf.carrier ? 1 : 0.5 }} onClick={handleAddPolicy} disabled={!pf.carrier}>Add Policy</button>
                  <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={() => setShowAddPolicy(false)}>Cancel</button>
                </div>
              </div>
            );
          })()}
          {policies.length === 0 && !showAddPolicy && <div style={{ ...S.card, ...S.emptyState, padding: 24 }}>No policies yet</div>}
          {policies.filter(p => p.status === "Active" || p.status === "Pending Renewal").sort((a, b) => (a.expirationDate || "z").localeCompare(b.expirationDate || "z")).map(pol => {
            const isExpanded = expandedPolId === pol.id;
            const daysToExp = pol.expirationDate ? daysBetween(todayStr, pol.expirationDate) : null;
            const xDateColor = daysToExp !== null && daysToExp >= 0 && daysToExp <= 30 ? "#ef4444" : daysToExp !== null && daysToExp >= 0 && daysToExp <= 60 ? "#f59e0b" : COLORS.textDim;
            const isAuto = pol.lob === "Auto" || pol.lob === "Commercial Auto";
            return (
              <div key={pol.id} style={{ ...S.card, marginBottom: 8, padding: 0, overflow: "hidden" }}>
                {/* Policy summary row */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
                  onClick={() => setExpandedPolId(isExpanded ? null : pol.id)}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 10, color: COLORS.textMuted, width: 14 }}>{isExpanded ? "▾" : "▸"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{pol.carrier || "—"}</span>
                      <span style={{ fontSize: 12, color: COLORS.textDim }}>{pol.lob || ""}</span>
                      {isAuto && pol.vehicleCount > 0 && <span style={{ fontSize: 10, color: COLORS.textMuted, background: `${COLORS.border}`, padding: "1px 6px", borderRadius: 3 }}>{pol.vehicleCount} vehicle{pol.vehicleCount !== 1 ? "s" : ""}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                      #{pol.policyNumber || "—"}{pol.namedInsured ? <span style={{ marginLeft: 8, color: COLORS.accent, fontStyle: "italic" }}>({pol.namedInsured})</span> : null}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>${(pol.premium || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: xDateColor }}>
                      {pol.expirationDate ? (daysToExp !== null && daysToExp <= 60 && daysToExp >= 0 ? `Exp ${fmtShort(pol.expirationDate)} (${daysToExp}d)` : `Exp ${fmtShort(pol.expirationDate)}`) : "No exp date"}
                    </div>
                  </div>
                </div>

                {/* Expanded policy detail */}
                {isExpanded && (
                  <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.border}` }}>
                    <div style={{ ...S.grid(3), marginTop: 12 }}>
                      <div><div style={S.formLabel}>Carrier</div><select style={iS} value={pol.carrier || ""} onChange={e => upPol(pol.id, "carrier", e.target.value)}>{[...(!cgList.includes(pol.carrier) && pol.carrier ? [pol.carrier] : []), ...cgList].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                      <div><div style={S.formLabel}>LOB</div><select style={iS} value={pol.lob || ""} onChange={e => upPol(pol.id, "lob", e.target.value)}>{lobOpts.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                      <div><div style={S.formLabel}>Policy #</div><input style={iS} value={pol.policyNumber || ""} onChange={e => upPol(pol.id, "policyNumber", e.target.value)} /></div>
                      <div><div style={S.formLabel}>Named Insured</div><input style={iS} value={pol.namedInsured || ""} onChange={e => upPol(pol.id, "namedInsured", e.target.value)} placeholder={acct.name} /></div>
                      <div><div style={S.formLabel}>Status</div><select style={iS} value={pol.status || "Active"} onChange={e => upPol(pol.id, "status", e.target.value)}>{POLICY_STATUSES.map(sv => <option key={sv} value={sv}>{sv}</option>)}</select></div>
                      <div><div style={S.formLabel}>Effective</div><input style={iS} type="date" value={pol.effectiveDate || ""} onChange={e => { upPol(pol.id, "effectiveDate", e.target.value); if (e.target.value) { const exp = calcExpiration(e.target.value, pol.lob); if (exp) upPol(pol.id, "expirationDate", exp); } }} /></div>
                      <div><div style={S.formLabel}>Expiration</div><input style={iS} type="date" value={pol.expirationDate || ""} onChange={e => upPol(pol.id, "expirationDate", e.target.value)} /></div>
                      <div><div style={S.formLabel}>Premium</div><input style={iS} type="number" value={pol.premium || ""} onChange={e => upPol(pol.id, "premium", e.target.value)} /></div>
                      {isAuto && <div><div style={S.formLabel}>Vehicles</div><input style={{ ...iS, width: 60 }} type="number" min="1" value={pol.vehicleCount || 1} onChange={e => upPol(pol.id, "vehicleCount", e.target.value)} /></div>}
                      {acct.type === "Commercial" && <div><div style={S.formLabel}>Agency Fee</div><input style={iS} type="number" value={pol.agencyFee || ""} onChange={e => upPol(pol.id, "agencyFee", e.target.value)} placeholder="0" /></div>}
                      {acct.type === "Commercial" && <div><div style={S.formLabel}>Broker</div><select style={iS} value={pol.broker || ""} onChange={e => upPol(pol.id, "broker", e.target.value)}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}{pol.broker && !(config.brokers || []).includes(pol.broker) && <option value={pol.broker}>{pol.broker}</option>}</select></div>}
                    </div>
                    {pol.notes && <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>{pol.notes}</div>}
                    <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                      <button
                        style={{ ...S.btn(), fontSize: 11, padding: "4px 10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const advYr = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); dt.setFullYear(dt.getFullYear() + 1); return dt.toISOString().split("T")[0]; };
                          const newPolId = uid();
                          const newEff = advYr(pol.effectiveDate);
                          const newExp = advYr(pol.expirationDate);
                          const newPol = { ...pol, id: newPolId, effectiveDate: newEff, expirationDate: newExp, premium: pol.premium || 0, status: newEff && newEff <= todayStr ? "Active" : "Pending Renewal", notes: `Renewed from policy ${pol.policyNumber || pol.id}`, documents: {} };
                          let updated = { ...data, policies: [...data.policies, newPol] };
                          // Expire the old policy
                          updated = { ...updated, policies: updated.policies.map(p => p.id === pol.id ? { ...p, status: "Expired" } : p) };
                          updated = addActivity(updated, acct.id, "status_change", `Policy renewed: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
                          setData(updated, { undo: true, message: `Renewed: ${pol.carrier} — ${pol.lob}` });
                          setExpandedPolId(newPolId);
                        }}
                      >🔄 Renew Policy</button>
                      <button
                        style={{ ...S.btn("ghost"), fontSize: 11, color: COLORS.danger, padding: "4px 10px" }}
                        onClick={(e) => { e.stopPropagation(); setDeletingPolicyId(pol.id); }}
                      >🗑 Delete Policy</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* Inactive policies — expandable/editable */}
          {policies.filter(p => p.status !== "Active" && p.status !== "Pending Renewal").length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>INACTIVE ({policies.filter(p => p.status !== "Active" && p.status !== "Pending Renewal").length})</div>
              {policies.filter(p => p.status !== "Active" && p.status !== "Pending Renewal").map(pol => {
                const isExpanded = expandedPolId === pol.id;
                const isAuto = pol.lob === "Auto" || pol.lob === "Commercial Auto";
                return (
                  <div key={pol.id} style={{ ...S.card, marginBottom: 8, padding: 0, overflow: "hidden", opacity: 0.75 }}>
                    <div
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", cursor: "pointer" }}
                      onClick={() => setExpandedPolId(isExpanded ? null : pol.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "0.15s", display: "inline-block" }}>▸</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDim }}>{pol.carrier} {pol.lob}</span>
                        {pol.policyNumber && <span style={{ fontSize: 11, color: COLORS.textMuted }}>#{pol.policyNumber}</span>}
                      </div>
                      <span style={{ ...S.badge(statusColor(pol.status)), fontSize: 10 }}>{pol.status}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.border}` }}>
                        <div style={{ ...S.grid(3), marginTop: 12 }}>
                          <div><div style={S.formLabel}>Carrier</div><select style={iS} value={pol.carrier || ""} onChange={e => upPol(pol.id, "carrier", e.target.value)}>{[...(!cgList.includes(pol.carrier) && pol.carrier ? [pol.carrier] : []), ...cgList].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                          <div><div style={S.formLabel}>LOB</div><select style={iS} value={pol.lob || ""} onChange={e => upPol(pol.id, "lob", e.target.value)}>{lobOpts.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                          <div><div style={S.formLabel}>Policy #</div><input style={iS} value={pol.policyNumber || ""} onChange={e => upPol(pol.id, "policyNumber", e.target.value)} /></div>
                          <div><div style={S.formLabel}>Status</div><select style={iS} value={pol.status || "Active"} onChange={e => upPol(pol.id, "status", e.target.value)}>{POLICY_STATUSES.map(sv => <option key={sv} value={sv}>{sv}</option>)}</select></div>
                          <div><div style={S.formLabel}>Effective</div><input style={iS} type="date" value={pol.effectiveDate || ""} onChange={e => { upPol(pol.id, "effectiveDate", e.target.value); if (e.target.value) { const exp = calcExpiration(e.target.value, pol.lob); if (exp) upPol(pol.id, "expirationDate", exp); } }} /></div>
                          <div><div style={S.formLabel}>Expiration</div><input style={iS} type="date" value={pol.expirationDate || ""} onChange={e => upPol(pol.id, "expirationDate", e.target.value)} /></div>
                          <div><div style={S.formLabel}>Premium</div><input style={iS} type="number" value={pol.premium || ""} onChange={e => upPol(pol.id, "premium", e.target.value)} /></div>
                          {isAuto && <div><div style={S.formLabel}>Vehicles</div><input style={{ ...iS, width: 60 }} type="number" min="1" value={pol.vehicleCount || 1} onChange={e => upPol(pol.id, "vehicleCount", e.target.value)} /></div>}
                          {acct.type === "Commercial" && <div><div style={S.formLabel}>Agency Fee</div><input style={iS} type="number" value={pol.agencyFee || ""} onChange={e => upPol(pol.id, "agencyFee", e.target.value)} placeholder="0" /></div>}
                          {acct.type === "Commercial" && <div><div style={S.formLabel}>Broker</div><select style={iS} value={pol.broker || ""} onChange={e => upPol(pol.id, "broker", e.target.value)}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}{pol.broker && !(config.brokers || []).includes(pol.broker) && <option value={pol.broker}>{pol.broker}</option>}</select></div>}
                        </div>
                        {pol.notes && <div style={{ marginTop: 8, fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>{pol.notes}</div>}
                        <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                          <button
                            style={{ ...S.btn(), fontSize: 11, padding: "4px 10px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const advYr = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); dt.setFullYear(dt.getFullYear() + 1); return dt.toISOString().split("T")[0]; };
                              const newPolId = uid();
                              const newEff = advYr(pol.effectiveDate);
                              const newExp = advYr(pol.expirationDate);
                              const newPol = { ...pol, id: newPolId, effectiveDate: newEff, expirationDate: newExp, premium: pol.premium || 0, status: newEff && newEff <= todayStr ? "Active" : "Pending Renewal", notes: `Renewed from policy ${pol.policyNumber || pol.id}`, documents: {} };
                              let updated = { ...data, policies: [...data.policies, newPol] };
                              updated = addActivity(updated, acct.id, "status_change", `Policy renewed: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
                              setData(updated, { undo: true, message: `Renewed: ${pol.carrier} — ${pol.lob}` });
                              setExpandedPolId(newPolId);
                            }}
                          >🔄 Renew Policy</button>
                          <button
                            style={{ ...S.btn("ghost"), fontSize: 11, color: COLORS.danger, padding: "4px 10px" }}
                            onClick={(e) => { e.stopPropagation(); setDeletingPolicyId(pol.id); }}
                          >🗑 Delete Policy</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Property Details */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>PROPERTY & UNDERWRITING DETAILS</div>
          <div style={S.card}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={S.formLabel}>Property Address</div>
                <input style={iS} value={acct.propertyAddress || ""} onChange={e => updateAccount("propertyAddress", e.target.value)} placeholder="Property / risk address (if different from mailing)" />
              </div>
              <div>
                <div style={S.formLabel}>Mailing Address</div>
                <input style={iS} value={acct.address || ""} onChange={e => updateAccount("address", e.target.value)} placeholder="Street address" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                <div><div style={S.formLabel}>City</div><input style={iS} value={acct.city || ""} onChange={e => updateAccount("city", e.target.value)} /></div>
                <div><div style={S.formLabel}>State</div><input style={{ ...iS, width: 45, textAlign: "center" }} value={acct.state || ""} onChange={e => updateAccount("state", e.target.value)} maxLength={2} /></div>
                <div><div style={S.formLabel}>Zip</div><input style={{ ...iS, width: 65 }} value={acct.zip || ""} onChange={e => updateAccount("zip", e.target.value)} maxLength={5} /></div>
              </div>
              <div style={{ height: 1, background: COLORS.border, margin: "4px 0", opacity: 0.3 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={S.formLabel}>Roof Year</div>
                  <input style={iS} type="number" min="1900" max="2099" value={acct.roofYear || ""} onChange={e => updateAccount("roofYear", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 2018" />
                </div>
                <div>
                  <div style={S.formLabel}>Wind Mitigation</div>
                  <select style={iS} value={acct.windMitigation || "unknown"} onChange={e => updateAccount("windMitigation", e.target.value)}>
                    {WIND_MIT_OPTIONS.map(o => <option key={o} value={o}>{WIND_MIT_LABELS[o]}</option>)}
                  </select>
                </div>
                <div>
                  <div style={S.formLabel}>Construction Type</div>
                  <input style={iS} value={acct.constructionType || ""} onChange={e => updateAccount("constructionType", e.target.value)} placeholder="e.g. CBS, Frame, Masonry" />
                </div>
                <div>
                  <div style={S.formLabel}>Policy Type</div>
                  <select style={iS} value={acct.policyType || "other"} onChange={e => updateAccount("policyType", e.target.value)}>
                    {["auto","home","commercial","umbrella","workers_comp","other"].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1).replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              {acct.type === "Commercial" && (
                <>
                  <div style={{ height: 1, background: COLORS.border, margin: "4px 0", opacity: 0.3 }} />
                  <div>
                    <div style={S.formLabel}>Contact Name (Owner/POC)</div>
                    <input style={iS} value={acct.contactName || ""} onChange={e => updateAccount("contactName", e.target.value)} placeholder="Business owner or point of contact" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contacts section */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>CONTACTS ({(acct.contacts || []).length})</div>
              <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "3px 8px" }} onClick={() => {
                const contacts = [...(acct.contacts || []), { id: uid(), name: "", relationship: "Spouse", phone: "", email: "" }];
                updateAccount("contacts", contacts);
              }}>+ Add Contact</button>
            </div>
            <div style={S.card}>
              {(acct.contacts || []).length === 0 && <div style={{ fontSize: 12, color: COLORS.textDim, padding: 8 }}>No contacts</div>}
              {(acct.contacts || []).map((c, ci) => {
                const isPrimary = ci === 0;
                const updateContact = (field, value) => {
                  const contacts = (acct.contacts || []).map((ct, i) => i === ci ? { ...ct, [field]: value } : ct);
                  if (isPrimary && (field === "phone" || field === "email")) {
                    const up = { ...data, accounts: data.accounts.map(a => a.id === acct.id ? { ...a, contacts, [field]: value } : a) };
                    setData(up);
                  } else {
                    updateAccount("contacts", contacts);
                  }
                };
                const removeContact = () => { if (isPrimary) return; updateAccount("contacts", (acct.contacts || []).filter((_, i) => i !== ci)); };
                return (
                  <div key={c.id || ci} style={{ marginBottom: ci < (acct.contacts || []).length - 1 ? 8 : 0, paddingBottom: ci < (acct.contacts || []).length - 1 ? 8 : 0, borderBottom: ci < (acct.contacts || []).length - 1 ? `1px solid ${COLORS.border}20` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, background: `${COLORS.accent}20`, color: COLORS.accentLight, padding: "1px 6px", borderRadius: 3 }}>PRIMARY</span>}
                      {!isPrimary && <select style={{ background: "transparent", border: "none", fontSize: 11, color: COLORS.textDim, padding: 0, cursor: "pointer", fontWeight: 600 }} value={c.relationship || "Other"} onChange={e => updateContact("relationship", e.target.value)}>{CONTACT_RELATIONSHIPS.filter(r => r !== "Primary").map(r => <option key={r} value={r}>{r}</option>)}</select>}
                      {!isPrimary && <button style={{ marginLeft: "auto", background: "none", border: "none", color: COLORS.textMuted, fontSize: 12, cursor: "pointer", padding: "0 2px" }} onClick={removeContact} title="Remove contact">✕</button>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div><input style={{ ...iS, fontSize: 12, padding: "3px 6px" }} value={c.name || ""} onChange={e => updateContact("name", e.target.value)} placeholder="Name" /></div>
                      <div><input style={{ ...iS, fontSize: 12, padding: "3px 6px" }} value={c.phone || ""} onChange={e => updateContact("phone", e.target.value)} placeholder="Phone" /></div>
                      <div style={{ gridColumn: "span 2" }}><input style={{ ...iS, fontSize: 12, padding: "3px 6px" }} value={c.email || ""} onChange={e => updateContact("email", e.target.value)} placeholder="Email" /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Household section */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>HOUSEHOLD {household ? `(${household.name})` : ""}</div>
              {!acct.householdId && <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "3px 8px" }} onClick={() => setShowHouseholdLink(true)}>+ Link Household</button>}
              {acct.householdId && <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "3px 8px", color: COLORS.danger }} onClick={leaveHousehold}>Leave</button>}
            </div>
            {showHouseholdLink && (
              <div style={{ ...S.card, marginBottom: 8, padding: 10 }}>
                <input style={{ ...S.input, fontSize: 12, marginBottom: 4 }} placeholder="Search client to link as household..." value={householdSearch} onChange={e => setHouseholdSearch(e.target.value)} autoFocus />
                {householdSearchResults.map(a => (
                  <div key={a.id} style={{ padding: "6px 8px", cursor: "pointer", fontSize: 12, borderBottom: `1px solid ${COLORS.border}20`, borderRadius: 4 }}
                    onClick={() => linkToHousehold(a)}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    {a.householdId && <span style={{ fontSize: 10, color: COLORS.accent, marginLeft: 6 }}>(has household)</span>}
                    <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 6 }}>{a.phone || a.email || ""}</span>
                  </div>
                ))}
                {householdSearch && householdSearchResults.length === 0 && <div style={{ fontSize: 12, color: COLORS.textDim, padding: 6 }}>No matches</div>}
                <button style={{ ...S.btn("ghost"), fontSize: 11, marginTop: 4 }} onClick={() => { setShowHouseholdLink(false); setHouseholdSearch(""); }}>Cancel</button>
              </div>
            )}
            {householdMembers.length > 0 && (
              <div style={S.card}>
                {householdMembers.map(m => (
                  <div key={m.id} style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}20`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => onNavigateAccount && onNavigateAccount(m.id)}
                      >{m.name}</span>
                      <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 8 }}>{m.phone || ""}{m.phone && m.email ? " · " : ""}{m.email || ""}</span>
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>{data.policies.filter(p => p.accountId === m.id && p.status === "Active").length} policies</span>
                  </div>
                ))}
              </div>
            )}
            {acct.householdId && householdMembers.length === 0 && !showHouseholdLink && (
              <div style={{ fontSize: 12, color: COLORS.textDim, padding: 8 }}>No other members in this household yet.</div>
            )}
            {!acct.householdId && !showHouseholdLink && (
              <div style={{ fontSize: 12, color: COLORS.textDim, padding: 8 }}>Not linked to a household.</div>
            )}
          </div>

          {/* Household Policies */}
          {householdPolicies.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>HOUSEHOLD POLICIES ({householdPolicies.length})</div>
              <div style={S.card}>
                {householdPolicies.map(p => {
                  const member = data.accounts.find(a => a.id === p.accountId);
                  return (
                    <div key={p.id} style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}20`, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{member ? member.name : p.accountName}</span>
                      <span style={{ color: COLORS.textDim }}> — {p.carrier} {p.lob}</span>
                      <span style={{ color: COLORS.textMuted, marginLeft: 6 }}>{p.policyNumber}</span>
                      {p.expirationDate && <span style={{ color: COLORS.textMuted, marginLeft: 6 }}>exp {fmtShort(p.expirationDate)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== SERVICE ITEMS SECTION ===== */}
      <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>
              SERVICE ITEMS ({serviceItems.filter(s => s.status !== "Done").length} active{serviceItems.filter(s => s.status === "Done").length > 0 ? `, ${serviceItems.filter(s => s.status === "Done").length} completed` : ""})
            </div>
            <button style={{ ...S.btn(), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowAddSI(!showAddSI)}>{showAddSI ? "Cancel" : "+ Add Service Item"}</button>
          </div>
          {showAddSI && (
            <div style={{ ...S.card, marginBottom: 8, padding: 12, background: `${COLORS.accent}08`, border: `1px solid ${COLORS.accent}20` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Type</div><select style={{ ...S.input, fontSize: 12, padding: "6px 8px" }} value={siForm.type} onChange={e => setSiForm({ ...siForm, type: e.target.value })}>{SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Policy (optional)</div><select style={{ ...S.input, fontSize: 12, padding: "6px 8px" }} value={siForm.policyId} onChange={e => setSiForm({ ...siForm, policyId: e.target.value })}><option value="">— none —</option>{policies.map(p => <option key={p.id} value={p.id}>{p.carrier} — {p.lob} ({p.policyNumber || "—"})</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Description</div><input style={{ ...S.input, fontSize: 12, padding: "6px 8px", width: "100%" }} value={siForm.description} onChange={e => setSiForm({ ...siForm, description: e.target.value })} placeholder="Brief description..." /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Due Date</div><input style={{ ...S.input, fontSize: 12, padding: "6px 8px" }} type="date" value={siForm.dueDate} onChange={e => setSiForm({ ...siForm, dueDate: e.target.value })} /></div>
                <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Amount Due</div><input style={{ ...S.input, fontSize: 12, padding: "6px 8px" }} type="number" min="0" value={siForm.amountDue} onChange={e => setSiForm({ ...siForm, amountDue: e.target.value })} placeholder="0" /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...S.btn(), background: COLORS.success, fontSize: 11 }} onClick={() => {
                  const linkedPol = siForm.policyId ? data.policies.find(p => p.id === siForm.policyId) : null;
                  const newItem = {
                    id: uid(), type: siForm.type, accountId: acct.id, accountName: acct.name,
                    policyId: siForm.policyId || "", policyNumber: linkedPol?.policyNumber || "", carrier: linkedPol?.carrier || "", lob: linkedPol?.lob || "",
                    description: siForm.description, dueDate: siForm.dueDate, amountDue: Number(siForm.amountDue) || 0,
                    status: "Uncontacted", urgency: "Medium", assignedTo: config.agentName || "Agent",
                    created: todayStr, lastAction: "", lastActionDate: "", followUpDate: "", nextStep: "",
                    notes: "", ballInCourt: false, flags: [], contactAttempts: []
                  };
                  let updated = { ...data, serviceItems: [...data.serviceItems, newItem] };
                  updated = addActivity(updated, acct.id, "service_created", `Service item created: ${siForm.type}`, siForm.description);
                  setData(updated);
                  setShowAddSI(false);
                  setSiForm({ type: "Ivantage Renewal", policyId: "", description: "", dueDate: "", amountDue: "" });
                }}>Create</button>
                <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={() => setShowAddSI(false)}>Cancel</button>
              </div>
            </div>
          )}
        {serviceItems.length > 0 && (
          <div style={S.card}>
            {serviceItems.filter(s => s.status !== "Done").sort((a, b) => (a.dueDate || "z").localeCompare(b.dueDate || "z")).map((si, i, arr) => {
              const sbStyle = statusBadgeStyle(si.status);
              const daysTo = si.dueDate ? daysBetween(todayStr, si.dueDate) : null;
              const dueDateColor = daysTo !== null && daysTo >= 0 && daysTo <= 14 ? "#ef4444" : daysTo !== null && daysTo >= 0 && daysTo <= 30 ? "#f59e0b" : COLORS.textDim;
              return (
                <div key={si.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}20` : "none" }}>
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: sbStyle.background, color: sbStyle.color }}>{si.status}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{si.type}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 1 }}>
                      {si.description || [si.carrier, si.lob].filter(Boolean).join(" ") || "—"}
                      {si.policyNumber ? ` · #${si.policyNumber}` : ""}
                    </div>
                  </div>
                  {si.dueDate && (
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: dueDateColor }}>
                        {fmtShort(si.dueDate)}
                      </div>
                      {daysTo !== null && daysTo >= 0 && daysTo <= 60 && (
                        <div style={{ fontSize: 10, color: dueDateColor }}>{daysTo}d</div>
                      )}
                    </div>
                  )}
                  {si.urgency && (
                    <div style={{ flexShrink: 0 }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, fontWeight: 600, background: si.urgency === "High" || si.urgency === "Critical" ? "#ef444420" : si.urgency === "Medium" ? "#f59e0b20" : `${COLORS.border}`, color: si.urgency === "High" || si.urgency === "Critical" ? "#f87171" : si.urgency === "Medium" ? "#f59e0b" : COLORS.textDim }}>{si.urgency}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {serviceItems.filter(s => s.status !== "Done").length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted, padding: "8px 0" }}>All service items completed</div>
            )}
            {serviceItems.filter(s => s.status === "Done").length > 0 && (
              <details style={{ marginTop: 8, borderTop: `1px solid ${COLORS.border}20`, paddingTop: 8 }}>
                <summary style={{ fontSize: 11, color: COLORS.textMuted, cursor: "pointer", userSelect: "none" }}>
                  Completed ({serviceItems.filter(s => s.status === "Done").length})
                </summary>
                {serviceItems.filter(s => s.status === "Done").sort((a, b) => (b.lastActionDate || "").localeCompare(a.lastActionDate || "")).map(si => (
                  <div key={si.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", opacity: 0.5 }}>
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: statusBadgeStyle("Done").background, color: statusBadgeStyle("Done").color, fontWeight: 600 }}>{si.lastAction || "Done"}</span>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: COLORS.textDim }}>{si.type} · {si.description || [si.carrier, si.lob].filter(Boolean).join(" ") || "—"}</div>
                    {si.lastActionDate && <div style={{ fontSize: 11, color: COLORS.textMuted, flexShrink: 0 }}>{fmtShort(si.lastActionDate)}</div>}
                  </div>
                ))}
              </details>
            )}
          </div>
      )}
      </div>

      {/* ===== BOTTOM SECTION: Combined Activity Feed ===== */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>ACTIVITY & SERVICE LOG ({combinedFeed.length})</div>
          {!showServiceForm && <button style={{ ...S.btn(), fontSize: 11, padding: "4px 12px" }} onClick={() => onLogService ? onLogService(acct.id) : setShowServiceForm(true)}>+ Log Service Update</button>}
        </div>

        {/* Inline service log form */}
        {showServiceForm && (
          <div style={{ ...S.card, marginBottom: 12, padding: 14, border: `1px solid ${COLORS.accent}30`, background: `${COLORS.accent}05` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ width: 160 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 3 }}>Type</div>
                <select style={{ ...iS, fontSize: 12 }} value={serviceForm.type} onChange={e => setServiceForm({ ...serviceForm, type: e.target.value })}>
                  {SERVICE_LOG_TYPES.map(t => <option key={t} value={t}>{SERVICE_LOG_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 3 }}>Note</div>
                <input
                  style={{ ...iS, fontSize: 12 }}
                  value={serviceForm.note}
                  onChange={e => setServiceForm({ ...serviceForm, note: e.target.value })}
                  placeholder="What happened..."
                  onKeyDown={e => { if (e.key === "Enter" && serviceForm.note.trim()) logServiceUpdate(); }}
                  autoFocus
                />
              </div>
              <button style={{ ...S.btn(), fontSize: 12, padding: "6px 16px", opacity: serviceForm.note.trim() ? 1 : 0.5 }} onClick={logServiceUpdate} disabled={!serviceForm.note.trim()}>Save</button>
              <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 10px" }} onClick={() => { setShowServiceForm(false); setServiceForm({ type: "general", note: "" }); }}>✕</button>
            </div>
          </div>
        )}

        {/* Note input — always visible */}
        <div style={{ ...S.card, marginBottom: 12, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="cdv-note-input"
            style={{ ...S.input, flex: 1, fontSize: 12, padding: "6px 10px", border: "none", background: `${COLORS.border}40` }}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Quick note..."
            onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) addNote(); }}
          />
          <button style={{ ...S.btn(), fontSize: 12, padding: "6px 14px", opacity: noteText.trim() ? 1 : 0.5 }} onClick={addNote} disabled={!noteText.trim()}>Add Note</button>
        </div>

        {/* Feed timeline */}
        <div style={S.card}>
          {combinedFeed.length > 0 ? (
            <div>
              {combinedFeed.map((entry, i) => {
                const tColor = feedTypeColor(entry.type);
                return (
                  <div key={entry.id + "-" + i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < combinedFeed.length - 1 ? `1px solid ${COLORS.border}20` : "none" }}>
                    {/* Date column */}
                    <div style={{ width: 80, flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: COLORS.textDim }}>{entry.date ? new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>{entry.date && entry.date.includes("T") ? new Date(entry.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</div>
                    </div>
                    {/* Type badge */}
                    <div style={{ width: 90, flexShrink: 0 }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${tColor}20`, color: tColor }}>{feedTypeLabel(entry.type)}</span>
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {entry.source === "activity" && <div style={{ fontSize: 13, fontWeight: 500 }}>{entry.description}</div>}
                      {entry.detail && <div style={{ fontSize: 12, color: entry.source === "note" ? COLORS.text : COLORS.textDim, marginTop: entry.source === "activity" ? 2 : 0, whiteSpace: "pre-wrap" }}>{entry.detail}</div>}
                      {entry.source === "serviceLog" && <div style={{ fontSize: 12, color: COLORS.textDim }}>{entry.detail}</div>}
                    </div>
                    {/* Pin + Author */}
                    <div style={{ width: 70, flexShrink: 0, textAlign: "right", alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>{entry.author || ""}</div>
                      {entry.source === "note" && (
                        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, color: entry.pinned ? COLORS.warning : COLORS.textMuted, opacity: entry.pinned ? 1 : 0.5 }}
                          onClick={() => togglePinNote(entry.id)} title={entry.pinned ? "Unpin note" : "Pin note"}>
                          {entry.pinned ? "📌" : "📌"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={S.emptyState}>No activity yet. Log a service update or add a note to get started.</div>
          )}
        </div>
      </div>

      {renewalPopupSI && <RenewalPopup si={renewalPopupSI} data={data} setData={setData} config={config} onClose={() => setRenewalPopupSI(null)} />}
      {cancellingPolicyId && <CancellationModal policyId={cancellingPolicyId} data={data} setData={setData} config={config} onClose={() => setCancellingPolicyId(null)} />}
      {showTemplate && <TemplateModal onClose={() => setShowTemplate(null)} accountName={showTemplate.accountName} policy={showTemplate.policy} data={data} config={config} />}

      {/* Delete Policy Confirmation Modal */}
      {deletingPolicyId && (() => {
        const pol = data.policies.find(p => p.id === deletingPolicyId);
        if (!pol) return null;
        const linkedSIs = (data.serviceItems || []).filter(s => s.policyId === deletingPolicyId);
        const linkedCerts = (data.certificates || []).filter(c => (c.policyIds || []).includes(deletingPolicyId));
        return (
          <div style={S.overlay} onClick={() => setDeletingPolicyId(null)} data-modal="true">
            <div style={{ ...S.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.danger }}>🗑 Delete Policy</div>
                <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setDeletingPolicyId(null)}>✕</button>
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                Delete <strong>{pol.carrier} — {pol.lob}</strong> #{pol.policyNumber || "—"} (${(pol.premium || 0).toLocaleString()})?
              </div>
              {linkedSIs.length > 0 && (
                <div style={{ background: `${COLORS.warning}10`, border: `1px solid ${COLORS.warning}30`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 12 }}>
                  {linkedSIs.length} linked service item{linkedSIs.length !== 1 ? "s" : ""} will also be deleted.
                </div>
              )}
              {linkedCerts.length > 0 && (
                <div style={{ background: `${COLORS.warning}10`, border: `1px solid ${COLORS.warning}30`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 12 }}>
                  {linkedCerts.length} certificate{linkedCerts.length !== 1 ? "s" : ""} reference this policy.
                </div>
              )}
              <div style={{ background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`, borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 12, color: COLORS.danger }}>
                This action can be undone.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={S.btn("ghost")} onClick={() => setDeletingPolicyId(null)}>Cancel</button>
                <button style={{ ...S.btn(), background: COLORS.danger, color: "#fff" }} onClick={() => {
                  let updated = { ...data };
                  updated.policies = updated.policies.filter(p => p.id !== deletingPolicyId);
                  updated.serviceItems = (updated.serviceItems || []).filter(s => s.policyId !== deletingPolicyId);
                  // Remove policy from certificates' policyIds arrays
                  updated.certificates = (updated.certificates || []).map(c =>
                    (c.policyIds || []).includes(deletingPolicyId) ? { ...c, policyIds: c.policyIds.filter(pid => pid !== deletingPolicyId) } : c
                  );
                  updated = addActivity(updated, acct.id, "status_change", `Policy deleted: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
                  setData(updated, { undo: true, message: `Deleted ${pol.carrier} ${pol.lob} policy` });
                  setDeletingPolicyId(null);
                  setExpandedPolId(null);
                }}>Delete Policy</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && onDelete && (() => {
        const polCount = data.policies.filter(p => p.accountId === acct.id).length;
        const siCount = (data.serviceItems || []).filter(s => s.accountId === acct.id).length;
        const taskCount = (data.tasks || []).filter(t => t.linkedId === acct.id && t.linkedType === "account").length;
        const noteCount = (data.notes || []).filter(n => n.accountId === acct.id).length;
        const certCount = (data.certificates || []).filter(c => c.accountId === acct.id).length;
        const totalRelated = polCount + siCount + taskCount + noteCount + certCount;

        return (
          <div style={S.overlay} onClick={() => setShowDeleteConfirm(false)} data-modal="true">
            <div style={{ ...S.modal, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.danger }}>🗑 Delete Account</div>
                <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setShowDeleteConfirm(false)}>✕</button>
              </div>

              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Are you sure you want to delete <strong>{acct.name}</strong>?
              </div>

              {totalRelated > 0 && (
                <div style={{ background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.danger, marginBottom: 8 }}>The following related data will also be deleted:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12 }}>
                    {polCount > 0 && <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>📋 {polCount} {polCount === 1 ? "policy" : "policies"}</div>}
                    {siCount > 0 && <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>🔧 {siCount} service item{siCount !== 1 ? "s" : ""}</div>}
                    {taskCount > 0 && <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>✅ {taskCount} task{taskCount !== 1 ? "s" : ""}</div>}
                    {noteCount > 0 && <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>📝 {noteCount} note{noteCount !== 1 ? "s" : ""}</div>}
                    {certCount > 0 && <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>▣ {certCount} certificate{certCount !== 1 ? "s" : ""}</div>}
                  </div>
                </div>
              )}

              <div style={{ background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`, borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 12, color: COLORS.danger }}>
                This action can be undone.
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={S.btn("ghost")} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button style={{ ...S.btn(), background: COLORS.danger, color: "#fff" }} onClick={() => { setShowDeleteConfirm(false); onDelete(); }}>Delete Account</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ==================== CLIENTS ====================
function Clients({ data, setData, initialAccountId, clearInitial, config, onLogService }) {
  const todayStr = today();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef(null);
  const handleSearch = useCallback((val) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 200);
  }, []);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [noteText, setNoteText] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", dueDate: "", priority: "Medium" });
  const [showServiceAdd, setShowServiceAdd] = useState(false);
  const [serviceForm, setServiceForm] = useState({ type: "Ivantage Renewal", policyId: "", description: "", dueDate: "", amountDue: "" });
  const [showTemplate, setShowTemplate] = useState(null);
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly", broker: "", agencyFee: "", commissionPct: 10 });
  const [confirmDeletePolicy, setConfirmDeletePolicy] = useState(null);
  const [expandedPolicyId, setExpandedPolicyId] = useState(null);
  const [expandedPolTab, setExpandedPolTab] = useState("info");
  const [checkedClients, setCheckedClients] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [lastCheckedIdx, setLastCheckedIdx] = useState(null);
  const [cancellingPolicyId, setCancellingPolicyId] = useState(null);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTarget, setMergeTarget] = useState(null);
  const emptyClientForm = { name: "", type: "Personal", phone: "", email: "", address: "", city: "Fort Lauderdale", state: "FL", zip: "", policyType: "other", lineOfBusiness: "personal", carrier: "", autoItemCount: 0, xDate: "", xDateSource: "", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "new_lead", serviceLog: [] };
  const [form, setForm] = useState(emptyClientForm);

  // Filter state for new list view
  const [pipelineFilters, setPipelineFilters] = useState(new Set());
  const [lobFilter, setLobFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [xDateRange, setXDateRange] = useState("all");
  const [missingFilter, setMissingFilter] = useState(""); // "" | "email" | "phone"
  const [sortCol, setSortCol] = useState("xDate");
  const [sortDir, setSortDir] = useState("asc");
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editCellValue, setEditCellValue] = useState("");

  useEffect(() => {
    if (initialAccountId) {
      const account = data.accounts.find(a => a.id === initialAccountId);
      if (account) { setSelected(account); setDetailTab("overview"); }
      if (clearInitial) clearInitial();
    }
  }, [initialAccountId]);

  // Lookup maps for O(1) access by ID
  const accountMap = useMemo(() => {
    const map = {};
    for (const a of data.accounts) map[a.id] = a;
    return map;
  }, [data.accounts]);

  const policyMap = useMemo(() => {
    const map = {};
    for (const p of data.policies) map[p.id] = p;
    return map;
  }, [data.policies]);

  // Unique carriers from data
  const uniqueCarriers = useMemo(() => {
    const set = new Set();
    data.accounts.forEach(a => { if (a.carrier) set.add(a.carrier); });
    return [...set].sort();
  }, [data.accounts]);

  // Filtered + sorted accounts
  const filtered = useMemo(() => {
    const searchLower = debouncedSearch.toLowerCase();
    let result = data.accounts.filter(a => {
      // Search across name, phone, email, address
      if (debouncedSearch) {
        const match = (a.name || "").toLowerCase().includes(searchLower)
          || (a.phone || "").toLowerCase().includes(searchLower)
          || (a.email || "").toLowerCase().includes(searchLower)
          || (a.address || "").toLowerCase().includes(searchLower)
          || (a.propertyAddress || "").toLowerCase().includes(searchLower);
        if (!match) return false;
      }
      // Pipeline status filter
      if (pipelineFilters.size > 0 && !pipelineFilters.has(a.pipelineStatus || "service_only")) return false;
      // Line of business filter
      if (lobFilter !== "all" && (a.lineOfBusiness || "personal") !== lobFilter) return false;
      // Carrier filter
      if (carrierFilter !== "all" && a.carrier !== carrierFilter) return false;
      // X-date range filter
      if (xDateRange !== "all" && a.xDate) {
        const days = daysBetween(todayStr, a.xDate);
        if (xDateRange === "30" && (days < 0 || days > 30)) return false;
        if (xDateRange === "60" && (days < 0 || days > 60)) return false;
        if (xDateRange === "90" && (days < 0 || days > 90)) return false;
      } else if (xDateRange !== "all" && !a.xDate) {
        return false;
      }
      // Missing email/phone filter
      if (missingFilter === "email" && a.email) return false;
      if (missingFilter === "phone" && a.phone) return false;
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "name": va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase(); break;
        case "phone": va = a.phone || ""; vb = b.phone || ""; break;
        case "email": va = (a.email || "").toLowerCase(); vb = (b.email || "").toLowerCase(); break;
        case "pipelineStatus": va = PIPELINE_STATUS_LABELS[a.pipelineStatus || "service_only"] || ""; vb = PIPELINE_STATUS_LABELS[b.pipelineStatus || "service_only"] || ""; break;
        case "carrier": va = a.carrier || ""; vb = b.carrier || ""; break;
        case "policyType": va = a.policyType || ""; vb = b.policyType || ""; break;
        case "xDate": va = a.xDate || "9999-99-99"; vb = b.xDate || "9999-99-99"; break;
        case "autoItemCount": va = a.autoItemCount || 0; vb = b.autoItemCount || 0; break;
        default: va = a.xDate || "9999-99-99"; vb = b.xDate || "9999-99-99";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [data.accounts, debouncedSearch, pipelineFilters, lobFilter, carrierFilter, xDateRange, missingFilter, sortCol, sortDir, todayStr]);

  // Allstate quota tracker: auto items bound this calendar month
  const autoItemsThisMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let count = 0;
    data.policies.forEach(p => {
      if (p.status === "Active" && p.effectiveDate) {
        const dt = new Date(p.effectiveDate + "T00:00:00");
        if (dt.getFullYear() === year && dt.getMonth() === month) {
          const acct = accountMap[p.accountId];
          if (acct) count += (acct.autoItemCount || 0);
        }
      }
    });
    return count;
  }, [data.policies, accountMap]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const togglePipelineFilter = (status) => {
    setPipelineFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const xDateColor = (xDate) => {
    if (!xDate) return COLORS.textDim;
    const days = daysBetween(todayStr, xDate);
    if (days <= 30) return COLORS.danger;
    if (days <= 60) return COLORS.warning;
    return COLORS.text;
  };

  const sortArrow = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const newAccount = { ...form, name: form.name.trim(), id: uid(), status: "Active", created: todayStr, lineOfBusiness: form.type === "Commercial" ? "commercial" : form.lineOfBusiness };
    const updated = { ...data, accounts: [...data.accounts, newAccount] };
    setData(updated, { undo: true, message: `Added client: ${newAccount.name}` });
    setShowAdd(false);
    setForm(emptyClientForm);
    setSelected(newAccount);
    setDetailTab("overview");
    setShowAddPolicy(true);
  };

  const addNote = () => {
    if (!noteText.trim() || !selected) return;
    const note = { id: uid(), accountId: selected.id, text: noteText.trim(), createdBy: config.agentName || "Agent", createdAt: new Date().toISOString() };
    let updated = { ...data, notes: [...(data.notes || []), note] };
    updated = addActivity(updated, selected.id, "note_added", "Note added", noteText.trim());
    setData(updated);
    setNoteText("");
  };

  const addTask = () => {
    if (!taskForm.title.trim() || !selected) return;
    const newTask = { id: uid(), title: taskForm.title.trim(), linkedType: "account", linkedId: selected.id, linkedName: selected.name, assignedTo: config.agentName || "Agent", dueDate: taskForm.dueDate, priority: taskForm.priority, status: "Open", created: todayStr };
    let updated = { ...data, tasks: [...data.tasks, newTask] };
    updated = addActivity(updated, selected.id, "task_created", "Task created", taskForm.title.trim());
    setData(updated);
    setShowTaskForm(false);
    setTaskForm({ title: "", dueDate: "", priority: "Medium" });
  };

  const toggleTaskComplete = (id) => {
    const t = data.tasks.find(x => x.id === id);
    const newStatus = t && t.status === "Completed" ? "Open" : "Completed";
    let updated = { ...data, tasks: data.tasks.map(x => x.id === id ? { ...x, status: newStatus } : x) };
    if (selected) {
      updated = addActivity(updated, selected.id, newStatus === "Completed" ? "task_completed" : "task_reopened", `Task ${newStatus === "Completed" ? "completed" : "reopened"}`, t ? t.title : "");
    }
    setData(updated);
  };

  const selectedPolicies = selected ? data.policies.filter(p => p.accountId === selected.id) : [];
  const selectedServices = selected ? data.serviceItems.filter(si => si.accountId === selected.id) : [];
  const selectedTasks = selected ? data.tasks.filter(t => t.linkedId === selected.id && t.linkedType === "account") : [];
  const selectedNotes = selected ? (data.notes || []).filter(n => n.accountId === selected.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) : [];
  const selectedActivities = selected ? (data.activities || []).filter(a => a.accountId === selected.id).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) : [];

  // Update account fields inline
  const updateAccount = (field, value) => {
    const updated = { ...data, accounts: data.accounts.map(a => a.id === selected.id ? { ...a, [field]: value } : a) };
    // Also update accountName in related records if name changed
    if (field === "name") {
      updated.policies = updated.policies.map(p => p.accountId === selected.id ? { ...p, accountName: value } : p);
      updated.serviceItems = updated.serviceItems.map(si => si.accountId === selected.id ? { ...si, accountName: value } : si);
    }
    setData(updated);
    setSelected({ ...selected, [field]: value });
  };

  // Cross-sell gap analysis for selected client
  const crossSellGaps = useMemo(() => {
    if (!selected) return [];
    const acctPolicies = selectedPolicies.filter(p => p.status === "Active");
    const lobs = acctPolicies.map(p => p.lob);
    const gaps = [];
    const hasAuto = lobs.includes("Auto");
    const hasHome = lobs.some(l => ["Home","Homeowners","Condo","Renters","DP-3","DP-1"].includes(l));
    const hasUmbrella = lobs.includes("Umbrella");
    const hasLife = lobs.includes("Life");
    const isPersonal = selected.type === "Personal";
    const isCommercial = selected.type === "Commercial";
    if (isPersonal && hasHome && !hasAuto) gaps.push({ gap: "Auto", reason: "Has Home but no Auto", est: 1800 });
    if (isPersonal && hasAuto && !hasHome) gaps.push({ gap: "Home/Renters", reason: "Has Auto but no Home", est: 2400 });
    if (isPersonal && (hasAuto || hasHome) && !hasUmbrella) gaps.push({ gap: "Umbrella", reason: "No Umbrella policy", est: 350 });
    if (isPersonal && acctPolicies.length > 0 && !hasLife) gaps.push({ gap: "Life", reason: "No Life policy", est: 600 });
    if (isCommercial && !lobs.includes("Workers Comp")) gaps.push({ gap: "Workers Comp", reason: "No Workers Comp", est: 3000 });
    if (isCommercial && !lobs.includes("Commercial Auto")) gaps.push({ gap: "Commercial Auto", reason: "No Commercial Auto", est: 2500 });
    return gaps;
  }, [selected, selectedPolicies]);

  // Contact history across all service items for this client
  const contactHistory = useMemo(() => {
    if (!selected) return [];
    const all = [];
    selectedServices.forEach(si => {
      (si.contactAttempts || []).forEach(c => {
        all.push({ ...c, serviceType: si.type, serviceDesc: si.description, serviceId: si.id });
      });
    });
    return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [selected, selectedServices]);

  // Upcoming renewals for selected client
  const upcomingRenewals = useMemo(() => {
    if (!selected) return [];
    return selectedPolicies.filter(p => {
      if (p.status !== "Active" || !p.expirationDate) return false;
      const days = daysBetween(todayStr, p.expirationDate);
      return days >= 0 && days <= 90;
    }).sort((a, b) => (a.expirationDate || "").localeCompare(b.expirationDate || ""));
  }, [selected, selectedPolicies]);

  const activityIcon = (type) => {
    const icons = { note_added: "📝", task_created: "☐", task_completed: "✓", task_reopened: "↺", contact_attempt: "📞", service_created: "⚙", status_change: "↻", policy_added: "📋" };
    return icons[type] || "•";
  };

  const activityColor = (type) => {
    const colors = { note_added: COLORS.info, task_created: COLORS.accent, task_completed: COLORS.success, task_reopened: COLORS.warning, contact_attempt: COLORS.accentLight, service_created: COLORS.warning, status_change: "#f97316", policy_added: COLORS.success };
    return colors[type] || COLORS.textDim;
  };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const DETAIL_TABS = [
    { id: "overview", label: "Overview" },
    { id: "policies", label: "Policies", count: selectedPolicies.length },
    { id: "service", label: "Service Items", count: selectedServices.length },
    { id: "tasks", label: "Tasks", count: selectedTasks.filter(t => t.status !== "Completed").length },
    { id: "activity", label: "Activity", count: selectedActivities.length },
    { id: "notes", label: "Notes", count: selectedNotes.length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)", position: "relative" }}>
      {!selected ? (
        <>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
            <div style={S.pageTitle}>Clients</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: COLORS.textDim, fontSize: 12 }}>{filtered.length} clients</span>
              <button style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px", border: `1px solid ${COLORS.border}` }} onClick={() => onLogService && onLogService(null)}>+ Log Service Update <span style={{ fontSize: 10, color: COLORS.textMuted }}>(Ctrl+L)</span></button>
              <button style={S.btn()} onClick={() => setShowAdd(true)}>+ New Client</button>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ marginBottom: 10, flexShrink: 0 }}>
            <input
              style={{ ...S.input, padding: "10px 14px", fontSize: 14 }}
              placeholder="Search by name, phone, email, or address..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>

          {/* Filter row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, flexShrink: 0, padding: "8px 0" }}>
            {/* Pipeline status chips */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginRight: 4 }}>PIPELINE:</span>
              {PIPELINE_STATUS_FLOW.map(status => {
                const active = pipelineFilters.has(status);
                return (
                  <span
                    key={status}
                    onClick={() => togglePipelineFilter(status)}
                    style={{
                      padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: "pointer",
                      background: active ? `${PIPELINE_STATUS_COLORS[status]}30` : `${COLORS.border}40`,
                      color: active ? PIPELINE_STATUS_COLORS[status] : COLORS.textDim,
                      border: `1px solid ${active ? PIPELINE_STATUS_COLORS[status] : COLORS.border}`,
                    }}
                  >
                    {PIPELINE_STATUS_LABELS[status]}
                  </span>
                );
              })}
            </div>

            <div style={{ width: 1, height: 20, background: COLORS.border, margin: "0 4px" }} />

            {/* LOB filter */}
            <select style={{ ...S.select, fontSize: 12, padding: "5px 8px" }} value={lobFilter} onChange={e => setLobFilter(e.target.value)}>
              <option value="all">All LOB</option>
              <option value="personal">Personal</option>
              <option value="commercial">Commercial</option>
            </select>

            {/* Carrier filter */}
            <select style={{ ...S.select, fontSize: 12, padding: "5px 8px" }} value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}>
              <option value="all">All Carriers</option>
              {uniqueCarriers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* X-date range */}
            <select style={{ ...S.select, fontSize: 12, padding: "5px 8px" }} value={xDateRange} onChange={e => setXDateRange(e.target.value)}>
              <option value="all">X-Date: All</option>
              <option value="30">Next 30 Days</option>
              <option value="60">Next 60 Days</option>
              <option value="90">Next 90 Days</option>
            </select>

            <div style={{ width: 1, height: 20, background: COLORS.border, margin: "0 4px" }} />

            {/* Missing info chips */}
            {["email", "phone"].map(f => {
              const active = missingFilter === f;
              const count = data.accounts.filter(a => !a[f]).length;
              return (
                <span key={f} onClick={() => setMissingFilter(active ? "" : f)}
                  style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: "pointer",
                    background: active ? `${COLORS.warning}30` : `${COLORS.border}40`,
                    color: active ? COLORS.warning : COLORS.textDim,
                    border: `1px solid ${active ? COLORS.warning : COLORS.border}`,
                  }}>
                  Missing {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                </span>
              );
            })}
          </div>

          {/* Bulk action bar */}
          {checkedClients.size > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", marginBottom: 8, background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accent}30`, borderRadius: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{checkedClients.size} selected</span>
              <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => {
                const rows = filtered.filter(a => checkedClients.has(a.id));
                const csv = ["Name,Phone,Email,Carrier,X-Date,Pipeline"].concat(
                  rows.map(a => [a.name, a.phone || "", a.email || "", a.carrier || "", a.xDate || "", PIPELINE_STATUS_LABELS[a.pipelineStatus || "service_only"] || ""].map(v => `"${v}"`).join(","))
                ).join("\n");
                navigator.clipboard.writeText(csv);
              }}>Copy CSV</button>
              <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 10px", color: COLORS.danger }} onClick={() => {
                if (!confirmBulkDelete) { setConfirmBulkDelete(true); return; }
                let updated = { ...data };
                checkedClients.forEach(id => {
                  updated.accounts = updated.accounts.filter(a => a.id !== id);
                  updated.policies = updated.policies.filter(p => p.accountId !== id);
                  updated.serviceItems = (updated.serviceItems || []).filter(s => s.accountId !== id);
                  updated.tasks = (updated.tasks || []).filter(t => !(t.linkedId === id && t.linkedType === "account"));
                  updated.notes = (updated.notes || []).filter(n => n.accountId !== id);
                  updated.activities = (updated.activities || []).filter(a2 => a2.accountId !== id);
                  updated.certificates = (updated.certificates || []).filter(c => c.accountId !== id);
                });
                setData(updated, { undo: true, message: `Deleted ${checkedClients.size} clients` });
                setCheckedClients(new Set());
                setConfirmBulkDelete(false);
              }}>{confirmBulkDelete ? "Confirm Delete" : "Delete"}</button>
              {confirmBulkDelete && <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => setConfirmBulkDelete(false)}>Cancel</button>}
              <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 10px" }} onClick={() => { setCheckedClients(new Set()); setConfirmBulkDelete(false); }}>Clear Selection</button>
            </div>
          )}

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", marginBottom: 48 }}>
            <table style={{ ...S.table, tableLayout: "fixed" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10, background: COLORS.card }}>
                <tr>
                  <th style={{ ...S.th, width: "3%", padding: "8px 4px" }}>
                    <input type="checkbox" checked={checkedClients.size === filtered.length && filtered.length > 0}
                      onChange={() => { if (checkedClients.size === filtered.length) setCheckedClients(new Set()); else setCheckedClients(new Set(filtered.map(a => a.id))); }} />
                  </th>
                  {[
                    { key: "name", label: "Name", width: "17%" },
                    { key: "phone", label: "Phone", width: "11%" },
                    { key: "email", label: "Email", width: "14%" },
                    { key: "pipelineStatus", label: "Pipeline Status", width: "12%" },
                    { key: "carrier", label: "Carrier", width: "10%" },
                    { key: "policyType", label: "Policy Type", width: "9%" },
                    { key: "xDate", label: "X-Date", width: "11%" },
                    { key: "autoItemCount", label: "Auto Items", width: "8%" },
                  ].map(col => (
                    <th
                      key={col.key}
                      style={{ ...S.th, width: col.width, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{sortArrow(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => {
                  const rowBg = checkedClients.has(a.id) ? `${COLORS.accent}12` : idx % 2 === 0 ? COLORS.card : COLORS.bg;
                  const cellStyle = { padding: "8px 12px", fontSize: 13, borderBottom: `1px solid ${COLORS.border}` };
                  const pStatus = a.pipelineStatus || "service_only";
                  const isEditing = (field) => editingCell && editingCell.id === a.id && editingCell.field === field;
                  const startEdit = (field, currentVal, e) => { e.stopPropagation(); setEditingCell({ id: a.id, field }); setEditCellValue(currentVal || ""); };
                  const saveEdit = () => { if (!editingCell) return; const updated = { ...data, accounts: data.accounts.map(x => x.id === editingCell.id ? { ...x, [editingCell.field]: editCellValue } : x) }; setData(updated); setEditingCell(null); };
                  const cancelEdit = () => setEditingCell(null);
                  return (
                    <tr
                      key={a.id}
                      style={{ cursor: "pointer", background: rowBg }}
                      onClick={() => { if (editingCell) return; setSelected(a); setDetailTab("overview"); }}
                      onMouseEnter={e => { if (!editingCell) e.currentTarget.style.background = COLORS.cardHover; }}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      <td style={{ ...cellStyle, padding: "8px 4px", textAlign: "center" }}>
                        <input type="checkbox" checked={checkedClients.has(a.id)} onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const next = new Set(checkedClients);
                            if (e.nativeEvent.shiftKey && lastCheckedIdx !== null) {
                              const from = Math.min(lastCheckedIdx, idx); const to = Math.max(lastCheckedIdx, idx);
                              for (let j = from; j <= to; j++) next.add(filtered[j].id);
                            } else { if (next.has(a.id)) next.delete(a.id); else next.add(a.id); }
                            setCheckedClients(next); setLastCheckedIdx(idx);
                          }} />
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: COLORS.accentLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                        {!a.email && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${COLORS.warning}15`, color: COLORS.warning, fontWeight: 600, marginLeft: 6 }}>No Email</span>}
                        {!a.phone && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${COLORS.warning}15`, color: COLORS.warning, fontWeight: 600, marginLeft: 6 }}>No Phone</span>}
                      </td>
                      <td style={cellStyle} onDoubleClick={e => startEdit("phone", a.phone, e)}>
                        {isEditing("phone") ? (
                          <input style={{ ...S.input, fontSize: 12, padding: "3px 6px", width: "100%" }} value={editCellValue} onChange={e => setEditCellValue(e.target.value)}
                            onBlur={saveEdit} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} autoFocus onClick={e => e.stopPropagation()} />
                        ) : (
                          <a href={`tel:${a.phone}`} onClick={e => e.stopPropagation()} style={{ color: COLORS.accentLight, textDecoration: "none" }}>{a.phone || "\u2014"}</a>
                        )}
                      </td>
                      <td style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onDoubleClick={e => startEdit("email", a.email, e)}>
                        {isEditing("email") ? (
                          <input style={{ ...S.input, fontSize: 12, padding: "3px 6px", width: "100%" }} value={editCellValue} onChange={e => setEditCellValue(e.target.value)}
                            onBlur={saveEdit} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} autoFocus onClick={e => e.stopPropagation()} />
                        ) : (
                          a.email ? <a href={`mailto:${a.email}`} onClick={e => e.stopPropagation()} style={{ color: COLORS.accentLight, textDecoration: "none" }}>{a.email}</a> : "\u2014"
                        )}
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: `${PIPELINE_STATUS_COLORS[pStatus]}20`,
                          color: PIPELINE_STATUS_COLORS[pStatus],
                        }}>
                          {PIPELINE_STATUS_LABELS[pStatus]}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onDoubleClick={e => startEdit("carrier", a.carrier, e)}>
                        {isEditing("carrier") ? (
                          <input style={{ ...S.input, fontSize: 12, padding: "3px 6px", width: "100%" }} value={editCellValue} onChange={e => setEditCellValue(e.target.value)}
                            onBlur={saveEdit} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} autoFocus onClick={e => e.stopPropagation()} />
                        ) : (a.carrier || "\u2014")}
                      </td>
                      <td style={cellStyle}>{a.policyType || "\u2014"}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: xDateColor(a.xDate) }}>
                        {a.xDate ? fmtShort(a.xDate) : "\u2014"}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>{a.autoItemCount || 0}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: COLORS.textDim }}>No clients match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Sticky Footer — Allstate Quota Tracker */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "10px 16px",
            background: COLORS.card,
            borderTop: `1px solid ${COLORS.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            zIndex: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
                Auto Items This Month: <span style={{ color: autoItemsThisMonth >= 13 ? COLORS.success : COLORS.warning }}>{autoItemsThisMonth}</span> / 13
              </span>
              <span style={{ fontSize: 11, color: COLORS.textDim }}>(Allstate Quota Tracker)</span>
            </div>
            <div style={{ width: 200, height: 8, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min((autoItemsThisMonth / 13) * 100, 100)}%`, height: "100%", background: autoItemsThisMonth >= 13 ? COLORS.success : COLORS.accent, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
          </div>
        </>
      ) : (
        <>
          <ClientDetailView account={selected} data={data} setData={setData} config={config} onBack={() => setSelected(null)} onLogService={onLogService}
            onNavigateAccount={(id) => { const a = data.accounts.find(x => x.id === id); if (a) setSelected(a); }}
            onMerge={() => { setShowMerge(true); setMergeSearch(""); setMergeTarget(null); }}
            onDelete={() => {
              const accountId = selected.id;
              const accountName = selected.name;
              let updated = { ...data };
              updated.accounts = updated.accounts.filter(a => a.id !== accountId);
              updated.policies = updated.policies.filter(p => p.accountId !== accountId);
              updated.serviceItems = (updated.serviceItems || []).filter(s => s.accountId !== accountId);
              updated.tasks = (updated.tasks || []).filter(t => !(t.linkedId === accountId && t.linkedType === "account"));
              updated.notes = (updated.notes || []).filter(n => n.accountId !== accountId);
              updated.activities = (updated.activities || []).filter(a => a.accountId !== accountId);
              updated.certificates = (updated.certificates || []).filter(c => c.accountId !== accountId);
              setData(updated, { undo: true, message: `Deleted "${accountName}"` });
              setSelected(null);
            }}
          />

          {/* Legacy modals still used by Clients page */}
          {false && /* OLD DETAIL VIEW REPLACED BY ClientDetailView */ (
          <>
          <button style={{ ...S.btn("ghost"), marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to Clients</button>

          {/* Account Header Card */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div style={{ flex: 1 }}>
                <input style={{ fontSize: 20, fontWeight: 700, background: "transparent", border: "none", color: COLORS.text, outline: "none", padding: 0, width: "100%", borderBottom: `1px solid transparent` }} value={selected.name} onChange={e => updateAccount("name", e.target.value)} onFocus={e => e.target.style.borderBottom = `1px solid ${COLORS.accent}`} onBlur={e => e.target.style.borderBottom = "1px solid transparent"} />
                <div style={{ color: COLORS.textDim, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <select style={{ background: "transparent", border: "none", color: COLORS.textDim, fontSize: 13, cursor: "pointer", padding: 0, outline: "none" }} value={selected.type} onChange={e => updateAccount("type", e.target.value)}>
                    {["Personal","Commercial"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span>Account · Since {fmt(selected.created)}</span>
                </div>
              </div>
              <span style={S.badge(selected.type === "Commercial" ? COLORS.warning : COLORS.info)}>{selected.type}</span>
              <button style={{ ...S.btn("ghost"), fontSize: 11, marginLeft: 8 }} onClick={() => { setShowMerge(true); setMergeSearch(""); setMergeTarget(null); }}>🔗 Merge Account</button>
            </div>

            {/* Contacts + Address side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              {/* Left: Contacts */}
              <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px" }}>CONTACTS ({(selected.contacts || []).length})</div>
                  <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "2px 8px" }} onClick={() => {
                    const contacts = [...(selected.contacts || []), { id: uid(), name: "", relationship: "Spouse", phone: "", email: "" }];
                    updateAccount("contacts", contacts);
                  }}>+ Add</button>
                </div>
                {(selected.contacts || []).map((c, ci) => {
                  const isPrimary = ci === 0;
                  const updateContact = (field, value) => {
                    const contacts = (selected.contacts || []).map((ct, i) => i === ci ? { ...ct, [field]: value } : ct);
                    // Sync primary contact phone/email to account level
                    if (isPrimary && (field === "phone" || field === "email")) {
                      const acctUpdated = { ...data, accounts: data.accounts.map(a => a.id === selected.id ? { ...a, contacts, [field]: value } : a) };
                      setData(acctUpdated);
                      setSelected({ ...selected, contacts, [field]: value });
                    } else {
                      updateAccount("contacts", contacts);
                    }
                  };
                  const removeContact = () => {
                    if (isPrimary) return;
                    const contacts = (selected.contacts || []).filter((_, i) => i !== ci);
                    updateAccount("contacts", contacts);
                  };
                  return (
                    <div key={c.id || ci} style={{ marginBottom: ci < (selected.contacts || []).length - 1 ? 8 : 0, paddingBottom: ci < (selected.contacts || []).length - 1 ? 8 : 0, borderBottom: ci < (selected.contacts || []).length - 1 ? `1px solid ${COLORS.border}20` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, background: `${COLORS.accent}20`, color: COLORS.accentLight, padding: "1px 6px", borderRadius: 3 }}>PRIMARY</span>}
                        {!isPrimary && (
                          <select style={{ background: "transparent", border: "none", fontSize: 10, color: COLORS.textDim, padding: 0, cursor: "pointer", fontWeight: 600 }} value={c.relationship || "Other"} onChange={e => updateContact("relationship", e.target.value)}>
                            {CONTACT_RELATIONSHIPS.filter(r => r !== "Primary").map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        )}
                        {!isPrimary && <button style={{ marginLeft: "auto", background: "none", border: "none", color: COLORS.textMuted, fontSize: 11, cursor: "pointer", padding: 0 }} onClick={removeContact} title="Remove contact">✕</button>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Name</div>
                          <input style={{ ...S.input, padding: "3px 6px", fontSize: 12 }} value={c.name || ""} onChange={e => updateContact("name", e.target.value)} placeholder="Full name" />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Phone</div>
                          <input style={{ ...S.input, padding: "3px 6px", fontSize: 12 }} value={c.phone || ""} onChange={e => updateContact("phone", e.target.value)} placeholder="Phone" />
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Email</div>
                          <input style={{ ...S.input, padding: "3px 6px", fontSize: 12 }} value={c.email || ""} onChange={e => updateContact("email", e.target.value)} placeholder="Email" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: Address */}
              <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", marginBottom: 8 }}>ADDRESS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Street Address</div>
                    <input style={{ ...S.input, padding: "4px 8px", fontSize: 13 }} value={selected.address || ""} onChange={e => updateAccount("address", e.target.value)} placeholder="Street address" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>City</div>
                      <input style={{ ...S.input, padding: "4px 8px", fontSize: 13 }} value={selected.city || ""} onChange={e => updateAccount("city", e.target.value)} placeholder="City" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>State</div>
                      <input style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 45, textAlign: "center" }} value={selected.state || ""} onChange={e => updateAccount("state", e.target.value)} maxLength={2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Zip</div>
                      <input style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 65 }} value={selected.zip || ""} onChange={e => updateAccount("zip", e.target.value)} maxLength={5} />
                    </div>
                  </div>
                </div>
                {selected.type === "Commercial" && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 1 }}>Contact Name (Owner/POC)</div>
                    <input style={{ ...S.input, padding: "4px 8px", fontSize: 13 }} value={selected.contactName || ""} onChange={e => updateAccount("contactName", e.target.value)} placeholder="Business owner or point of contact" />
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16, marginTop: 16 }}>
              <div style={{ textAlign: "center", padding: "8px 0", background: `${COLORS.accent}10`, borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedPolicies.filter(p => p.status === "Active").length}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>Active Policies</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px 0", background: `${COLORS.accent}10`, borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>${selectedPolicies.filter(p => p.status === "Active").reduce((s, p) => s + (p.premium || 0), 0).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>Total Premium</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px 0", background: `${selectedServices.filter(s => s.status !== "Done").length > 0 ? COLORS.warning : COLORS.success}10`, borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedServices.filter(s => s.status !== "Done").length}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>Open Service Items</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px 0", background: `${selectedTasks.filter(t => t.status !== "Completed" && t.dueDate < todayStr).length > 0 ? COLORS.danger : COLORS.success}10`, borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedTasks.filter(t => t.status !== "Completed").length}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>Open Tasks</div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: "flex", gap: 0, marginTop: 16, borderBottom: `1px solid ${COLORS.border}` }}>
            {DETAIL_TABS.map(tab => (
              <div key={tab.id}
                style={{ padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: detailTab === tab.id ? 600 : 400, color: detailTab === tab.id ? COLORS.accentLight : COLORS.textDim, borderBottom: detailTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => setDetailTab(tab.id)}
              >
                {tab.label}
                {tab.count !== undefined && <span style={{ fontSize: 11, background: `${COLORS.accent}20`, color: COLORS.accentLight, padding: "1px 6px", borderRadius: 10 }}>{tab.count}</span>}
              </div>
            ))}
          </div>

          {/* TAB: Overview — Client 360 */}
          {detailTab === "overview" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 16 }}>
                {/* Left column */}
                <div>
                  {/* Policies */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>
                      <span>Policies ({selectedPolicies.length})</span>
                      <button style={{ ...S.btn(), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowAddPolicy(!showAddPolicy)}>
                        {showAddPolicy ? "Cancel" : "+ Add Policy"}
                      </button>
                    </div>
                    {showAddPolicy && (() => {
                      const pf = policyForm;
                      const inputStyle = { ...S.input, fontSize: 12, padding: "6px 8px" };
                      const handleEffDateChange = (effDate) => {
                        const exp = calcExpiration(effDate, pf.lob);
                        setPolicyForm({ ...pf, effectiveDate: effDate, expirationDate: exp });
                      };
                      const handleLobChange = (lob) => {
                        const exp = pf.effectiveDate ? calcExpiration(pf.effectiveDate, lob) : pf.expirationDate;
                        setPolicyForm({ ...pf, lob, expirationDate: exp });
                      };
                      const handleAddPolicy = () => {
                        const valErrors = validatePolicyFields({ premium: pf.premium, effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate), agencyFee: pf.agencyFee, commissionPct: pf.commissionPct });
                        if (valErrors.length > 0) { alert("Please fix:\n• " + valErrors.join("\n• ")); return; }
                        const newPolId = uid();
                        const newPol = {
                          id: newPolId, accountId: selected.id, accountName: selected.name, namedInsured: pf.namedInsured || "",
                          carrier: pf.carrier, lob: pf.lob, policyNumber: pf.policyNumber,
                          effectiveDate: normalizeDate(pf.effectiveDate), expirationDate: normalizeDate(pf.expirationDate),
                          premium: Number(pf.premium) || 0, status: "Active", paymentPlan: pf.paymentPlan,
                          vehicleCount: isAutoTermLob(pf.lob) ? 1 : 0, documents: {}, notes: "",
                          broker: pf.broker || "", agencyFee: Number(pf.agencyFee) || 0, commissionPct: Number(pf.commissionPct) ?? 10
                        };
                        // Auto-create renewal service item if expiring within renewal window
                        const _expDate = normalizeDate(pf.expirationDate);
                        const _daysToExp = _expDate ? daysBetween(todayStr, _expDate) : -1;
                        const _renWindow = renewalWindow(pf.lob);
                        let updated;
                        if (_daysToExp >= 0 && _daysToExp <= _renWindow) {
                          const _renType = isCommercialLob(pf.lob) ? "Commercial Renewal" : (pf.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                          const newSI = {
                            id: uid(), type: _renType, accountId: selected.id, accountName: selected.name,
                            policyId: newPolId, policyNumber: pf.policyNumber, carrier: pf.carrier, lob: pf.lob,
                            description: `${pf.carrier} ${pf.lob} Renewal`, dueDate: _expDate || todayStr,
                            amountDue: Number(pf.premium) || 0, status: "Uncontacted", urgency: _daysToExp <= 14 ? "High" : "Medium",
                            assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
                            followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                          };
                          updated = { ...data, policies: [...data.policies, newPol], serviceItems: [...data.serviceItems, newSI] };
                        } else {
                          updated = { ...data, policies: [...data.policies, newPol] };
                        }
                        updated = addActivity(updated, selected.id, "status_change", `Policy added: ${pf.carrier} — ${pf.lob}`, pf.policyNumber || "");
                        setData(updated);
                        setShowAddPolicy(false);
                        setPolicyForm({ carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", paymentPlan: "Monthly", broker: "", agencyFee: "", commissionPct: 10 });
                      };
                      return (
                        <div style={{ padding: 12, marginBottom: 12, background: `${COLORS.accent}08`, borderRadius: 8, border: `1px solid ${COLORS.accent}20` }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Carrier *</div><select style={inputStyle} value={pf.carrier} onChange={e => setPolicyForm({ ...pf, carrier: e.target.value })}><option value="">Select carrier...</option>{Object.keys(config.carrierGroups || {}).sort().map(c => <option key={c} value={c}>{c}</option>)}{pf.carrier && !Object.keys(config.carrierGroups || {}).includes(pf.carrier) && <option value={pf.carrier}>{pf.carrier}</option>}</select></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>LOB</div><select style={inputStyle} value={pf.lob} onChange={e => handleLobChange(e.target.value)}>{(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Policy #</div><input style={inputStyle} placeholder="Policy number" value={pf.policyNumber} onChange={e => setPolicyForm({ ...pf, policyNumber: e.target.value })} /></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Premium</div><input style={inputStyle} type="number" min="0" placeholder="0" value={pf.premium} onChange={e => setPolicyForm({ ...pf, premium: e.target.value })} /></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Named Insured</div><input style={inputStyle} placeholder="If different from account" value={pf.namedInsured || ""} onChange={e => setPolicyForm({ ...pf, namedInsured: e.target.value })} /></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Effective Date</div><input style={inputStyle} type="date" value={pf.effectiveDate} onChange={e => handleEffDateChange(e.target.value)} /></div>
                            <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Expiration Date</div><input style={inputStyle} type="date" value={pf.expirationDate} onChange={e => setPolicyForm({ ...pf, expirationDate: e.target.value })} /></div>
                            {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Agency Fee</div><input style={inputStyle} type="number" min="0" placeholder="0" value={pf.agencyFee} onChange={e => setPolicyForm({ ...pf, agencyFee: e.target.value })} /></div>}
                            {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Broker</div><select style={inputStyle} value={pf.broker} onChange={e => setPolicyForm({ ...pf, broker: e.target.value })}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}</select></div>}
                            {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Commission %</div><input style={{ ...inputStyle, width: 70 }} type="number" min="0" max="100" step="0.5" value={pf.commissionPct} onChange={e => setPolicyForm({ ...pf, commissionPct: e.target.value })} /></div>}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btn(), background: COLORS.success, fontSize: 11, opacity: pf.carrier ? 1 : 0.5 }} onClick={handleAddPolicy} disabled={!pf.carrier}>Add Policy</button>
                            <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={() => setShowAddPolicy(false)}>Cancel</button>
                          </div>
                        </div>
                      );
                    })()}
                    {selectedPolicies.length > 0 ? (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ ...S.table, tableLayout: "fixed", minWidth: 650 }}>
                          <colgroup>
                            <col style={{ width: 24 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 80 }} />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 80 }} />
                            <col style={{ width: 72 }} />
                            <col style={{ width: 28 }} />
                          </colgroup>
                          <thead><tr>
                            <th style={S.th}></th>
                            <th style={{ ...S.th, fontSize: 10 }}>Carrier</th>
                            <th style={{ ...S.th, fontSize: 10 }}>Policy #</th>
                            <th style={{ ...S.th, fontSize: 10 }}>LOB</th>
                            <th style={{ ...S.th, fontSize: 10 }}>Eff Date</th>
                            <th style={{ ...S.th, fontSize: 10 }}>Exp Date</th>
                            <th style={{ ...S.th, fontSize: 10 }}>Premium</th>
                            <th style={{ ...S.th, fontSize: 10 }}>Status</th>
                            <th style={S.th}></th>
                          </tr></thead>
                          <tbody>
                            {[...selectedPolicies].sort((a, b) => (b.effectiveDate || "").localeCompare(a.effectiveDate || "")).map(p => {
                              const days = p.expirationDate ? daysBetween(todayStr, p.expirationDate) : null;
                              const isDeleting = confirmDeletePolicy === p.id;
                              const expWarning = days !== null && days <= 60 && days >= 0;
                              const isOverdue = days !== null && days < 0;
                              return (
                                <React.Fragment key={p.id}>
                                  <tr style={{ cursor: "pointer" }}
                                    onClick={() => setDetailTab("policies")}
                                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                                    <td style={{ ...S.td, textAlign: "center", fontSize: 10, color: COLORS.textMuted }}>▸</td>
                                    <td style={{ ...S.td, fontWeight: 600, fontSize: 11 }}>{p.carrier || "—"}</td>
                                    <td style={{ ...S.td, fontSize: 11, fontFamily: "monospace" }}>{p.policyNumber || "—"}</td>
                                    <td style={{ ...S.td, fontSize: 11 }}>{p.lob || "—"}</td>
                                    <td style={{ ...S.td, fontSize: 11, color: COLORS.textDim }}>{p.effectiveDate ? fmt(p.effectiveDate) : "—"}</td>
                                    <td style={{ ...S.td, fontSize: 11, color: expWarning ? COLORS.warning : isOverdue ? COLORS.danger : COLORS.textDim, fontWeight: expWarning || isOverdue ? 600 : 400 }}>
                                      {p.expirationDate ? fmt(p.expirationDate) : "—"}
                                      {expWarning && <span style={{ fontSize: 9, marginLeft: 2 }}>({days}d)</span>}
                                    </td>
                                    <td style={{ ...S.td, fontSize: 11, fontWeight: 600 }}>${(p.premium || 0).toLocaleString()}</td>
                                    <td style={S.td}><span style={{ ...S.badge(statusColor(p.status)), fontSize: 9 }}>{p.status}</span></td>
                                    <td style={{ ...S.td, textAlign: "center", display: "flex", gap: 6, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                                      <span style={{ color: COLORS.accent, cursor: "pointer", fontSize: 11 }}
                                        title="Renew policy"
                                        onClick={() => {
                                          const advanceYear = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); dt.setFullYear(dt.getFullYear() + 1); return dt.toISOString().split("T")[0]; };
                                          const newPol = { ...p, id: uid(), effectiveDate: advanceYear(p.effectiveDate), expirationDate: advanceYear(p.expirationDate), premium: 0, status: "Active", notes: `Renewed from policy ${p.policyNumber || p.id}` };
                                          const acct = data.accounts.find(a => a.id === selected.id);
                                          const _renExpDate = newPol.expirationDate;
                                          const _renDays = _renExpDate ? daysBetween(todayStr, _renExpDate) : -1;
                                          let updated;
                                          if (_renDays >= 0 && _renDays <= renewalWindow(newPol.lob)) {
                                            const _siType = isCommercialLob(newPol.lob) ? "Commercial Renewal" : (newPol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                                            const newSI = {
                                              id: uid(), type: _siType, accountId: selected.id, accountName: acct ? acct.name : p.accountName || "",
                                              policyId: newPol.id, policyNumber: newPol.policyNumber, carrier: newPol.carrier, lob: newPol.lob,
                                              description: `${newPol.carrier} ${newPol.lob || ""} Renewal`.trim(), dueDate: _renExpDate || todayStr,
                                              amountDue: 0, status: "Uncontacted", urgency: _renDays <= 14 ? "High" : "Medium",
                                              assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
                                              followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                                            };
                                            updated = { ...data, policies: [...data.policies, newPol], serviceItems: [...data.serviceItems, newSI] };
                                          } else {
                                            updated = { ...data, policies: [...data.policies, newPol] };
                                          }
                                          // Mark old policy as expired if it has an expiration date in the past
                                          if (p.expirationDate && p.expirationDate <= todayStr && p.status === "Active") {
                                            updated = { ...updated, policies: updated.policies.map(pol => pol.id === p.id ? { ...pol, status: "Expired" } : pol) };
                                          }
                                          updated = addActivity(updated, selected.id, "status_change", `Policy renewed: ${p.carrier} — ${p.lob}`, p.policyNumber || "");
                                          setData(updated, { undo: true, message: `Renewed policy: ${p.carrier} — ${p.lob}` });
                                          setDetailTab("policies");
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = COLORS.success}
                                        onMouseLeave={e => e.currentTarget.style.color = COLORS.accent}
                                      >🔄</span>
                                      <span style={{ color: isDeleting ? COLORS.danger : COLORS.textMuted, cursor: "pointer", fontSize: 12 }}
                                        title="Delete policy"
                                        onClick={() => setConfirmDeletePolicy(isDeleting ? null : p.id)}
                                        onMouseEnter={e => e.currentTarget.style.color = COLORS.danger}
                                        onMouseLeave={e => e.currentTarget.style.color = isDeleting ? COLORS.danger : COLORS.textMuted}
                                      >✕</span>
                                    </td>
                                  </tr>
                                  {isDeleting && (
                                    <tr><td colSpan={10} style={{ padding: "8px 12px", background: `${COLORS.danger}08`, borderBottom: `1px solid ${COLORS.border}` }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 12, color: COLORS.danger, flex: 1 }}>Delete {p.carrier} — {p.lob}? Linked service items will also be removed.</span>
                                        <button style={{ ...S.btn(), background: COLORS.danger, color: "#fff", fontSize: 11, padding: "4px 12px" }} onClick={() => {
                                          let updated = { ...data,
                                            policies: data.policies.filter(pol => pol.id !== p.id),
                                            serviceItems: data.serviceItems.filter(s => s.policyId !== p.id),
                                          };
                                          updated = addActivity(updated, selected.id, "status_change", `Policy deleted: ${p.carrier} — ${p.lob}`, p.policyNumber || "");
                                          setData(updated, { undo: true, message: `Deleted policy: ${p.carrier} — ${p.lob}` });
                                          setConfirmDeletePolicy(null);
                                        }}>Delete</button>
                                        <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 12px" }} onClick={() => setConfirmDeletePolicy(null)}>Cancel</button>
                                      </div>
                                    </td></tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ ...S.emptyState, padding: 16 }}>No policies</div>
                    )}
                  </div>

                  {/* Cross-Sell Gaps */}
                  {crossSellGaps.length > 0 && (
                    <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.success}20` }}>
                      <div style={S.sectionTitle}>
                        <span>💰 Cross-Sell Opportunities</span>
                        <span style={{ fontSize: 12, color: COLORS.success }}>~${crossSellGaps.reduce((s, g) => s + g.est, 0).toLocaleString()}</span>
                      </div>
                      {crossSellGaps.map((g, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={S.badge(COLORS.success)}>{g.gap}</span>
                            <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 8 }}>{g.reason}</span>
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.success, fontWeight: 600 }}>~${g.est.toLocaleString()}/yr</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upcoming Renewals */}
                  {upcomingRenewals.length > 0 && (
                    <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.warning}20` }}>
                      <div style={S.sectionTitle}><span>⏰ Upcoming Renewals</span></div>
                      {upcomingRenewals.map(p => {
                        const days = daysBetween(todayStr, p.expirationDate);
                        return (
                          <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13 }}>{p.carrier} — {p.lob}</span>
                            <span style={{ fontSize: 12, color: days <= 14 ? COLORS.danger : COLORS.warning, fontWeight: 600 }}>{days}d · {fmtShort(p.expirationDate)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right column */}
                <div>
                  {/* Open Service Items */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>
                      <span>Open Service Items ({selectedServices.filter(s => s.status !== "Done").length})</span>
                    </div>
                    {selectedServices.filter(s => s.status !== "Done").slice(0, 5).map(si => {
                      const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                      return (
                        <div key={si.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                            <div>
                              <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: `${txnColor}25`, color: txnColor }}>{si.type}</span>
                              <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 6 }}>{si.description}</span>
                            </div>
                            <span style={{ ...statusBadgeStyle(si.status), padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{si.status}</span>
                          </div>
                          {si.nextStep && <div style={{ fontSize: 11, color: COLORS.text, marginTop: 4 }}>→ {si.nextStep}</div>}
                        </div>
                      );
                    })}
                    {selectedServices.filter(s => s.status !== "Done").length === 0 && <div style={{ ...S.emptyState, padding: 12, fontSize: 12 }}>No open items</div>}
                  </div>

                  {/* Contact History */}
                  <div style={{ ...S.card, marginTop: 16 }}>
                    <div style={S.sectionTitle}>
                      <span>📞 Contact History ({contactHistory.length})</span>
                    </div>
                    {contactHistory.length > 0 ? contactHistory.slice(0, 8).map((c, i) => (
                      <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", gap: 10, alignItems: "start" }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 65, flexShrink: 0 }}>{fmtShort(c.date)}</span>
                        <div>
                          <div style={{ fontSize: 12 }}>
                            <span style={S.badge(COLORS.info)}>{c.method}</span>
                            <span style={{ color: COLORS.textDim, marginLeft: 6, fontSize: 11 }}>{c.serviceType}</span>
                          </div>
                          {c.notes && <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{c.notes}</div>}
                        </div>
                      </div>
                    )) : <div style={{ ...S.emptyState, padding: 12, fontSize: 12 }}>No contact history</div>}
                    {contactHistory.length > 8 && <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: "center", padding: 4 }}>+{contactHistory.length - 8} more</div>}
                  </div>

                  {/* Recent Activity Preview */}
                  <div style={{ ...S.card, marginTop: 16 }}>
                    <div style={S.sectionTitle}>
                      <span>Recent Activity</span>
                      <span style={{ fontSize: 12, color: COLORS.accentLight, cursor: "pointer" }} onClick={() => setDetailTab("activity")}>View all →</span>
                    </div>
                    {selectedActivities.slice(0, 5).map(a => (
                      <div key={a.id} style={{ padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", gap: 10, alignItems: "start" }}>
                        <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0, marginTop: 2 }}>{activityIcon(a.type)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}><span style={{ fontWeight: 600, color: activityColor(a.type) }}>{a.description}</span></div>
                          {a.detail && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 1 }}>{a.detail}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: "nowrap" }}>{fmtTime(a.createdAt)}</span>
                      </div>
                    ))}
                    {selectedActivities.length === 0 && <div style={{ ...S.emptyState, padding: 16 }}>No activity yet</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Policies — table summary with expandable detail */}
          {detailTab === "policies" && (
            <div style={{ marginTop: 16 }}>
              {selectedPolicies.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ ...S.table, tableLayout: "fixed", minWidth: 700 }}>
                    <colgroup>
                      <col style={{ width: 28 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 32 }} />
                    </colgroup>
                    <thead><tr>
                      <th style={S.th}></th>
                      <th style={S.th}>Carrier</th>
                      <th style={S.th}>Policy #</th>
                      <th style={S.th}>LOB</th>
                      <th style={S.th}>Eff Date</th>
                      <th style={S.th}>Exp Date</th>
                      <th style={S.th}>Premium</th>
                      <th style={S.th}>Status</th>
                      <th style={S.th}></th>
                    </tr></thead>
                    <tbody>
                      {selectedPolicies.map(pol => {
                        const isExpanded = expandedPolicyId === pol.id;
                        const isAuto = pol.lob === "Auto" || pol.lob === "Commercial Auto";
                        const isHome = pol.lob === "Home" || pol.lob === "Homeowners" || pol.lob === "Dwelling Fire" || pol.lob === "Condo" || pol.lob === "Renters" || pol.lob === "DP-3" || pol.lob === "DP-1";
                        const days = pol.expirationDate ? daysBetween(todayStr, pol.expirationDate) : null;
                        const upPol = (field, value) => {
                          // Intercept Cancelled status — open cancellation modal
                          if (field === "status" && value === "Cancelled") { setCancellingPolicyId(pol.id); return; }
                          // Inline validation for numeric fields
                          if (["premium","agencyFee"].includes(field) && value !== "" && Number(value) < 0) return;
                          if (field === "commissionPct" && value !== "" && (Number(value) < 0 || Number(value) > 100)) return;
                          if (field === "vehicleCount" && value !== "" && Number(value) < 0) return;
                          const updatedPolicies = data.policies.map(p => p.id === pol.id ? { ...p, [field]: ["premium","vehicleCount","agencyFee","commissionPct"].includes(field) ? (Number(value) || 0) : value } : p);
                          let up = { ...data, policies: updatedPolicies };
                          if (field === "expirationDate" && value) {
                            const _dExp = daysBetween(todayStr, value);
                            const _pol = updatedPolicies.find(p => p.id === pol.id);
                            const _renTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal"];
                            const _hasRen = data.serviceItems.some(si => si.policyId === pol.id && _renTypes.some(rt => si.type.includes("Renewal")));
                            if (_pol && _pol.status === "Active" && _dExp >= 0 && _dExp <= renewalWindow(_pol.lob) && !_hasRen) {
                              const _type = isCommercialLob(_pol.lob) ? "Commercial Renewal" : (_pol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                              const _newSI = {
                                id: uid(), type: _type, accountId: selected.id, accountName: selected.name, policyId: pol.id,
                                policyNumber: _pol.policyNumber, carrier: _pol.carrier, lob: _pol.lob,
                                description: (_pol.carrier || "") + " " + (_pol.lob || "") + " Renewal",
                                dueDate: value, amountDue: _pol.premium || 0, status: "Uncontacted",
                                urgency: _dExp <= 14 ? "High" : "Medium", assignedTo: config.agentName || "Agent",
                                created: todayStr, lastAction: "", lastActionDate: "", followUpDate: todayStr,
                                notes: "", ballInCourt: false, flags: [], contactAttempts: []
                              };
                              up = { ...up, serviceItems: [...up.serviceItems, _newSI] };
                            }
                          }
                          setData(up);
                        };
                        const inputStyle = { ...S.input, padding: "4px 8px", fontSize: 12, fontWeight: 500 };
                        const _cgGroups = config.carrierGroups || {};
                        const _cgList = Object.keys(_cgGroups).sort();
                        const expWarning = days !== null && days <= 60 && days >= 0;
                        const isOverdue = days !== null && days < 0;

                        return (
                          <React.Fragment key={pol.id}>
                            <tr style={{ cursor: "pointer", background: isExpanded ? `${COLORS.accent}08` : "" }}
                              onClick={() => setExpandedPolicyId(isExpanded ? null : pol.id)}
                              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = COLORS.cardHover; }}
                              onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? `${COLORS.accent}08` : ""; }}>
                              <td style={{ ...S.td, textAlign: "center", fontSize: 11, color: COLORS.textMuted }}>{isExpanded ? "▾" : "▸"}</td>
                              <td style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>{pol.carrier || "—"}</td>
                              <td style={{ ...S.td, fontSize: 12, fontFamily: "monospace" }}>{pol.policyNumber || "—"}</td>
                              <td style={{ ...S.td, fontSize: 12 }}>{pol.lob || "—"}</td>
                              <td style={{ ...S.td, fontSize: 12, color: COLORS.textDim }}>{pol.effectiveDate ? fmt(pol.effectiveDate) : "—"}</td>
                              <td style={{ ...S.td, fontSize: 12, color: expWarning ? COLORS.warning : isOverdue ? COLORS.danger : COLORS.textDim, fontWeight: expWarning || isOverdue ? 600 : 400 }}>
                                {pol.expirationDate ? fmt(pol.expirationDate) : "—"}
                                {expWarning && <span style={{ fontSize: 10, marginLeft: 4 }}>({days}d)</span>}
                              </td>
                              <td style={{ ...S.td, fontSize: 12, fontWeight: 600 }}>${(pol.premium || 0).toLocaleString()}</td>
                              <td style={S.td}><span style={{ ...S.badge(statusColor(pol.status)), fontSize: 10 }}>{pol.status}</span></td>
                              <td style={{ ...S.td, textAlign: "center", display: "flex", gap: 6, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                                <span style={{ color: COLORS.accent, cursor: "pointer", fontSize: 12 }}
                                  title="Renew policy"
                                  onClick={() => {
                                    const advanceYear = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); dt.setFullYear(dt.getFullYear() + 1); return dt.toISOString().split("T")[0]; };
                                    const newPol = { ...pol, id: uid(), effectiveDate: advanceYear(pol.effectiveDate), expirationDate: advanceYear(pol.expirationDate), premium: 0, status: "Active", notes: `Renewed from policy ${pol.policyNumber || pol.id}` };
                                    const acct = data.accounts.find(a => a.id === selected.id);
                                    const _ren2ExpDate = newPol.expirationDate;
                                    const _ren2Days = _ren2ExpDate ? daysBetween(todayStr, _ren2ExpDate) : -1;
                                    let updated;
                                    if (_ren2Days >= 0 && _ren2Days <= renewalWindow(newPol.lob)) {
                                      const _siType2 = isCommercialLob(newPol.lob) ? "Commercial Renewal" : (newPol.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
                                      const newSI = {
                                        id: uid(), type: _siType2, accountId: selected.id, accountName: acct ? acct.name : pol.accountName || "",
                                        policyId: newPol.id, policyNumber: newPol.policyNumber, carrier: newPol.carrier, lob: newPol.lob,
                                        description: `${newPol.carrier} ${newPol.lob || ""} Renewal`.trim(), dueDate: _ren2ExpDate || todayStr,
                                        amountDue: 0, status: "Uncontacted", urgency: _ren2Days <= 14 ? "High" : "Medium",
                                        assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
                                        followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                                      };
                                      updated = { ...data, policies: [...data.policies, newPol], serviceItems: [...data.serviceItems, newSI] };
                                    } else {
                                      updated = { ...data, policies: [...data.policies, newPol] };
                                    }
                                    if (pol.expirationDate && pol.expirationDate <= todayStr && pol.status === "Active") {
                                      updated = { ...updated, policies: updated.policies.map(p => p.id === pol.id ? { ...p, status: "Expired" } : p) };
                                    }
                                    updated = addActivity(updated, selected.id, "status_change", `Policy renewed: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
                                    setData(updated, { undo: true, message: `Renewed policy: ${pol.carrier} — ${pol.lob}` });
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.color = COLORS.success}
                                  onMouseLeave={e => e.currentTarget.style.color = COLORS.accent}
                                >🔄</span>
                                <span style={{ color: confirmDeletePolicy === pol.id ? COLORS.danger : COLORS.textMuted, cursor: "pointer", fontSize: 13 }}
                                  title="Delete this policy"
                                  onClick={() => setConfirmDeletePolicy(confirmDeletePolicy === pol.id ? null : pol.id)}
                                  onMouseEnter={e => e.currentTarget.style.color = COLORS.danger}
                                  onMouseLeave={e => e.currentTarget.style.color = confirmDeletePolicy === pol.id ? COLORS.danger : COLORS.textMuted}
                                >🗑</span>
                              </td>
                            </tr>
                            {confirmDeletePolicy === pol.id && (
                              <tr><td colSpan={10} style={{ padding: "8px 12px", background: `${COLORS.danger}08`, borderBottom: `1px solid ${COLORS.border}` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 12, color: COLORS.danger, flex: 1 }}>Delete {pol.carrier} — {pol.lob} (#{pol.policyNumber || "N/A"})? Linked service items will also be removed.</span>
                                  <button style={{ ...S.btn(), background: COLORS.danger, color: "#fff", fontSize: 11, padding: "4px 12px" }} onClick={() => {
                                    let updated = { ...data,
                                      policies: data.policies.filter(p => p.id !== pol.id),
                                      serviceItems: data.serviceItems.filter(s => s.policyId !== pol.id),
                                    };
                                    updated = addActivity(updated, selected.id, "status_change", `Policy deleted: ${pol.carrier} — ${pol.lob}`, pol.policyNumber || "");
                                    setData(updated, { undo: true, message: `Deleted policy: ${pol.carrier} — ${pol.lob}` });
                                    setConfirmDeletePolicy(null);
                                  }}>Delete</button>
                                  <button style={{ ...S.btn("ghost"), fontSize: 11, padding: "4px 12px" }} onClick={() => setConfirmDeletePolicy(null)}>Cancel</button>
                                </div>
                              </td></tr>
                            )}
                            {isExpanded && (
                              <tr><td colSpan={10} style={{ padding: 0, background: `${COLORS.accent}04`, borderBottom: `2px solid ${COLORS.accent}20` }}>
                                <div style={{ padding: "16px 20px" }}>
                                  {/* Detail section tabs */}
                                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                                    {[
                                      { key: "info", label: "Policy Info" },
                                      { key: "coverage", label: "Coverage" },
                                      { key: "notes", label: "Notes" },
                                    ].map(t => (
                                      <button key={t.key}
                                        style={{ ...S.btn(expandedPolTab === t.key ? undefined : "ghost"), padding: "4px 14px", fontSize: 11, fontWeight: expandedPolTab === t.key ? 600 : 400 }}
                                        onClick={() => setExpandedPolTab(t.key)}>
                                        {t.label}
                                      </button>
                                    ))}
                                  </div>

                                  {expandedPolTab === "info" && (
                                    <div style={S.grid(3)}>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Carrier</div><select style={inputStyle} value={pol.carrier || ""} onChange={e => upPol("carrier", e.target.value)}>{[...(!_cgList.includes(pol.carrier) && pol.carrier ? [pol.carrier] : []), ..._cgList].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>LOB</div><select style={inputStyle} value={pol.lob} onChange={e => upPol("lob", e.target.value)}>{(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Policy #</div><input style={inputStyle} value={pol.policyNumber || ""} onChange={e => upPol("policyNumber", e.target.value)} /></div>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Status</div><select style={inputStyle} value={pol.status} onChange={e => upPol("status", e.target.value)}>{POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                                      {pol.status === "Cancelled" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Cancel Date</div><input style={inputStyle} type="date" value={pol.cancellationDate || ""} onChange={e => upPol("cancellationDate", e.target.value)} /></div>}
                                      {pol.status === "Cancelled" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Cancel Reason</div><select style={inputStyle} value={pol.cancellationReason || ""} onChange={e => upPol("cancellationReason", e.target.value)}><option value="">—</option>{(config.cancellationReasons || []).map(r => <option key={r} value={r}>{r}</option>)}</select></div>}
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Effective</div><input style={inputStyle} type="date" value={pol.effectiveDate || ""} onChange={e => upPol("effectiveDate", e.target.value)} /></div>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Expiration</div><input style={inputStyle} type="date" value={pol.expirationDate || ""} onChange={e => upPol("expirationDate", e.target.value)} /></div>
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Premium</div><input style={inputStyle} type="number" min="0" value={pol.premium || ""} onChange={e => upPol("premium", e.target.value)} /></div>
                                      {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Agency Fee</div><input style={inputStyle} type="number" min="0" value={pol.agencyFee || ""} onChange={e => upPol("agencyFee", e.target.value)} placeholder="0" /></div>}
                                      <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Payment</div><select style={inputStyle} value={pol.paymentPlan || "Monthly"} onChange={e => upPol("paymentPlan", e.target.value)}>{["Annual","Semi-Annual","Quarterly","Monthly","EFT"].map(pp => <option key={pp} value={pp}>{pp}</option>)}</select></div>
                                      {isAuto && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Vehicles</div><input style={{ ...inputStyle, width: 60 }} type="number" min="1" value={pol.vehicleCount || 1} onChange={e => upPol("vehicleCount", e.target.value)} /></div>}
                                      {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Broker</div><select style={inputStyle} value={pol.broker || ""} onChange={e => upPol("broker", e.target.value)}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}{pol.broker && !(config.brokers || []).includes(pol.broker) && <option value={pol.broker}>{pol.broker}</option>}</select></div>}
                                      {selected.type === "Commercial" && <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Commission %</div><input style={{ ...inputStyle, width: 70 }} type="number" min="0" max="100" step="0.5" value={pol.commissionPct != null ? pol.commissionPct : 10} onChange={e => upPol("commissionPct", e.target.value)} /></div>}
                                    </div>
                                  )}

                                  {expandedPolTab === "coverage" && (
                                    <div>
                                      {isAuto && (
                                        <div style={S.grid(3)}>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>BI Limits</div><input style={inputStyle} value={pol.biLimits || ""} onChange={e => upPol("biLimits", e.target.value)} placeholder="100/300" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>PD Limits</div><input style={inputStyle} value={pol.pdLimits || ""} onChange={e => upPol("pdLimits", e.target.value)} placeholder="100K" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>UM/UIM</div><input style={inputStyle} value={pol.umLimits || ""} onChange={e => upPol("umLimits", e.target.value)} placeholder="100/300" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Comp Ded</div><input style={inputStyle} value={pol.compDeductible || ""} onChange={e => upPol("compDeductible", e.target.value)} placeholder="$500" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Coll Ded</div><input style={inputStyle} value={pol.collDeductible || ""} onChange={e => upPol("collDeductible", e.target.value)} placeholder="$500" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>PIP</div><input style={inputStyle} value={pol.pip || ""} onChange={e => upPol("pip", e.target.value)} placeholder="$10K" /></div>
                                        </div>
                                      )}
                                      {isHome && (
                                        <div style={S.grid(3)}>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Dwelling</div><input style={inputStyle} value={pol.dwellingLimit || ""} onChange={e => upPol("dwellingLimit", e.target.value)} placeholder="$300K" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Other Structures</div><input style={inputStyle} value={pol.otherStructures || ""} onChange={e => upPol("otherStructures", e.target.value)} placeholder="10%" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Personal Prop</div><input style={inputStyle} value={pol.personalProperty || ""} onChange={e => upPol("personalProperty", e.target.value)} placeholder="50%" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Liability</div><input style={inputStyle} value={pol.liabilityLimit || ""} onChange={e => upPol("liabilityLimit", e.target.value)} placeholder="$300K" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>AOP Ded</div><input style={inputStyle} value={pol.aopDeductible || ""} onChange={e => upPol("aopDeductible", e.target.value)} placeholder="$2,500" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Hurricane Ded</div><input style={inputStyle} value={pol.hurricaneDeductible || ""} onChange={e => upPol("hurricaneDeductible", e.target.value)} placeholder="2%" /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Flood Zone</div><input style={inputStyle} value={pol.floodZone || ""} onChange={e => upPol("floodZone", e.target.value)} placeholder="X, AE, etc." /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Loss of Use</div><input style={inputStyle} value={pol.lossOfUse || ""} onChange={e => upPol("lossOfUse", e.target.value)} placeholder="20%" /></div>
                                        </div>
                                      )}
                                      {!isAuto && !isHome && (
                                        <div style={S.grid(3)}>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Coverage Limit</div><input style={inputStyle} value={pol.coverageLimit || ""} onChange={e => upPol("coverageLimit", e.target.value)} /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Deductible</div><input style={inputStyle} value={pol.deductible || ""} onChange={e => upPol("deductible", e.target.value)} /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Liability</div><input style={inputStyle} value={pol.liabilityLimit || ""} onChange={e => upPol("liabilityLimit", e.target.value)} /></div>
                                          <div><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Additional Info</div><input style={inputStyle} value={pol.additionalInfo || ""} onChange={e => upPol("additionalInfo", e.target.value)} /></div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {expandedPolTab === "notes" && (
                                    <div>
                                      <textarea style={{ ...S.input, minHeight: 80, resize: "vertical", fontSize: 12, width: "100%" }} value={pol.notes || ""} placeholder="Coverage notes, underwriting details..." onChange={e => upPol("notes", e.target.value)} />
                                    </div>
                                  )}
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ ...S.emptyState, marginTop: 16, padding: 20 }}>No policies yet. Add one from the Policies page.</div>
              )}
            </div>
          )}

          {/* TAB: Activity Timeline */}
          {detailTab === "activity" && (
            <div style={{ ...S.card, marginTop: 16 }}>
              <div style={S.sectionTitle}><span>Activity Timeline</span></div>
              {selectedActivities.length > 0 ? (
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  {/* Timeline line */}
                  <div style={{ position: "absolute", left: 9, top: 4, bottom: 4, width: 2, background: COLORS.border }} />
                  {selectedActivities.map((a, i) => (
                    <div key={a.id} style={{ padding: "10px 0", position: "relative" }}>
                      {/* Timeline dot */}
                      <div style={{ position: "absolute", left: -22, top: 14, width: 10, height: 10, borderRadius: "50%", background: activityColor(a.type), border: `2px solid ${COLORS.card}` }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <div>
                          <div style={{ fontSize: 13 }}>
                            <span style={{ marginRight: 6 }}>{activityIcon(a.type)}</span>
                            <span style={{ fontWeight: 600, color: activityColor(a.type) }}>{a.description}</span>
                          </div>
                          {a.detail && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2, marginLeft: 22 }}>{a.detail}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 11, color: COLORS.textMuted }}>{fmtTime(a.createdAt)}</div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted }}>{a.createdBy}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.emptyState}>No activity recorded yet. Activities are logged automatically when you create tasks, log contacts, add notes, or change statuses.</div>
              )}
            </div>
          )}

          {/* TAB: Notes */}
          {detailTab === "notes" && (
            <div style={{ marginTop: 16 }}>
              {/* Add Note */}
              <div style={{ ...S.card, marginBottom: 16 }}>
                <textarea
                  style={{ ...S.input, minHeight: 80, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note about this account..."
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button style={{ ...S.btn(), opacity: noteText.trim() ? 1 : 0.5 }} onClick={addNote} disabled={!noteText.trim()}>Add Note</button>
                </div>
              </div>
              {/* Notes List */}
              {selectedNotes.map(n => (
                <div key={n.id} style={{ ...S.card, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.text}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8, display: "flex", gap: 12 }}>
                    <span>{n.createdBy}</span>
                    <span>{fmtTime(n.createdAt)}</span>
                  </div>
                </div>
              ))}
              {selectedNotes.length === 0 && <div style={S.emptyState}>No notes yet. Add your first note above.</div>}
            </div>
          )}

          {/* TAB: Tasks */}
          {detailTab === "tasks" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button style={S.btn()} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
              </div>
              {selectedTasks.sort((a, b) => {
                if (a.status === "Completed" && b.status !== "Completed") return 1;
                if (a.status !== "Completed" && b.status === "Completed") return -1;
                return (a.dueDate || "z").localeCompare(b.dueDate || "z");
              }).map(t => (
                <div key={t.id} style={{ ...S.card, padding: "12px 16px", marginBottom: 6, display: "flex", alignItems: "center", gap: 12, opacity: t.status === "Completed" ? 0.5 : 1 }}>
                  <div
                    style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${t.status === "Completed" ? COLORS.success : COLORS.border}`, background: t.status === "Completed" ? `${COLORS.success}30` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.success, flexShrink: 0 }}
                    onClick={() => toggleTaskComplete(t.id)}
                  >
                    {t.status === "Completed" && "✓"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, textDecoration: t.status === "Completed" ? "line-through" : "none" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{t.status}{t.status === "In Progress" ? " · In Progress" : ""}</div>
                  </div>
                  <span style={S.badge(urgencyColor(t.priority))}>{t.priority}</span>
                  <span style={{ fontSize: 12, color: t.dueDate < todayStr && t.status !== "Completed" ? COLORS.danger : COLORS.textDim, minWidth: 70, textAlign: "right" }}>{fmtShort(t.dueDate)}</span>
                </div>
              ))}
              {selectedTasks.length === 0 && <div style={S.emptyState}>No tasks linked to this account.</div>}

              {showTaskForm && (
                <Modal title="Add Task" onClose={() => setShowTaskForm(false)}>
                  <FormField label="Title"><input style={S.input} value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="What needs to be done?" /></FormField>
                  <div style={S.grid(2)}>
                    <FormField label="Due Date"><input style={S.input} type="date" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></FormField>
                    <FormField label="Priority">
                      <select style={S.input} value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}>
                        {["Low","Medium","High","Urgent"].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </FormField>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button style={S.btn()} onClick={addTask}>Create Task</button>
                    <button style={S.btn("ghost")} onClick={() => setShowTaskForm(false)}>Cancel</button>
                  </div>
                </Modal>
              )}
            </div>
          )}

          {/* TAB: Service Items */}
          {detailTab === "service" && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: COLORS.textDim }}>{selectedServices.length} service item{selectedServices.length !== 1 ? "s" : ""}</div>
                <button style={{ ...S.btn(), padding: "4px 12px", fontSize: 12 }} onClick={() => {
                  setShowServiceAdd(true);
                }}>+ Add Service Item</button>
              </div>
              {selectedServices.length > 0 ? selectedServices.map(si => {
                const pol = policyMap[si.policyId] || {};
                const attempts = si.contactAttempts || [];
                const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                const isCompleted = si.status === "Done";
                const polReqCancel = pol.status === "Requested Cancel";
                return (
                  <div key={si.id} style={{ ...S.card, marginBottom: 8, borderLeft: `3px solid ${polReqCancel ? COLORS.textMuted : txnColor}`, opacity: isCompleted || polReqCancel ? 0.5 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, textDecoration: isCompleted ? "line-through" : "none" }}>{si.description}{polReqCancel && !isCompleted && <span style={{ fontSize: 10, marginLeft: 8, padding: "1px 6px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", fontWeight: 600 }}>REQ CANCEL</span>}</div>
                        <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${txnColor}25`, color: txnColor }}>{si.type}</span>
                          {(pol.carrier || si.carrier) && <span>{pol.carrier || si.carrier}{pol.lob ? ` · ${pol.lob}` : ""}{(pol.policyNumber || si.policyNumber) ? ` · #${pol.policyNumber || si.policyNumber}` : ""}{pol.effectiveDate ? ` · Eff ${fmt(pol.effectiveDate)}` : ""}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <select
                          value={si.status}
                          onChange={e => {
                            const newVal = e.target.value;
                            if (newVal === "Renewed") { setRenewalPopupSI(si); return; }
                            let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, status: newVal } : s) };
                            updated = addActivity(updated, si.accountId, "status_change", `Service item status → ${newVal}`, si.description);
                            if (newVal === "Done") updated = safeActivateRenewalPolicy(updated, si);
                            setData(updated);
                          }}
                          style={{ ...S.select, padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, background: statusBadgeStyle(si.status).background, color: statusBadgeStyle(si.status).color, border: "none" }}
                        >
                          {getServiceStatuses(si).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: si.dueDate < todayStr && !isCompleted ? COLORS.danger : COLORS.textDim, fontWeight: si.dueDate < todayStr && !isCompleted ? 700 : 400, display: "flex", alignItems: "center", gap: 4 }}>
                          Due <input type="date" value={si.dueDate || ""} onChange={e => { const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, dueDate: e.target.value } : s) }; setData(updated); }}
                            style={{ background: "none", border: "none", color: "inherit", fontWeight: "inherit", fontSize: 11, padding: 0, cursor: "pointer" }} />
                          {si.dueDate < todayStr && !isCompleted ? " · OVERDUE" : ""}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>Amount Due: $<input type="number" min="0" value={si.amountDue || ""} placeholder="0" onChange={e => { const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, amountDue: Number(e.target.value) || 0 } : s) }; setData(updated); }}
                      style={{ background: "none", border: `1px solid ${COLORS.border}30`, borderRadius: 4, color: COLORS.text, fontWeight: 600, fontSize: 12, padding: "2px 6px", width: 90 }} /></div>

                    {/* Action tracking — editable from client view */}
                    <div style={{ marginTop: 8, padding: "8px 0 0", borderTop: `1px solid ${COLORS.border}20` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>LAST ACTION</div>
                          <input
                            style={{ ...S.input, padding: "4px 8px", fontSize: 12, background: COLORS.bg }}
                            value={si.lastAction || ""}
                            placeholder="What was done..."
                            onChange={e => {
                              const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, lastAction: e.target.value, lastActionDate: todayStr } : s) };
                              setData(updated);
                            }}
                          />
                          {si.lastActionDate && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{fmtShort(si.lastActionDate)}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>NEXT STEP</div>
                          <input
                            style={{ ...S.input, padding: "4px 8px", fontSize: 12, background: COLORS.bg }}
                            value={si.nextStep || ""}
                            placeholder="What needs to happen..."
                            onChange={e => {
                              const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, nextStep: e.target.value } : s) };
                              setData(updated);
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {attempts.length > 0 && (
                      <div style={{ marginTop: 8, padding: "8px 0 0", borderTop: `1px solid ${COLORS.border}08` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, marginBottom: 4 }}>CONTACT LOG ({attempts.length})</div>
                        {attempts.slice(0, 3).map((c, i) => (
                          <div key={i} style={{ fontSize: 12, color: COLORS.textDim, padding: "2px 0" }}>
                            {fmtShort(c.date)} · {c.method}{c.notes ? ` — ${c.notes}` : ""}
                          </div>
                        ))}
                        {attempts.length > 3 && <div style={{ fontSize: 11, color: COLORS.textMuted }}>+{attempts.length - 3} more</div>}
                      </div>
                    )}

                    {/* Delete service item */}
                    <div style={{ marginTop: 8, textAlign: "right" }}>
                      <span
                        style={{ fontSize: 11, color: COLORS.textMuted, cursor: "pointer" }}
                        onClick={() => {
                          if (!confirm(`Delete: ${si.accountName} — ${si.type}?`)) return;
                          let updated = { ...data, serviceItems: data.serviceItems.filter(s => s.id !== si.id) };
                            updated = addActivity(updated, si.accountId, "status_change", `Service item deleted: ${si.type}`, si.description);
                            setData(updated, { undo: true, message: `Deleted: ${si.accountName} — ${si.type}` });
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = COLORS.danger}
                        onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}
                      >Delete</span>
                    </div>
                  </div>
                );
              }) : <div style={S.emptyState}>No service items for this account.</div>}
            </div>
          )}
        </>
          )}
        </>
      )}

      {showAdd && (
        <Modal title="New Client" onClose={() => setShowAdd(false)}>
          <FormField label="Name *"><input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Client or business name" autoFocus /></FormField>
          <FormField label="Type">
            <select style={S.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="Personal">Personal</option><option value="Commercial">Commercial</option>
            </select>
          </FormField>
          <div style={S.grid(2)}>
            <FormField label="Phone"><input style={S.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Email"><input style={S.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></FormField>
          </div>
          <FormField label="Address"><input style={S.input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></FormField>
          <div style={S.grid(3)}>
            <FormField label="City"><input style={S.input} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></FormField>
            <FormField label="State"><input style={S.input} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></FormField>
            <FormField label="Zip"><input style={S.input} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></FormField>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...S.btn(), opacity: form.name.trim() ? 1 : 0.5 }} onClick={handleAdd} disabled={!form.name.trim()}>Add Client</button>
            <button style={S.btn("ghost")} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {showServiceAdd && selected && (
        <Modal title={`New Service Item — ${selected.name}`} onClose={() => setShowServiceAdd(false)}>
          <FormField label="Transaction Type">
            <select style={S.input} value={serviceForm.type} onChange={e => setServiceForm({ ...serviceForm, type: e.target.value })}>
              {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Policy">
            <select style={S.input} value={serviceForm.policyId} onChange={e => setServiceForm({ ...serviceForm, policyId: e.target.value })}>
              <option value="">Select policy...</option>
              {selectedPolicies.map(p => <option key={p.id} value={p.id}>{p.carrier} — {p.lob} ({p.policyNumber})</option>)}
            </select>
          </FormField>
          <FormField label="Description"><input style={S.input} value={serviceForm.description} onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })} placeholder="Describe the service item..." /></FormField>
          <div style={S.grid(2)}>
            <FormField label="Due Date"><input style={S.input} type="date" value={serviceForm.dueDate} onChange={e => setServiceForm({ ...serviceForm, dueDate: e.target.value })} /></FormField>
            <FormField label="Amount Due"><input style={S.input} type="number" value={serviceForm.amountDue} onChange={e => setServiceForm({ ...serviceForm, amountDue: e.target.value })} placeholder="0.00" /></FormField>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={S.btn()} onClick={() => {
              const newItem = {
                id: uid(), type: serviceForm.type, accountId: selected.id, accountName: selected.name,
                policyId: serviceForm.policyId, description: serviceForm.description, status: "Uncontacted", flags: [],
                assignedTo: config.agentName || "Agent", dueDate: serviceForm.dueDate, urgency: "Medium", created: todayStr,
                amountDue: Number(serviceForm.amountDue) || 0, lastAction: "", lastActionDate: "", nextStep: "",
                followUpDate: "", contactAttempts: []
              };
              let updated = { ...data, serviceItems: [...data.serviceItems, newItem] };
              updated = addActivity(updated, selected.id, "service_created", `Service item created: ${serviceForm.type}`, serviceForm.description);
              setData(updated);
              setShowServiceAdd(false);
              setServiceForm({ type: "Ivantage Renewal", policyId: "", description: "", dueDate: "", amountDue: "" });
            }}>Create</button>
            <button style={S.btn("ghost")} onClick={() => setShowServiceAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}
      {cancellingPolicyId && <CancellationModal policyId={cancellingPolicyId} data={data} setData={setData} config={config} onClose={() => setCancellingPolicyId(null)} />}
      {showMerge && selected && (() => {
        const otherAccounts = data.accounts.filter(a => a.id !== selected.id && a.name.toLowerCase().includes(mergeSearch.toLowerCase()));
        const source = mergeTarget; // account being merged INTO selected
        const sourcePols = source ? data.policies.filter(p => p.accountId === source.id) : [];
        const sourceSIs = source ? (data.serviceItems || []).filter(s => s.accountId === source.id) : [];
        const sourceTasks = source ? (data.tasks || []).filter(t => t.linkedId === source.id && t.linkedType === "account") : [];
        const sourceNotes = source ? (data.notes || []).filter(n => n.accountId === source.id) : [];
        const sourceActivities = source ? (data.activities || []).filter(a => a.accountId === source.id) : [];
        const sourceContacts = source ? (source.contacts || []).filter((_, i) => i > 0) : []; // skip primary
        const sourcePrimary = source && (source.contacts || [])[0];

        const handleMerge = () => {
          if (!source) return;
          const targetName = selected.name;
          const targetId = selected.id;
          let updated = { ...data };
          // Move policies
          updated.policies = updated.policies.map(p => p.accountId === source.id ? { ...p, accountId: targetId, accountName: targetName } : p);
          // Move service items
          updated.serviceItems = (updated.serviceItems || []).map(s => s.accountId === source.id ? { ...s, accountId: targetId, accountName: targetName } : s);
          // Move tasks
          updated.tasks = (updated.tasks || []).map(t => t.linkedId === source.id && t.linkedType === "account" ? { ...t, linkedId: targetId, linkedName: targetName } : t);
          // Move notes
          updated.notes = (updated.notes || []).map(n => n.accountId === source.id ? { ...n, accountId: targetId } : n);
          // Move activities
          updated.activities = (updated.activities || []).map(a => a.accountId === source.id ? { ...a, accountId: targetId } : a);
          // Merge contacts — add source primary as its relationship type, then other contacts
          const existingContacts = [...(selected.contacts || [])];
          if (sourcePrimary) existingContacts.push({ ...sourcePrimary, relationship: sourcePrimary.relationship === "Primary" ? "Spouse" : sourcePrimary.relationship });
          sourceContacts.forEach(c => existingContacts.push({ ...c }));
          // Update target account with merged contacts, and fill in any missing address info
          updated.accounts = updated.accounts.map(a => {
            if (a.id !== targetId) return a;
            return { ...a, contacts: existingContacts,
              phone: a.phone || source.phone || "",
              email: a.email || source.email || "",
              address: a.address || source.address || "",
              city: a.city || source.city || "",
              state: a.state || source.state || "",
              zip: a.zip || source.zip || ""
            };
          });
          // Remove source account
          updated.accounts = updated.accounts.filter(a => a.id !== source.id);
          // Log activity
          updated = addActivity(updated, targetId, "account_merged", `Merged account "${source.name}" into "${targetName}" (${sourcePols.length} policies, ${sourceSIs.length} service items, ${sourceContacts.length + (sourcePrimary ? 1 : 0)} contacts)`);
          setData(updated, { undo: true, message: `Merged "${source.name}" → "${targetName}"` });
          // Refresh selected
          setSelected(updated.accounts.find(a => a.id === targetId));
          setShowMerge(false);
          setMergeTarget(null);
        };

        return (
          <div style={S.overlay} onClick={() => setShowMerge(false)} data-modal="true">
            <div style={{ ...S.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>🔗 Merge Account</div>
                <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setShowMerge(false)}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>
                Merge another account <strong>into {selected.name}</strong>. All policies, service items, tasks, notes, and contacts from the source will be moved here, and the source account will be deleted.
              </div>

              {!mergeTarget ? (
                <div>
                  <input style={{ ...S.input, width: "100%", marginBottom: 8 }} placeholder="Search for account to merge..." value={mergeSearch} onChange={e => setMergeSearch(e.target.value)} autoFocus />
                  <div style={{ maxHeight: 250, overflowY: "auto" }}>
                    {mergeSearch.length > 0 && otherAccounts.slice(0, 10).map(a => {
                      const polCount = data.policies.filter(p => p.accountId === a.id).length;
                      return (
                        <div key={a.id} style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.bg, marginBottom: 4 }}
                          onClick={() => setMergeTarget(a)} onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover} onMouseLeave={e => e.currentTarget.style.background = COLORS.bg}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                            <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.type} · {a.phone || a.email || "No contact"}</div>
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.textDim }}>{polCount} {polCount === 1 ? "policy" : "policies"}</div>
                        </div>
                      );
                    })}
                    {mergeSearch.length > 0 && otherAccounts.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 8 }}>No matching accounts found</div>}
                    {mergeSearch.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 12, padding: 8 }}>Type to search...</div>}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Source summary */}
                  <div style={{ background: `${COLORS.warning}10`, border: `1px solid ${COLORS.warning}30`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>⚠️ Merging "{source.name}" → "{selected.name}"</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
                      The following will be moved to <strong>{selected.name}</strong>:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8, fontSize: 12 }}>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>📋 {sourcePols.length} {sourcePols.length === 1 ? "policy" : "policies"}</div>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>🔧 {sourceSIs.length} service item{sourceSIs.length !== 1 ? "s" : ""}</div>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>✅ {sourceTasks.length} task{sourceTasks.length !== 1 ? "s" : ""}</div>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>👥 {sourceContacts.length + (sourcePrimary ? 1 : 0)} contact{sourceContacts.length + (sourcePrimary ? 1 : 0) !== 1 ? "s" : ""}</div>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>📝 {sourceNotes.length} note{sourceNotes.length !== 1 ? "s" : ""}</div>
                      <div style={{ padding: "4px 8px", background: COLORS.card, borderRadius: 4 }}>📊 {sourceActivities.length} activit{sourceActivities.length !== 1 ? "ies" : "y"}</div>
                    </div>
                  </div>

                  {/* Policy list preview */}
                  {sourcePols.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>POLICIES BEING MOVED</div>
                      {sourcePols.map(p => (
                        <div key={p.id} style={{ fontSize: 12, padding: "4px 0", display: "flex", justifyContent: "space-between" }}>
                          <span>{p.carrier} — {p.lob} #{p.policyNumber || "—"}</span>
                          <span style={{ color: COLORS.textDim }}>${(p.premium || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contact merge preview */}
                  {sourcePrimary && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>CONTACTS BEING ADDED</div>
                      <div style={{ fontSize: 12, padding: "4px 0" }}>{sourcePrimary.name || source.name} — will be added as Spouse</div>
                      {sourceContacts.map((c, i) => (
                        <div key={i} style={{ fontSize: 12, padding: "4px 0" }}>{c.name || "—"} — {c.relationship}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`, borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 12, color: COLORS.danger }}>
                    <strong>"{source.name}"</strong> will be permanently deleted after merge. This can be undone.
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={S.btn("ghost")} onClick={() => setMergeTarget(null)}>← Back</button>
                    <button style={S.btn("ghost")} onClick={() => setShowMerge(false)}>Cancel</button>
                    <button style={{ ...S.btn(), background: COLORS.accent }} onClick={handleMerge}>Merge Accounts</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ==================== POLICIES ====================
function Policies({ data, setData, nav, initialPolicyId, clearInitialPolicy, config }) {
  const todayStr = today();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("details");
  const [form, setForm] = useState({ accountId: "", carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", status: "Active", paymentPlan: "Monthly", vehicleCount: 1, broker: "", agencyFee: "", commissionPct: 10 });
  const carrierGroups = config.carrierGroups || {};
  const carrierList = Object.keys(carrierGroups).sort();
  const [polSort, setPolSort] = useState({ key: null, dir: "asc" });
  const defaultPolWidths = { client: 150, carrier: 140, policyNumber: 130, lob: 110, effectiveDate: 115, expirationDate: 115, premium: 100, status: 95 };
  const [polColWidths, setPolColWidths] = useState(defaultPolWidths);
  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [activeCell, setActiveCell] = useState(null); // { row, col } indices
  const [cellValue, setCellValue] = useState("");
  const [isEditing, setIsEditing] = useState(false); // actively typing in a cell
  const cellInputRef = useRef(null);
  const tableRef = useRef(null);
  // Column filters
  const [colFilters, setColFilters] = useState({});
  const [showFilters, setShowFilters] = useState(true);
  const [renewalPopupSI, setRenewalPopupSI] = useState(null);
  const [cancellingPolicyId, setCancellingPolicyId] = useState(null);
  const [polAddSI, setPolAddSI] = useState(false);
  const [polSIForm, setPolSIForm] = useState({ type: "Ivantage Renewal", description: "", dueDate: "", amountDue: "", status: "Uncontacted" });
  const [polEditSI, setPolEditSI] = useState(null);
  const activeFilterCount = Object.values(colFilters).filter(v => v !== "").length;

  useEffect(() => {
    if (initialPolicyId) {
      const pol = data.policies.find(p => p.id === initialPolicyId);
      if (pol) { setSelected(pol); setDetailTab("details"); }
      if (clearInitialPolicy) clearInitialPolicy();
    }
  }, [initialPolicyId]);

  const filtered = data.policies.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!((p.accountName || "").toLowerCase().includes(q) || (p.namedInsured || "").toLowerCase().includes(q) || (p.policyNumber || "").toLowerCase().includes(q) || (p.carrier || "").toLowerCase().includes(q) || (p.lob || "").toLowerCase().includes(q))) return false;
    }
    // Column filters
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (key === "client") { if (!(p.accountName || "").toLowerCase().includes(v)) return false; }
      else if (key === "carrier") { if ((p.carrier || "") !== val) return false; }
      else if (key === "lob") { if ((p.lob || "") !== val) return false; }
      else if (key === "status") { if ((p.status || "") !== val) return false; }
      else if (key === "policyNumber") { if (!(p.policyNumber || "").toLowerCase().includes(v)) return false; }
      else if (key === "premium") {
        const pv = String(p.premium || 0);
        if (!pv.includes(val)) return false;
      }
      else if (key === "effectiveDate" || key === "expirationDate") {
        const dStr = p[key] || "";
        const fmtStr = dStr ? fmt(dStr) : "";
        if (!dStr.includes(val) && !fmtStr.toLowerCase().includes(v)) return false;
      }
      else { if (!(p[key] || "").toLowerCase().includes(v)) return false; }
    }
    return true;
  });

  const sortedPolicies = useMemo(() => {
    if (!polSort.key) return filtered;
    const dir = polSort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va, vb;
      if (polSort.key === "premium") { va = a.premium || 0; vb = b.premium || 0; return (va - vb) * dir; }
      if (polSort.key === "client") { va = (a.accountName || "").toLowerCase(); vb = (b.accountName || "").toLowerCase(); }
      else if (polSort.key === "effectiveDate" || polSort.key === "expirationDate") { va = a[polSort.key] || ""; vb = b[polSort.key] || ""; }
      else { va = (a[polSort.key] || "").toLowerCase(); vb = (b[polSort.key] || "").toLowerCase(); }
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filtered, polSort]);

  const togglePolSort = (key) => {
    setPolSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  const startColResize = (colKey, e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = polColWidths[colKey] || 100;
    const onMove = (ev) => { const diff = ev.clientX - startX; setPolColWidths(prev => ({ ...prev, [colKey]: Math.max(50, startW + diff) })); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const polColumns = useMemo(() => [
    ...(!selected ? [{ key: "client", label: "Client", field: "accountName" }] : []),
    { key: "carrier", label: "Carrier", field: "carrier", editable: true, editType: "select", options: Object.keys(config.carrierGroups || {}).sort() },
    { key: "policyNumber", label: "Policy #", field: "policyNumber", editable: true },
    { key: "lob", label: "LOB", field: "lob", editable: true, editType: "select", options: config.lobOptions || LOB_OPTIONS },
    { key: "effectiveDate", label: "Eff Date", field: "effectiveDate", editable: true, editType: "date" },
    { key: "expirationDate", label: "Exp Date", field: "expirationDate", editable: true, editType: "date" },
    { key: "premium", label: "Premium", field: "premium", editable: true, editType: "number" },
    { key: "status", label: "Status", field: "status", editable: true, editType: "select", options: POLICY_STATUSES },
  ], [selected, config.carrierGroups]);

  // Edit mode helpers
  const editableCols = useMemo(() => polColumns.map((c, i) => c.editable ? i : -1).filter(i => i >= 0), [polColumns]);

  // Distinct values for dropdown column filters (from all policies, not filtered)
  const distinctVals = useMemo(() => {
    const vals = {};
    const keys = ["carrier", "lob", "status"];
    keys.forEach(k => {
      const set = new Set();
      data.policies.forEach(p => { if (p[k]) set.add(p[k]); });
      vals[k] = [...set].sort();
    });
    return vals;
  }, [data.policies]);

  const getCellValue = (policy, col) => {
    if (col.key === "premium") return String(policy.premium || "");
    return policy[col.field] || "";
  };

  const activateCell = (row, col) => {
    setActiveCell({ row, col });
    const policy = sortedPolicies[row];
    const colDef = polColumns[col];
    if (policy && colDef) setCellValue(getCellValue(policy, colDef));
    setIsEditing(false);
  };

  // Normalize a raw value for a given column type
  const cleanCellValue = (colDef, raw) => {
    if (!colDef || raw === undefined || raw === null) return "";
    const text = String(raw).trim();
    if (!text) return colDef.key === "premium" ? 0 : "";
    if (colDef.key === "premium") return Number(text.replace(/[$,\s]/g, "")) || 0;
    if (colDef.editType === "date") {
      const nd = normalizeDate(text);
      // Only accept properly normalized YYYY-MM-DD dates
      if (nd && /^\d{4}-\d{2}-\d{2}$/.test(nd)) return nd;
      return "";
    }
    if (colDef.editType === "select" && colDef.options) {
      // Exact match first
      const exact = colDef.options.find(o => o === text);
      if (exact) return exact;
      // Case-insensitive match
      const lower = text.toLowerCase();
      const ci = colDef.options.find(o => o.toLowerCase() === lower);
      if (ci) return ci;
      // Partial/starts-with match
      const partial = colDef.options.find(o => o.toLowerCase().startsWith(lower));
      if (partial) return partial;
      // For carrier, normalize to match carrierGroups
      if (colDef.key === "carrier") return normalizeCarrier(text, config.carrierGroups);
      return "";
    }
    return text;
  };

  const commitCell = (andMove) => {
    if (!activeCell) return;
    const policy = sortedPolicies[activeCell.row];
    const colDef = polColumns[activeCell.col];
    if (policy && colDef && colDef.editable) {
      const val = cleanCellValue(colDef, cellValue);
      const changes = { [colDef.field]: val };
      // Auto-fill expiration when effective date is set
      if (colDef.field === "effectiveDate" && val) {
        changes.expirationDate = calcExpiration(val, policy.lob);
      }
      // Recalc expiration when LOB changes and effective date exists
      if (colDef.field === "lob" && policy.effectiveDate) {
        changes.expirationDate = calcExpiration(policy.effectiveDate, val);
      }
      updatePolicy(policy.id, changes);
    }
    setIsEditing(false);
    if (andMove === "down") {
      const nextRow = Math.min(activeCell.row + 1, sortedPolicies.length - 1);
      activateCell(nextRow, activeCell.col);
    } else if (andMove === "right") {
      const nextCol = activeCell.col + 1 < polColumns.length ? activeCell.col + 1 : activeCell.col;
      activateCell(activeCell.row, nextCol);
    } else if (andMove === "left") {
      const prevCol = activeCell.col > 0 ? activeCell.col - 1 : 0;
      activateCell(activeCell.row, prevCol);
    }
  };

  const handleCellKeyDown = (e) => {
    if (!activeCell) return;
    const { row, col } = activeCell;
    const maxRow = sortedPolicies.length - 1;
    const maxCol = polColumns.length - 1;

    if (e.key === "Escape") {
      setIsEditing(false);
      const policy = sortedPolicies[row];
      const colDef = polColumns[col];
      if (policy && colDef) setCellValue(getCellValue(policy, colDef));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (isEditing) { commitCell("down"); } else { setIsEditing(true); }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (isEditing) commitCell(e.shiftKey ? "left" : "right");
      else activateCell(row, e.shiftKey ? Math.max(0, col - 1) : Math.min(maxCol, col + 1));
      return;
    }
    if (!isEditing) {
      if (e.key === "ArrowDown") { e.preventDefault(); activateCell(Math.min(maxRow, row + 1), col); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); activateCell(Math.max(0, row - 1), col); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); activateCell(row, Math.min(maxCol, col + 1)); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); activateCell(row, Math.max(0, col - 1)); return; }
      if (e.key === "F2" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
        setIsEditing(true);
        if (e.key.length === 1) { setCellValue(e.key); e.preventDefault(); }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setCellValue("");
        setIsEditing(true);
        return;
      }
    } else {
      // While editing, arrows in selects/dates should work normally
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const colDef = polColumns[col];
        if (colDef && colDef.editType === "select") return; // let select handle it
      }
    }
  };

  // Use refs to avoid stale closures in paste handler
  const activeCellRef = useRef(activeCell);
  const sortedRef = useRef(sortedPolicies);
  const polColumnsRef = useRef(polColumns);
  useEffect(() => { activeCellRef.current = activeCell; }, [activeCell]);
  useEffect(() => { sortedRef.current = sortedPolicies; }, [sortedPolicies]);
  useEffect(() => { polColumnsRef.current = polColumns; }, [polColumns]);

  const handlePaste = (e) => {
    const ac = activeCellRef.current;
    const sp = sortedRef.current;
    const cols = polColumnsRef.current;
    if (!editMode || !ac) return;
    const text = (e.clipboardData || window.clipboardData || {}).getData("text/plain");
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    const rows = text.split(/\r?\n/).filter(r => r.length > 0);
    // Check if multi-cell paste (multiple tabs or multiple rows)
    const isMultiCell = rows.length > 1 || (rows[0] && rows[0].includes("\t"));
    if (!isMultiCell) {
      // Single cell paste — let input handle it normally if editing
      if (isEditing) return;
      // If just selected (not editing), paste into the single cell
      const colDef = cols[ac.col];
      const policy = sp[ac.row];
      if (colDef && colDef.editable && policy) {
        const val = cleanCellValue(colDef, text);
        const changes = { [colDef.field]: val };
        if (colDef.field === "effectiveDate" && val) {
          changes.expirationDate = calcExpiration(val, policy.lob);
        }
        if (colDef.field === "lob" && policy.effectiveDate) {
          changes.expirationDate = calcExpiration(policy.effectiveDate, val);
        }
        if (val !== "" || colDef.key !== "status") updatePolicy(policy.id, changes);
      }
      return;
    }
    // Multi-cell paste
    let updates = {};
    rows.forEach((rowText, ri) => {
      const cells = rowText.split("\t");
      const targetRow = ac.row + ri;
      if (targetRow >= sp.length) return;
      const policy = sp[targetRow];
      cells.forEach((cellText, ci) => {
        const targetCol = ac.col + ci;
        if (targetCol >= cols.length) return;
        const colDef = cols[targetCol];
        if (!colDef || !colDef.editable) return;
        const val = cleanCellValue(colDef, cellText);
        if (val === "" && colDef.editType === "select") return; // skip invalid select values
        if (!updates[policy.id]) updates[policy.id] = {};
        updates[policy.id][colDef.field] = val;
      });
    });
    if (Object.keys(updates).length > 0) {
      // Auto-fill expiration when effectiveDate is pasted
      for (const polId of Object.keys(updates)) {
        const pol = sp.find(p => p.id === polId);
        const lob = updates[polId].lob || (pol && pol.lob) || "";
        if (updates[polId].effectiveDate && !updates[polId].expirationDate) {
          updates[polId].expirationDate = calcExpiration(updates[polId].effectiveDate, lob);
        }
        // Recalc if LOB changed and effectiveDate exists
        if (updates[polId].lob && !updates[polId].effectiveDate && !updates[polId].expirationDate) {
          const effDate = pol && pol.effectiveDate;
          if (effDate) updates[polId].expirationDate = calcExpiration(effDate, updates[polId].lob);
        }
      }
      const up = { ...data, policies: data.policies.map(p => updates[p.id] ? { ...p, ...updates[p.id] } : p) };
      setData(up);
    }
  };

  // Focus table container when entering edit mode or navigating cells
  useEffect(() => {
    if (editMode && !isEditing && tableRef.current) tableRef.current.focus();
  }, [editMode, activeCell, isEditing]);

  // Focus cell input when editing starts
  useEffect(() => {
    if (isEditing && cellInputRef.current) cellInputRef.current.focus();
  }, [isEditing, activeCell]);

  const exitEditMode = () => {
    if (isEditing) commitCell();
    setEditMode(false);
    setActiveCell(null);
    setIsEditing(false);
  };

  const enterEditMode = () => {
    setEditMode(true);
    setSelected(null);
    if (sortedPolicies.length > 0 && editableCols.length > 0) activateCell(0, editableCols[0]);
  };

  const handleAdd = () => {
    const valErrors = validatePolicyFields({ premium: form.premium, effectiveDate: normalizeDate(form.effectiveDate), expirationDate: normalizeDate(form.expirationDate), agencyFee: form.agencyFee, commissionPct: form.commissionPct, vehicleCount: form.vehicleCount });
    if (valErrors.length > 0) { alert("Please fix:\n• " + valErrors.join("\n• ")); return; }
    const account = data.accounts.find(a => a.id === form.accountId);
    const docTypes = getDocTypes(form.lob);
    const docs = {};
    docTypes.forEach(d => docs[d] = false);
    const isAuto = isAutoTermLob(form.lob);
    const newPolId = uid();
    const newPolicy = { ...form, id: newPolId, accountName: account ? account.name : "", premium: Number(form.premium) || 0, vehicleCount: isAuto ? (Number(form.vehicleCount) || 1) : 0, documents: docs, notes: "", agencyFee: Number(form.agencyFee) || 0, commissionPct: Number(form.commissionPct) ?? 10, broker: form.broker || "" };
    // Auto-create renewal service item if expiring within renewal window
    const _polExpDate = normalizeDate(form.expirationDate);
    const _polDaysToExp = _polExpDate ? daysBetween(todayStr, _polExpDate) : -1;
    const _polRenWindow = renewalWindow(form.lob);
    let updated;
    if (_polDaysToExp >= 0 && _polDaysToExp <= _polRenWindow) {
      const _polRenType = isCommercialLob(form.lob) ? "Commercial Renewal" : (form.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
      const newSI = {
        id: uid(), type: _polRenType, accountId: form.accountId, accountName: account ? account.name : "",
        policyId: newPolId, policyNumber: form.policyNumber, carrier: form.carrier, lob: form.lob,
        description: `${form.carrier} ${form.lob} Renewal`, dueDate: _polExpDate || todayStr,
        amountDue: Number(form.premium) || 0, status: "Uncontacted", urgency: _polDaysToExp <= 14 ? "High" : "Medium",
        assignedTo: config.agentName || "Agent", created: todayStr, lastAction: "", lastActionDate: "",
        followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
      };
      updated = { ...data, policies: [...data.policies, newPolicy], serviceItems: [...data.serviceItems, newSI] };
    } else {
      updated = { ...data, policies: [...data.policies, newPolicy] };
    }
    if (account) updated = addActivity(updated, account.id, "status_change", `Policy added: ${form.carrier} — ${form.lob}`, form.policyNumber || "");
    setData(updated);
    setShowAdd(false);
    setForm({ accountId: "", carrier: "", lob: "Auto", policyNumber: "", namedInsured: "", effectiveDate: "", expirationDate: "", premium: "", status: "Active", paymentPlan: "Monthly", vehicleCount: 1, broker: "", agencyFee: "", commissionPct: 10 });
  };

  const updatePolicy = (id, changes) => {
    // Intercept Cancelled status — open cancellation modal
    if (changes.status === "Cancelled") { setCancellingPolicyId(id); return; }
    // Validate numeric fields inline
    if (changes.premium !== undefined && changes.premium !== "" && Number(changes.premium) < 0) return;
    if (changes.agencyFee !== undefined && changes.agencyFee !== "" && Number(changes.agencyFee) < 0) return;
    if (changes.commissionPct !== undefined && (Number(changes.commissionPct) < 0 || Number(changes.commissionPct) > 100)) return;
    if (changes.vehicleCount !== undefined && Number(changes.vehicleCount) < 0) return;
    const updated = { ...data, policies: data.policies.map(p => p.id === id ? { ...p, ...changes } : p) };
    setData(updated);
    if (selected && selected.id === id) setSelected({ ...selected, ...changes });
  };

  const toggleDoc = (policyId, docName) => {
    const pol = data.policies.find(p => p.id === policyId);
    if (!pol) return;
    const docs = { ...(pol.documents || {}) };
    docs[docName] = !docs[docName];
    updatePolicy(policyId, { documents: docs });
  };

  // Selected policy's linked data
  const linkedServices = selected ? data.serviceItems.filter(si => si.policyId === selected.id) : [];
  const linkedActivities = selected ? data.activities.filter(a => a.accountId === selected.accountId).slice(0, 10) : [];

  const daysToExpiry = (p) => p.expirationDate ? daysBetween(todayStr, p.expirationDate) : null;
  const expiryColor = (days) => {
    if (days === null) return COLORS.textDim;
    if (days < 0) return COLORS.danger;
    if (days <= 14) return COLORS.danger;
    if (days <= 30) return COLORS.warning;
    if (days <= 60) return "#eab308";
    return COLORS.textDim;
  };

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Left: Policy List */}
      <div style={{ flex: selected ? "0 0 520px" : 1, minWidth: 0, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={S.pageTitle}>Policies</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn("ghost")} onClick={() => {
              exportCSV(["ID","Account","Named Insured","Carrier","LOB","Policy #","Effective","Expiration","Premium","Status","Payment Plan","Vehicles"],
                data.policies.map(p => [p.id,p.accountName,p.namedInsured||"",p.carrier,p.lob,p.policyNumber,p.effectiveDate,p.expirationDate,p.premium,p.status,p.paymentPlan,p.vehicleCount||0]),
                `sentinel-policies-${today()}.csv`);
            }}>↓ Export CSV</button>
            <button style={S.btn()} onClick={() => setShowAdd(true)}>+ New Policy</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <input style={{ ...S.input, maxWidth: 300 }} placeholder="Search policies..." value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ fontSize: 12, color: COLORS.textDim, whiteSpace: "nowrap" }}>{filtered.length} of {data.policies.length} policies</span>
          <div style={{ flex: 1 }} />
          {activeFilterCount > 0 && (
            <button style={{ ...S.btn(), padding: "6px 10px", fontSize: 11, color: COLORS.danger }} onClick={() => setColFilters({})} title="Clear all filters">✕ Clear Filters</button>
          )}
          {!editMode ? (
            <button style={{ ...S.btn(), padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={enterEditMode} title="Enter spreadsheet edit mode">
              ✏️ Edit Mode
            </button>
          ) : (
            <button style={{ ...S.btn(), padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, background: COLORS.success, color: "#fff" }} onClick={exitEditMode} title="Save and exit edit mode">
              ✓ Done Editing
            </button>
          )}
        </div>

        {editMode && (
          <div style={{ padding: "6px 12px", marginBottom: 8, background: `${COLORS.accent}10`, borderRadius: 6, fontSize: 11, color: COLORS.textDim, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><b>Enter</b> edit / move down</span>
            <span><b>Tab</b> move right</span>
            <span><b>Arrows</b> navigate</span>
            <span><b>Esc</b> cancel edit</span>
            <span><b>F2</b> start editing</span>
            <span><b>Ctrl+V</b> paste across cells</span>
          </div>
        )}

        <div ref={tableRef} tabIndex={0} data-no-nav-keys="true" onKeyDown={editMode ? handleCellKeyDown : undefined} onPaste={editMode ? handlePaste : undefined}
          style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 220px)", border: `1px solid ${COLORS.border}`, borderRadius: 8, outline: editMode ? `2px solid ${COLORS.accent}40` : "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 2 }}>
                {polColumns.map(col => {
                  const isSorted = polSort.key === col.key;
                  const arrow = isSorted ? (polSort.dir === "asc" ? " ▲" : " ▼") : "";
                  return (
                    <th key={col.key} style={{
                      textAlign: col.key === "premium" ? "right" : "left",
                      padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#fff",
                      textTransform: "uppercase", letterSpacing: "0.5px",
                      borderBottom: "2px solid #0f2847",
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                      background: "#1a3258",
                      width: polColWidths[col.key] || 100,
                      minWidth: 50, position: "relative", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    }} onClick={() => togglePolSort(col.key)}>
                      <span>{col.label}{arrow}</span>
                      <div
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 3 }}
                        onMouseDown={e => startColResize(col.key, e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
              {showFilters && (
                <tr style={{ position: "sticky", top: 39, zIndex: 2 }}>
                  {polColumns.map(col => {
                    const fVal = colFilters[col.key] || "";
                    const filterStyle = { width: "100%", padding: "3px 4px", fontSize: 11, border: `1px solid ${COLORS.border}`, borderRadius: 3, background: COLORS.bg, color: COLORS.text, outline: "none", boxSizing: "border-box" };
                    const isDropdown = col.key === "carrier" || col.key === "lob" || col.key === "status";
                    return (
                      <th key={col.key} style={{
                        padding: "4px 6px", background: COLORS.card, borderBottom: `2px solid ${COLORS.accent}40`,
                        borderRight: `1px solid ${COLORS.border}40`,
                        width: polColWidths[col.key] || 100,
                      }}>
                        {isDropdown ? (
                          <select data-no-nav-keys="true" style={{ ...filterStyle, cursor: "pointer" }} value={fVal}
                            onChange={e => setColFilters(prev => ({ ...prev, [col.key]: e.target.value }))}>
                            <option value="">All</option>
                            {(distinctVals[col.key] || []).map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : (
                          <input data-no-nav-keys="true" style={filterStyle} type="text" placeholder="Filter..." value={fVal}
                            onChange={e => setColFilters(prev => ({ ...prev, [col.key]: e.target.value }))} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {sortedPolicies.map((p, rowIdx) => {
                const days = daysToExpiry(p);
                const isSelected = selected && selected.id === p.id;
                const expWarning = days !== null && days <= 60 && days >= 0;
                const isOverdue = days !== null && days < 0;

                return (
                  <tr key={p.id}
                    style={{
                      cursor: editMode ? "cell" : "pointer",
                      background: isSelected ? `${COLORS.accent}15` : rowIdx % 2 === 0 ? COLORS.card : COLORS.bg,
                      borderLeft: isSelected ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                    }}
                    onClick={editMode ? undefined : () => { setSelected(p); setDetailTab("details"); setPolAddSI(false); setPolEditSI(null); }}
                    onMouseEnter={e => { if (!isSelected && !editMode) e.currentTarget.style.background = COLORS.cardHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? `${COLORS.accent}15` : rowIdx % 2 === 0 ? COLORS.card : COLORS.bg; }}
                  >
                    {polColumns.map((col, colIdx) => {
                      const isCellActive = editMode && activeCell && activeCell.row === rowIdx && activeCell.col === colIdx;
                      const isCellEditing = isCellActive && isEditing;

                      // Render edit input
                      const handleInputPaste = (e) => {
                        const text = (e.clipboardData || window.clipboardData || {}).getData("text/plain");
                        if (text && (text.includes("\t") || text.split(/\r?\n/).filter(r => r.length).length > 1)) {
                          // Multi-cell paste — delegate to table-level handler
                          handlePaste(e);
                        }
                        // else: single value — let the input handle it normally
                      };
                      const renderEditInput = () => {
                        const eStyle = { ...S.input, padding: "2px 6px", fontSize: 12, width: "100%", margin: 0, background: COLORS.bg, border: "none", outline: "none", color: COLORS.text };
                        if (col.editType === "select") {
                          return <select ref={cellInputRef} style={eStyle} value={cellValue} onChange={e => setCellValue(e.target.value)}
                            onKeyDown={handleCellKeyDown} onBlur={() => commitCell()} onPaste={handleInputPaste}>
                            {col.key === "carrier" && !col.options.includes(cellValue) && cellValue && <option value={cellValue}>{cellValue}</option>}
                            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>;
                        }
                        if (col.editType === "date") return <input ref={cellInputRef} type="date" style={eStyle} value={cellValue} onChange={e => setCellValue(e.target.value)} onKeyDown={handleCellKeyDown} onPaste={handleInputPaste} />;
                        if (col.editType === "number") return <input ref={cellInputRef} type="number" style={eStyle} value={cellValue} onChange={e => setCellValue(e.target.value)} onKeyDown={handleCellKeyDown} onPaste={handleInputPaste} />;
                        return <input ref={cellInputRef} type="text" style={eStyle} value={cellValue} onChange={e => setCellValue(e.target.value)} onKeyDown={handleCellKeyDown} onPaste={handleInputPaste} />;
                      };

                      // Render display
                      const renderDisplay = () => {
                        if (col.key === "client") return <span style={{ fontWeight: 600 }}><AccountLink accountId={p.accountId} name={p.accountName} nav={nav} /></span>;
                        if (col.key === "premium") return <span style={{ fontWeight: 600 }}>${(p.premium || 0).toLocaleString()}</span>;
                        if (col.key === "status") return <span style={{ ...S.badge(statusColor(p.status)), fontSize: 10 }}>{p.status}</span>;
                        if (col.key === "effectiveDate") return <span style={{ color: COLORS.textDim }}>{p.effectiveDate ? fmt(p.effectiveDate) : "—"}</span>;
                        if (col.key === "expirationDate") return (<>
                          <span style={{ color: expWarning ? COLORS.warning : isOverdue ? COLORS.danger : COLORS.textDim, fontWeight: expWarning || isOverdue ? 600 : 400 }}>
                            {p.expirationDate ? fmt(p.expirationDate) : "—"}
                          </span>
                          {expWarning && <span style={{ fontSize: 10, marginLeft: 4, color: COLORS.warning }}>({days}d)</span>}
                          {isOverdue && <span style={{ fontSize: 10, marginLeft: 4, color: COLORS.danger }}>EXP</span>}
                        </>);
                        if (col.key === "carrier") return <span style={{ fontWeight: 600 }}>{p.carrier || "—"}</span>;
                        if (col.key === "policyNumber") return <span style={{ fontFamily: "monospace" }}>{p.policyNumber || "—"}</span>;
                        return <span>{p[col.field] || "—"}</span>;
                      };

                      return (
                        <td key={col.key}
                          style={{
                            padding: isCellEditing ? "2px 4px" : "8px 12px", fontSize: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            borderRight: `1px solid ${COLORS.border}`,
                            textAlign: col.key === "premium" ? "right" : "left",
                            width: polColWidths[col.key] || 100,
                            maxWidth: polColWidths[col.key] || 100,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            outline: isCellActive ? `2px solid ${COLORS.accent}` : "none",
                            outlineOffset: "-2px",
                            background: isCellActive ? `${COLORS.accent}12` : "",
                          }}
                          onClick={editMode ? (e) => { e.stopPropagation(); if (isEditing) commitCell(); activateCell(rowIdx, colIdx); } : undefined}
                          onDoubleClick={editMode ? (e) => { e.stopPropagation(); activateCell(rowIdx, colIdx); setIsEditing(true); } : undefined}
                        >
                          {isCellEditing ? renderEditInput() : renderDisplay()}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ ...S.emptyState, margin: 16 }}>No policies match your search</div>}
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selected && (() => {
        const p = data.policies.find(pol => pol.id === selected.id) || selected;
        const days = daysToExpiry(p);
        const docTypes = getDocTypes(p.lob);
        const docs = p.documents || {};
        const docsComplete = docTypes.filter(d => docs[d]).length;

        return (
          <div data-no-nav-keys="true" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{p.carrier} — {p.lob}</div>
                <div style={{ fontSize: 13, color: COLORS.textDim }}>
                  <AccountLink accountId={p.accountId} name={p.accountName} nav={nav} /> · <span style={{ fontFamily: "monospace" }}>{p.policyNumber}</span>

                </div>
              </div>
              <span style={{ fontSize: 12, color: COLORS.textMuted, cursor: "pointer" }} onClick={() => setSelected(null)}>✕ Close</span>
            </div>

            {/* Status bar */}
            <div style={{ ...S.card, padding: "12px 16px", marginBottom: 16 }}>
              <div style={S.grid(5)}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>STATUS</div>
                  <select
                    value={p.status} style={{ ...S.select, padding: "4px 8px", fontSize: 12, fontWeight: 600, color: statusColor(p.status), background: `${statusColor(p.status)}15`, border: "none", borderRadius: 4, marginTop: 2 }}
                    onChange={e => updatePolicy(p.id, { status: e.target.value })}
                  >
                    {POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>PREMIUM</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>${(p.premium || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>PAYMENT</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{p.paymentPlan}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>EFFECTIVE</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{fmtShort(p.effectiveDate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>EXPIRES</div>
                  <div style={{ fontSize: 13, marginTop: 4, color: expiryColor(days), fontWeight: days !== null && days <= 30 ? 700 : 400 }}>
                    {fmtShort(p.expirationDate)}
                    {days !== null && days >= 0 && <span style={{ fontSize: 11 }}> ({days}d)</span>}
                    {days !== null && days < 0 && <span style={{ fontSize: 11 }}> EXPIRED</span>}
                  </div>
                </div>
              </div>
              {p.status === "Cancelled" && (p.cancellationDate || p.cancellationReason) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}20`, fontSize: 12, color: COLORS.danger, display: "flex", gap: 16 }}>
                  {p.cancellationDate && <span>Cancelled: {fmtShort(p.cancellationDate)}</span>}
                  {p.cancellationReason && <span>Reason: {p.cancellationReason}</span>}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {["details","documents","service","notes","activity"].map(tab => (
                <span key={tab} style={S.pill(detailTab === tab)} onClick={() => setDetailTab(tab)}>
                  {tab === "details" ? "Details" : tab === "documents" ? `Documents (${docsComplete}/${docTypes.length})` : tab === "service" ? `Service (${linkedServices.filter(s => s.status !== "Done").length})` : tab === "notes" ? "Notes" : "Activity"}
                </span>
              ))}
            </div>

            {/* Details Tab */}
            {detailTab === "details" && (() => {
              const EditField = ({ label, value, field, type = "text", options, width }) => {
                const inputStyle = { ...S.input, padding: "4px 8px", fontSize: 13, fontWeight: 600, width: width || "100%" };
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
                    {options ? (
                      <select style={inputStyle} value={value || ""} onChange={e => {
                        const changes = { [field]: e.target.value };
                        if (field === "lob" && p.effectiveDate) {
                          changes.expirationDate = calcExpiration(p.effectiveDate, e.target.value);
                        }
                        updatePolicy(p.id, changes);
                      }}>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : type === "date" ? (
                      <input style={inputStyle} type="date" value={value || ""} onChange={e => {
                        const changes = { [field]: e.target.value };
                        if (field === "effectiveDate" && e.target.value) {
                          changes.expirationDate = calcExpiration(e.target.value, p.lob);
                        }
                        updatePolicy(p.id, changes);
                      }} />
                    ) : type === "number" ? (
                      <input style={inputStyle} type="number" value={value || ""} onChange={e => updatePolicy(p.id, { [field]: Number(e.target.value) || 0 })} />
                    ) : (
                      <input style={inputStyle} type="text" value={value || ""} placeholder={`Enter ${label.toLowerCase()}...`} onChange={e => updatePolicy(p.id, { [field]: e.target.value })} />
                    )}
                  </div>
                );
              };
              const isAuto = p.lob === "Auto" || p.lob === "Commercial Auto";
              const isHome = p.lob === "Home" || p.lob === "Homeowners" || p.lob === "Dwelling Fire" || p.lob === "Condo" || p.lob === "Renters" || p.lob === "DP-3" || p.lob === "DP-1";
              const _cGroups = config.carrierGroups || {};
              const _cList = Object.keys(_cGroups).sort();
              const _polAcct = data.accounts.find(a => a.id === p.accountId);
              const _isCommAcct = _polAcct && _polAcct.type === "Commercial";
              return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Left: Core Details */}
                  <div style={S.card}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, letterSpacing: "0.5px" }}>POLICY INFO</div>
                    <div style={S.grid(2)}>
                      <EditField label="Carrier" value={p.carrier} field="carrier" options={[...(_cList.includes(p.carrier) ? [] : [p.carrier]), ..._cList]} />
                      <EditField label="Line of Business" value={p.lob} field="lob" options={config.lobOptions || LOB_OPTIONS} />
                      <EditField label="Policy Number" value={p.policyNumber} field="policyNumber" />
                      <EditField label="Named Insured" value={p.namedInsured} field="namedInsured" />
                      <EditField label="Status" value={p.status} field="status" options={POLICY_STATUSES} />
                      {p.status === "Cancelled" && (<>
                        <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Cancellation Date</div><input style={{ ...S.input, padding: "4px 8px", fontSize: 13, fontWeight: 600, width: "100%" }} type="date" value={p.cancellationDate || ""} onChange={e => updatePolicy(p.id, { cancellationDate: e.target.value })} /></div>
                        <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Cancellation Reason</div><select style={{ ...S.input, padding: "4px 8px", fontSize: 13, fontWeight: 600, width: "100%" }} value={p.cancellationReason || ""} onChange={e => updatePolicy(p.id, { cancellationReason: e.target.value })}><option value="">—</option>{(config.cancellationReasons || []).map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                      </>)}
                      <EditField label="Effective Date" value={p.effectiveDate} field="effectiveDate" type="date" />
                      <EditField label="Expiration Date" value={p.expirationDate} field="expirationDate" type="date" />
                      <EditField label="Premium" value={p.premium} field="premium" type="number" />
                      {_isCommAcct && <EditField label="Agency Fee" value={p.agencyFee || 0} field="agencyFee" type="number" />}
                      <EditField label="Payment Plan" value={p.paymentPlan} field="paymentPlan" options={["Annual","Semi-Annual","Quarterly","Monthly","EFT"]} />
                      {isAuto && <EditField label="Vehicles (Items)" value={p.vehicleCount || 1} field="vehicleCount" type="number" />}
                      {_isCommAcct && <EditField label="Broker" value={p.broker || ""} field="broker" options={["", ...(config.brokers || []), ...(p.broker && !(config.brokers || []).includes(p.broker) ? [p.broker] : [])]} />}
                      {_isCommAcct && <EditField label="Commission %" value={p.commissionPct != null ? p.commissionPct : 10} field="commissionPct" type="number" />}
                    </div>
                  </div>

                  {/* Right: Coverage Details */}
                  <div style={S.card}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, letterSpacing: "0.5px" }}>COVERAGE DETAILS</div>
                    {isAuto && (
                      <div style={S.grid(2)}>
                        <EditField label="BI Limits" value={p.biLimits} field="biLimits" />
                        <EditField label="PD Limits" value={p.pdLimits} field="pdLimits" />
                        <EditField label="UM/UIM" value={p.umLimits} field="umLimits" />
                        <EditField label="Comp Deductible" value={p.compDeductible} field="compDeductible" />
                        <EditField label="Collision Deductible" value={p.collDeductible} field="collDeductible" />
                        <EditField label="PIP" value={p.pip} field="pip" />
                      </div>
                    )}
                    {isHome && (
                      <div style={S.grid(2)}>
                        <EditField label="Dwelling" value={p.dwellingLimit} field="dwellingLimit" />
                        <EditField label="Other Structures" value={p.otherStructures} field="otherStructures" />
                        <EditField label="Personal Property" value={p.personalProperty} field="personalProperty" />
                        <EditField label="Loss of Use" value={p.lossOfUse} field="lossOfUse" />
                        <EditField label="Liability" value={p.liabilityLimit} field="liabilityLimit" />
                        <EditField label="AOP Deductible" value={p.aopDeductible} field="aopDeductible" />
                        <EditField label="Hurricane Deductible" value={p.hurricaneDeductible} field="hurricaneDeductible" />
                        <EditField label="Flood Zone" value={p.floodZone} field="floodZone" />
                      </div>
                    )}
                    {!isAuto && !isHome && (
                      <div style={S.grid(2)}>
                        <EditField label="Coverage Limit" value={p.coverageLimit} field="coverageLimit" />
                        <EditField label="Deductible" value={p.deductible} field="deductible" />
                        <EditField label="Liability Limit" value={p.liabilityLimit} field="liabilityLimit" />
                        <EditField label="Additional Info" value={p.additionalInfo} field="additionalInfo" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes below */}
                <div style={{ ...S.card, marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>NOTES</div>
                  <textarea
                    style={{ ...S.input, minHeight: 80, resize: "vertical", fontSize: 13 }}
                    value={p.notes || ""}
                    placeholder="Underwriting details, coverage specifics, client preferences..."
                    onChange={e => updatePolicy(p.id, { notes: e.target.value })}
                  />
                </div>
              </div>
              );
            })()}

            {/* Documents Tab */}
            {detailTab === "documents" && (
              <div style={S.card}>
                <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>DOCUMENTS ON FILE — {p.lob}</div>
                <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>{docsComplete} of {docTypes.length} documents on file</div>
                <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ height: "100%", width: `${(docsComplete / docTypes.length) * 100}%`, background: docsComplete === docTypes.length ? COLORS.success : COLORS.warning, borderRadius: 2 }} />
                </div>
                {docTypes.map(docName => {
                  const hasDoc = docs[docName];
                  return (
                    <div
                      key={docName}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: 6, marginBottom: 4, cursor: "pointer",
                        background: hasDoc ? `${COLORS.success}08` : `${COLORS.border}30`,
                        border: `1px solid ${hasDoc ? COLORS.success + "30" : COLORS.border}`,
                      }}
                      onClick={() => toggleDoc(p.id, docName)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                          background: hasDoc ? COLORS.success : "transparent", border: hasDoc ? "none" : `2px solid ${COLORS.textMuted}`,
                          fontSize: 12, color: "white", fontWeight: 700,
                        }}>{hasDoc ? "✓" : ""}</div>
                        <span style={{ fontSize: 13, fontWeight: hasDoc ? 400 : 500, color: hasDoc ? COLORS.text : COLORS.textDim }}>{docName}</span>
                      </div>
                      <span style={{ fontSize: 11, color: hasDoc ? COLORS.success : COLORS.textMuted }}>{hasDoc ? "On file" : "Missing"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Service Items Tab */}
            {detailTab === "service" && (() => {
              const acct = data.accounts.find(a => a.id === p.accountId) || {};
              const addSI = () => {
                if (!polSIForm.type) return;
                const newSI = {
                  id: uid(), type: polSIForm.type, accountId: p.accountId, accountName: acct.name || "",
                  policyId: p.id, policyNumber: p.policyNumber || "", carrier: p.carrier || "", lob: p.lob || "",
                  description: polSIForm.description || `${p.carrier} ${p.lob || ""} ${polSIForm.type}`.trim(),
                  dueDate: polSIForm.dueDate || p.expirationDate || todayStr,
                  amountDue: Number(polSIForm.amountDue) || 0, status: polSIForm.status || "Uncontacted",
                  urgency: "Medium", assignedTo: config.agentName || "Agent", created: todayStr,
                  lastAction: "", lastActionDate: "", followUpDate: "", notes: "",
                  ballInCourt: false, flags: [], contactAttempts: []
                };
                let updated = { ...data, serviceItems: [...data.serviceItems, newSI] };
                updated = addActivity(updated, p.accountId, "task_created", `Service item created: ${newSI.type}`, newSI.description);
                setData(updated, { undo: true, message: `Added: ${newSI.type}` });
                setPolAddSI(false);
                setPolSIForm({ type: "Ivantage Renewal", description: "", dueDate: "", amountDue: "", status: "Uncontacted" });
              };
              const updateSI = (siId, changes) => {
                const updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === siId ? { ...s, ...changes } : s) };
                setData(updated);
              };
              const deleteSI = (siId) => {
                if (!confirm("Delete this service item?")) return;
                const si = data.serviceItems.find(s => s.id === siId);
                let updated = { ...data, serviceItems: data.serviceItems.filter(s => s.id !== siId) };
                if (si) updated = addActivity(updated, si.accountId, "status_change", `Service item deleted: ${si.type}`, si.description || "");
                setData(updated, { undo: true, message: "Deleted service item" });
              };
              const iS = { ...S.input, padding: "4px 8px", fontSize: 12 };
              return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textDim }}>{linkedServices.filter(s => s.status !== "Done").length} active / {linkedServices.length} total</span>
                  <button style={{ ...S.btn(), padding: "4px 14px", fontSize: 11 }} onClick={() => setPolAddSI(!polAddSI)}>{polAddSI ? "Cancel" : "+ Add"}</button>
                </div>

                {polAddSI && (
                  <div style={{ ...S.card, marginBottom: 12, borderLeft: `3px solid ${COLORS.accent}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>TYPE</div>
                        <select style={iS} value={polSIForm.type} onChange={e => setPolSIForm({ ...polSIForm, type: e.target.value })}>
                          {(config.transactionTypes || SERVICE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>STATUS</div>
                        <select style={iS} value={polSIForm.status} onChange={e => setPolSIForm({ ...polSIForm, status: e.target.value })}>
                          {SERVICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>DESCRIPTION</div>
                      <input style={iS} value={polSIForm.description} onChange={e => setPolSIForm({ ...polSIForm, description: e.target.value })} placeholder={`${p.carrier} ${p.lob || ""} service item...`} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>DUE DATE</div>
                        <input type="date" style={iS} value={polSIForm.dueDate} onChange={e => setPolSIForm({ ...polSIForm, dueDate: e.target.value })} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>AMOUNT DUE</div>
                        <input type="number" min="0" style={iS} value={polSIForm.amountDue} onChange={e => setPolSIForm({ ...polSIForm, amountDue: e.target.value })} placeholder="0" />
                      </div>
                    </div>
                    <button style={{ ...S.btn(), padding: "5px 18px", fontSize: 12 }} onClick={addSI}>Create Service Item</button>
                  </div>
                )}

                {linkedServices.length > 0 ? linkedServices.map(si => {
                  const txnColor = TXN_COLORS[si.type] || COLORS.textDim;
                  const isCompleted = si.status === "Done";
                  const isEditing = polEditSI === si.id;
                  return (
                    <div key={si.id} style={{ ...S.card, marginBottom: 8, borderLeft: `3px solid ${txnColor}`, opacity: isCompleted ? 0.5 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, textDecoration: isCompleted ? "line-through" : "none" }}>{si.description}</div>
                          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${txnColor}25`, color: txnColor }}>{si.type}</span>
                            <span>Due {fmtShort(si.dueDate)}</span>
                            {si.amountDue > 0 && <span>· ${Number(si.amountDue).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <select value={si.status} onChange={e => {
                              const newVal = e.target.value;
                              if (newVal === "Renewed") { setRenewalPopupSI(si); return; }
                              let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, status: newVal, lastActionDate: newVal === "Done" ? todayStr : s.lastActionDate } : s) };
                              updated = addActivity(updated, si.accountId, "status_change", `Service item status → ${newVal}`, si.description);
                              if (newVal === "Done") updated = safeActivateRenewalPolicy(updated, si);
                              setData(updated);
                            }}
                            style={{ ...statusBadgeStyle(si.status), padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", appearance: "auto" }}>
                            {getServiceStatuses(si).map(sv => <option key={sv} value={sv}>{sv}</option>)}
                          </select>
                          <span style={{ cursor: "pointer", fontSize: 11, color: COLORS.textDim }} onClick={() => setPolEditSI(isEditing ? null : si.id)}>{isEditing ? "▲" : "✎"}</span>
                        </div>
                      </div>

                      {si.lastAction && !isEditing && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6 }}>Last: {si.lastAction} <span style={{ color: COLORS.textMuted }}>({fmtShort(si.lastActionDate)})</span></div>}
                      {si.nextStep && !isEditing && <div style={{ fontSize: 12, color: COLORS.text, marginTop: 4 }}>Next: {si.nextStep}</div>}

                      {isEditing && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.border}20` }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>TYPE</div>
                              <select style={iS} value={si.type} onChange={e => updateSI(si.id, { type: e.target.value })}>
                                {(config.transactionTypes || SERVICE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>DUE DATE</div>
                              <input type="date" style={iS} value={si.dueDate || ""} onChange={e => updateSI(si.id, { dueDate: e.target.value })} />
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>AMOUNT DUE</div>
                              <input type="number" min="0" style={iS} value={si.amountDue || ""} onChange={e => updateSI(si.id, { amountDue: Number(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>URGENCY</div>
                              <select style={iS} value={si.urgency || "Medium"} onChange={e => updateSI(si.id, { urgency: e.target.value })}>
                                {["Low","Medium","High","Critical"].map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>DESCRIPTION</div>
                            <input style={iS} value={si.description || ""} onChange={e => updateSI(si.id, { description: e.target.value })} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>LAST ACTION</div>
                              <input style={iS} value={si.lastAction || ""} onChange={e => updateSI(si.id, { lastAction: e.target.value, lastActionDate: todayStr })} placeholder="What was done..." />
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>NEXT STEP</div>
                              <input style={iS} value={si.nextStep || ""} onChange={e => updateSI(si.id, { nextStep: e.target.value })} placeholder="What needs to happen..." />
                            </div>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>NOTES</div>
                            <textarea style={{ ...iS, minHeight: 48, resize: "vertical" }} value={si.notes || ""} onChange={e => updateSI(si.id, { notes: e.target.value })} placeholder="Notes..." />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button style={{ ...S.btn("ghost"), fontSize: 10, padding: "3px 10px", color: COLORS.danger }} onClick={() => deleteSI(si.id)}>Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }) : !polAddSI && <div style={S.emptyState}>No service items linked to this policy</div>}
              </div>
              );
            })()}

            {/* Notes Tab */}
            {detailTab === "notes" && (
              <div style={S.card}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textDim, marginBottom: 8 }}>POLICY NOTES</div>
                <textarea
                  style={{ ...S.input, fontSize: 13, minHeight: 200, resize: "vertical", lineHeight: 1.6, padding: "10px 12px" }}
                  placeholder="Add notes about this policy — coverage details, special conditions, client preferences, renewal strategy..."
                  value={p.notes || ""}
                  onChange={e => updatePolicy(p.id, { notes: e.target.value })}
                />
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>Notes auto-save as you type</div>
              </div>
            )}

            {/* Activity Tab */}
            {detailTab === "activity" && (
              <div style={S.card}>
                {linkedActivities.length > 0 ? linkedActivities.map(a => (
                  <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08` }}>
                    <div style={{ fontSize: 12 }}>{a.description}</div>
                    {a.detail && <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.detail}</div>}
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{fmt(a.createdAt)}</div>
                  </div>
                )) : <div style={S.emptyState}>No activity for this account</div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Add Policy Modal */}
      {showAdd && (
        <Modal title="New Policy" onClose={() => setShowAdd(false)}>
          <div style={S.grid(2)}>
            <FormField label="Account">
              <select style={S.input} value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Select account...</option>
                {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="Policy Number"><input style={S.input} value={form.policyNumber} onChange={e => setForm({ ...form, policyNumber: e.target.value })} placeholder="e.g. 123456789" /></FormField>
            <FormField label="Named Insured"><input style={S.input} value={form.namedInsured || ""} onChange={e => setForm({ ...form, namedInsured: e.target.value })} placeholder="If different from account" /></FormField>
          </div>
          <div style={S.grid(3)}>
            <FormField label="Carrier *">
              <select style={S.input} value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })}>
                <option value="">Select carrier...</option>
                {carrierList.map(c => <option key={c} value={c}>{c}</option>)}
                {!carrierList.includes(form.carrier) && form.carrier && <option value={form.carrier}>{form.carrier}</option>}
              </select>
            </FormField>
            <FormField label="LOB">
              <select style={S.input} value={form.lob} onChange={e => {
                const lob = e.target.value;
                const exp = form.effectiveDate ? calcExpiration(form.effectiveDate, lob) : form.expirationDate;
                setForm({ ...form, lob, expirationDate: exp });
              }}>
                {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="Premium"><input style={S.input} type="number" min="0" value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })} placeholder="0" /></FormField>
          </div>
          <div style={S.grid(3)}>
            <FormField label="Effective"><input style={S.input} type="date" value={form.effectiveDate} onChange={e => {
              const eff = e.target.value;
              const exp = calcExpiration(eff, form.lob);
              setForm({ ...form, effectiveDate: eff, expirationDate: exp });
            }} /></FormField>
            <FormField label="Expiration"><input style={S.input} type="date" value={form.expirationDate} onChange={e => setForm({ ...form, expirationDate: e.target.value })} /></FormField>
            <FormField label="Payment Plan">
              <select style={S.input} value={form.paymentPlan} onChange={e => setForm({ ...form, paymentPlan: e.target.value })}>
                {["Annual","Semi-Annual","Quarterly","Monthly","EFT"].map(pp => <option key={pp} value={pp}>{pp}</option>)}
              </select>
            </FormField>
          </div>
          {(form.lob === "Auto" || form.lob === "Commercial Auto") && (
            <FormField label="# of Vehicles (Items)">
              <input style={S.input} type="number" min="1" value={form.vehicleCount} onChange={e => setForm({ ...form, vehicleCount: e.target.value })} />
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Each vehicle = 1 Allstate quota item</div>
            </FormField>
          )}
          {(() => { const _addAcct = data.accounts.find(a => a.id === form.accountId); return _addAcct && _addAcct.type === "Commercial" ? (
            <div style={S.grid(3)}>
              <FormField label="Agency Fee"><input style={S.input} type="number" min="0" value={form.agencyFee || ""} onChange={e => setForm({ ...form, agencyFee: e.target.value })} placeholder="0" /></FormField>
              <FormField label="Broker"><select style={S.input} value={form.broker || ""} onChange={e => setForm({ ...form, broker: e.target.value })}><option value="">— None —</option>{(config.brokers || []).map(b => <option key={b} value={b}>{b}</option>)}</select></FormField>
              <FormField label="Commission %"><input style={S.input} type="number" min="0" max="100" step="0.5" value={form.commissionPct != null ? form.commissionPct : 10} onChange={e => setForm({ ...form, commissionPct: e.target.value })} /></FormField>
            </div>
          ) : null; })()}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={{ ...S.btn(), opacity: (form.accountId && form.carrier) ? 1 : 0.5 }} onClick={handleAdd} disabled={!form.accountId || !form.carrier}>Add Policy</button>
            <button style={S.btn("ghost")} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}
      {renewalPopupSI && <RenewalPopup si={renewalPopupSI} data={data} setData={setData} config={config} onClose={() => setRenewalPopupSI(null)} />}
      {cancellingPolicyId && <CancellationModal policyId={cancellingPolicyId} data={data} setData={setData} config={config} onClose={() => setCancellingPolicyId(null)} />}
    </div>
  );
}

// ==================== TASKS ====================
function Tasks({ data, setData, nav, config }) {
  const todayStr = today();
  const [filter, setFilter] = useState("active");
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", linkedType: "account", linkedId: "", dueDate: "", priority: "Medium", assignedTo: config.agentName || "Agent" });

  const filtered = data.tasks.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!(t.title || "").toLowerCase().includes(q) && !(t.linkedName || "").toLowerCase().includes(q)) return false;
    }
    if (filter === "active") return t.status !== "Completed" && t.status !== "Cancelled";
    if (filter === "completed") return t.status === "Completed";
    if (filter === "overdue") return t.dueDate < todayStr && t.status !== "Completed" && t.status !== "Cancelled";
    return true;
  }).sort((a, b) => (a.dueDate || "z").localeCompare(b.dueDate || "z"));

  const handleAdd = () => {
    let linkedName = "";
    if (form.linkedType === "account") {
      const a = data.accounts.find(x => x.id === form.linkedId);
      linkedName = a ? a.name : "";
    } else if (form.linkedType === "prospect") {
      const p = data.prospects.find(x => x.id === form.linkedId);
      linkedName = p ? `${p.firstName} ${p.lastName}` : "";
    }
    const newTask = { ...form, id: uid(), linkedName, status: "Open", created: todayStr };
    let updated = { ...data, tasks: [...data.tasks, newTask] };
    if (form.linkedType === "account" && form.linkedId) {
      updated = addActivity(updated, form.linkedId, "task_created", "Task created", form.title);
    }
    setData(updated);
    setShowAdd(false);
    setForm({ title: "", linkedType: "account", linkedId: "", dueDate: "", priority: "Medium", assignedTo: config.agentName || "Agent" });
  };

  const toggleComplete = (id) => {
    const t = data.tasks.find(x => x.id === id);
    const newStatus = t && t.status === "Completed" ? "Open" : "Completed";
    let updated = { ...data, tasks: data.tasks.map(x => x.id === id ? { ...x, status: newStatus } : x) };
    if (t && t.linkedType === "account" && t.linkedId) {
      updated = addActivity(updated, t.linkedId, newStatus === "Completed" ? "task_completed" : "task_reopened", `Task ${newStatus === "Completed" ? "completed" : "reopened"}`, t.title);
    }
    setData(updated);
  };

  const linkOptions = form.linkedType === "account" ? data.accounts.map(a => ({ id: a.id, label: a.name })) : data.prospects.map(p => ({ id: p.id, label: `${p.firstName} ${p.lastName}` }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Tasks</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, maxWidth: 250 }} placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn()} onClick={() => setShowAdd(true)}>+ New Task</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all","active","overdue","completed"].map(f => (
          <span key={f} style={S.pill(filter === f)} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "overdue" && <span style={{ marginLeft: 4, color: COLORS.danger }}>({data.tasks.filter(t => t.dueDate < todayStr && t.status !== "Completed" && t.status !== "Cancelled").length})</span>}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(t => (
          <div key={t.id} style={{ ...S.card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, opacity: t.status === "Completed" ? 0.5 : 1 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${t.status === "Completed" ? COLORS.success : COLORS.border}`, background: t.status === "Completed" ? `${COLORS.success}30` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: COLORS.success, flexShrink: 0 }} onClick={() => toggleComplete(t.id)}>
              {t.status === "Completed" && "✓"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, textDecoration: t.status === "Completed" ? "line-through" : "none" }}>{t.title}</div>
              <div style={{ fontSize: 11, color: COLORS.textDim }}>{t.linkedType === "account" ? <AccountLink accountId={t.linkedId} name={t.linkedName} nav={nav} /> : (t.linkedName || "No link")}</div>
            </div>
            <span style={S.badge(urgencyColor(t.priority))}>{t.priority}</span>
            <span style={{ fontSize: 12, color: t.dueDate < todayStr && t.status !== "Completed" ? COLORS.danger : COLORS.textDim, minWidth: 70, textAlign: "right" }}>{fmtShort(t.dueDate)}</span>
          </div>
        ))}
        {filtered.length === 0 && <div style={S.emptyState}>No tasks match this filter</div>}
      </div>

      {showAdd && (
        <Modal title="New Task" onClose={() => setShowAdd(false)}>
          <FormField label="Title"><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" /></FormField>
          <div style={S.grid(2)}>
            <FormField label="Link To">
              <select style={S.input} value={form.linkedType} onChange={e => setForm({ ...form, linkedType: e.target.value, linkedId: "" })}>
                <option value="account">Account</option><option value="prospect">Prospect</option>
              </select>
            </FormField>
            <FormField label={form.linkedType === "account" ? "Account" : "Prospect"}>
              <select style={S.input} value={form.linkedId} onChange={e => setForm({ ...form, linkedId: e.target.value })}>
                <option value="">Select...</option>
                {linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </FormField>
          </div>
          <div style={S.grid(2)}>
            <FormField label="Due Date"><input style={S.input} type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></FormField>
            <FormField label="Priority">
              <select style={S.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {["Low","Medium","High","Urgent"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button style={S.btn()} onClick={handleAdd}>Create Task</button>
            <button style={S.btn("ghost")} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ==================== OUTREACH HUB ====================

// Default outreach templates — stored in config.outreachTemplates, editable in Settings
const DEFAULT_OUTREACH_TEMPLATES = {
  renewal: {
    subject: "Your {lob} Policy Renewal — Action Needed",
    body: "Hi {firstName},\n\nThis is a reminder that your {lob} policy with {carrier} (#{policyNumber}) is coming up for renewal on {expirationDate}.\n\nYour current premium is ${premium}. I\'d like to review your coverage and shop for the best rate available before your renewal date.\n\nYou can manage your account or make a payment online here: {paymentLink}\n\nPlease give me a call at {agentPhone} or reply to this email and I\'ll get started right away.\n\nBest regards,\n{signature}"
  },
  payment: {
    subject: "Action Needed: Payment on Your {lob} Policy",
    body: "Hi {firstName},\n\nI\'m reaching out regarding a payment on your {lob} policy with {carrier} (#{policyNumber}).\n\n**Amount due: {amountDue}**\n**Due date: {dueDate}**\n\nTo keep your coverage active, we need to get this resolved as soon as possible. You can make a payment online here: {paymentLink}\n\nIf you have any questions or need help with payment options, please call me at {agentPhone}.\n\nBest regards,\n{signature}"
  },
  retention: {
    subject: "Let\'s Review Your {lob} Coverage Options",
    body: "Hi {firstName},\n\nI understand you\'re considering changes to your {lob} policy with {carrier} (#{policyNumber}).\n\nBefore making any decisions, I\'d love the chance to review your options. I can re-shop your coverage, look for discounts, or adjust your policy to better fit your needs — all at no cost to you.\n\nIf a payment concern is part of the issue, you can make a payment online here: {paymentLink}\n\nA gap in coverage can create serious risk, so let\'s make sure we find the right solution. Please call me at {agentPhone} or reply here.\n\nBest regards,\n{signature}"
  },
  overdue: {
    subject: "URGENT: Overdue Payment — Your {lob} Policy Has Lapsed",
    body: "Hi {firstName},\n\nI\'m reaching out regarding an overdue payment on your {lob} policy with {carrier} (#{policyNumber}).\n\nYour payment was originally due on {dueDate}, and because it was not received, your policy has lapsed. This means you currently do not have active coverage, which puts you at serious financial risk.\n\nThe good news is that your policy may still be eligible for reinstatement if payment is made as soon as possible. Please do not delay — the window for reinstatement is limited.\n\nYou can make your payment online here: {paymentLink}\n\nIf you are unable to pay online, please call me immediately at {agentPhone} so we can discuss your options and get your coverage restored.\n\nBest regards,\n{signature}"
  }
};

const TEMPLATE_VARIABLES = [
  { key: "{firstName}", desc: "Client first name" },
  { key: "{name}", desc: "Full account name" },
  { key: "{carrier}", desc: "Insurance carrier" },
  { key: "{lob}", desc: "Line of business" },
  { key: "{policyNumber}", desc: "Policy number" },
  { key: "{premium}", desc: "Annual premium" },
  { key: "{expirationDate}", desc: "Policy expiration date" },
  { key: "{dueDate}", desc: "Service item due date" },
  { key: "{amountDue}", desc: "Amount due" },
  { key: "{agentName}", desc: "Your name" },
  { key: "{agentPhone}", desc: "Your phone" },
  { key: "{agentEmail}", desc: "Your email" },
  { key: "{agencyName}", desc: "Agency name" },
  { key: "{signature}", desc: "Full signature block" },
];

// Default carrier payment portal URLs — editable in Settings
const DEFAULT_CARRIER_PORTALS = {
  "Allstate": "https://myaccountrwd.allstate.com/anon/billing/quick-pay",
  "Allstate Flood": "https://www.myallstateflood.com/PayMyBill/",
  "American Integrity": "https://myokta.myaii.com",
  "American Modern": "https://www.amig.com",
  "Cabrillo Coastal Insurance": "https://insured.cabgen.com/payments/",
  "Chubb": "https://na-quickpay.chubb.com/",
  "Citizens Property & Casualty Insurance Company": "https://www.citizensfla.com/payments",
  "Cypress Property & Casualty Insurance Company": "https://www.cypressig.com/makepayment/",
  "Edison": "https://portal.edisoninsurance.com/login",
  "Florida Peninsula": "https://portal.floridapeninsula.com/login",
  "Hagerty": "https://www.hagerty.com/pay",
  "Homeowners Choice": "https://hcpci.com/online-payment/",
  "Jewelers Mutual": "https://my.jewelersmutual.com/quickbillpay",
  "Manatee": "https://manatee-insurance.com/make-a-payment/",
  "Monarch National": "https://pay.monarchnational.com/",
  "NatGen": "https://www.nationalgeneral.com/pay-your-bill/",
  "Ovation": "https://portal.ovationhome.com/login",
  "RLI": "https://mypolicy.rlicorp.com/",
  "Security First": "https://www.securityfirstflorida.com/make-a-payment/",
  "Slide Insurance Company": "https://www.slideinsurance.com/payments",
  "Southern Oak Insurance Company": "https://soic.portal.mw.aggne.com/login",
  "Tower Hill Insurance Group": "https://customerportal.thig.com/",
  "Universal North America": "https://universalproperty.com/account/visitorpayment",
};

function getCarrierPortals(config) {
  return { ...DEFAULT_CARRIER_PORTALS, ...(config.carrierPortals || {}) };
}

function getOutreachTemplates(config) {
  return { ...DEFAULT_OUTREACH_TEMPLATES, ...(config.outreachTemplates || {}) };
}

function fillTemplate(str, vars) {
  if (!str) return "";
  let result = str;
  for (const [key, val] of Object.entries(vars)) {
    result = result.split(key).join(val || "");
  }
  return result;
}

// Detect which outreach template to use for a service item
function detectOutreachType(si) {
  const t = (si.type || "").toLowerCase();
  if (t.includes("overdue") || t.includes("lapsed") || t.includes("past due") || t.includes("past-due")) return "overdue";
  if (t.includes("renewal") || t.includes("rewrite")) return "renewal";
  if (t.includes("installment") || t.includes("payment") || t.includes("reinstate")) return "payment";
  if (t.includes("cancel") || t.includes("terminat") || t.includes("non-renew") || t.includes("non renew")) return "retention";
  return "renewal";
}

// Build a filled mailto object { to, subject, body, type } for a service item
function buildOutreachMailto(si, data, config) {
  const templates = getOutreachTemplates(config);
  const type = detectOutreachType(si);
  const tpl = templates[type] || templates.renewal;
  const acct = (data.accounts || []).find(a => a.id === si.accountId) || {};
  const pol = (data.policies || []).find(p => p.id === si.policyId) || {};
  const primaryContact = (acct.contacts || [])[0];
  const firstName = primaryContact?.name?.split(" ")[0] || acct.name?.split(" ")[0] || "there";
  const sign = [config.agentName, config.agencyName, config.agentPhone].filter(Boolean).join("\n");
  const strip = (text) => text ? text.replace(/\*\*([^*]+)\*\*/g, "$1") : "";
  const vars = {
    "{firstName}": firstName, "{name}": acct.name || "",
    "{carrier}": pol.carrier || si.carrier || "", "{lob}": pol.lob || si.lob || "",
    "{policyNumber}": pol.policyNumber || si.policyNumber || "",
    "{premium}": (pol.premium || 0).toLocaleString(),
    "{expirationDate}": pol.expirationDate ? new Date(pol.expirationDate + "T00:00:00").toLocaleDateString() : "",
    "{dueDate}": si.dueDate ? new Date(si.dueDate + "T00:00:00").toLocaleDateString() : "",
    "{amountDue}": si.amountDue ? "$" + Number(si.amountDue).toLocaleString() : "",
    "{agentName}": config.agentName || "", "{agentPhone}": config.agentPhone || "",
    "{agentEmail}": config.agentEmail || "", "{agencyName}": config.agencyName || "",
    "{signature}": sign,
    "{paymentLink}": getCarrierPortals(config)[pol.carrier || si.carrier || ""] || "",
  };
  return { to: acct.email || (acct.contacts || []).find(c => c.email)?.email || "", subject: strip(fillTemplate(tpl.subject, vars)), body: strip(fillTemplate(tpl.body, vars)), type };
}

// Open a mailto URL directly in the default email client
function copyMailtoToClipboard(si, data, config, onCopied) {
  const { to, subject, body } = buildOutreachMailto(si, data, config);
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank");
  if (onCopied) onCopied();
}

function OutreachHub({ data, setData, nav, config, onConfigChange }) {
  const [editDraft, setEditDraft] = useState(null);
  const [draftEdits, setDraftEdits] = useState({});
  const [copied, setCopied] = useState(null);
  const [filter, setFilter] = useState("all");
  const [editingTemplates, setEditingTemplates] = useState(false);
  const [tplEdits, setTplEdits] = useState({});
  const [dismissed, setDismissed] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("outreach_dismissed") || "[]")); } catch { return new Set(); } });
  const todayStr = today();

  const templates = getOutreachTemplates(config);

  const dismiss = (id) => {
    const next = new Set(dismissed); next.add(id); setDismissed(next);
    try { localStorage.setItem("outreach_dismissed", JSON.stringify([...next])); } catch {}
  };
  const clearDismissed = () => { setDismissed(new Set()); try { localStorage.removeItem("outreach_dismissed"); } catch {} };

  // Build variable map for a trigger
  const buildVars = (trigger) => {
    const acct = trigger.account || {};
    const pol = trigger.policy || {};
    const si = trigger.serviceItem || {};
    const primaryContact = (acct.contacts || [])[0];
    const firstName = primaryContact?.name?.split(" ")[0] || acct.name?.split(" ")[0] || "there";
    const sign = [config.agentName, config.agencyName, config.agentPhone].filter(Boolean).join("\n");
    return {
      "{firstName}": firstName,
      "{name}": acct.name || "",
      "{carrier}": pol.carrier || si.carrier || "",
      "{lob}": pol.lob || si.lob || "",
      "{policyNumber}": pol.policyNumber || si.policyNumber || "",
      "{premium}": (pol.premium || 0).toLocaleString(),
      "{expirationDate}": fmt(pol.expirationDate),
      "{dueDate}": fmt(si.dueDate),
      "{amountDue}": si.amountDue ? "$" + Number(si.amountDue).toLocaleString() : "",
      "{agentName}": config.agentName || "",
      "{agentPhone}": config.agentPhone || "",
      "{agentEmail}": config.agentEmail || "",
      "{agencyName}": config.agencyName || "",
      "{signature}": sign,
      "{paymentLink}": getCarrierPortals(config)[pol.carrier || si.carrier || ""] || "",
    };
  };

  // Render **bold** markdown in template text
  const renderBold = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Strip **bold** markers for plain text copy
  const stripBold = (text) => text ? text.replace(/\*\*([^*]+)\*\*/g, "$1") : "";

  // ---- TRIGGER DETECTION (same as before) ----

  // 1. Renewal Reminders
  const renewalTriggers = useMemo(() => {
    const triggers = [];
    (data.policies || []).forEach(p => {
      if (p.status !== "Active" || !p.expirationDate) return;
      const daysOut = daysBetween(todayStr, p.expirationDate);
      if (daysOut < 0 || daysOut > 60) return;
      const account = (data.accounts || []).find(a => a.id === p.accountId);
      if (!account) return;
      // Skip if renewal service item is already Done or on Auto Pay for this policy
      const renewalHandled = (data.serviceItems || []).some(si => si.policyId === p.id && si.type && si.type.toLowerCase().includes("renewal") && (si.status === "Done" || si.status === "Completed" || si.status === "Resolved" || si.status === "Auto Pay" || (si.flags || []).includes("Auto Pay")));
      if (renewalHandled) return;
      // Skip if a newer term already exists (Active or Pending Renewal)
      const hasNewerTerm = (data.policies || []).some(other =>
        other.id !== p.id && other.accountId === p.accountId &&
        (other.carrier || "").toLowerCase() === (p.carrier || "").toLowerCase() &&
        (other.lob || "").toLowerCase() === (p.lob || "").toLowerCase() &&
        (other.status === "Active" || other.status === "Pending Renewal") &&
        other.effectiveDate > p.effectiveDate
      );
      if (hasNewerTerm) return;
      const relatedSIs = (data.serviceItems || []).filter(si => si.accountId === p.accountId && si.policyId === p.id);
      const recentContact = relatedSIs.some(si => si.lastActionDate && daysBetween(si.lastActionDate, todayStr) <= 14);
      if (recentContact) return;
      const urgency = daysOut <= 15 ? "critical" : daysOut <= 30 ? "high" : "medium";
      triggers.push({
        id: `renewal_${p.id}`, type: "renewal", urgency, daysOut,
        account, policy: p, label: `${account.name} \u2014 ${p.carrier} ${p.lob}`,
        detail: `Expires ${fmt(p.expirationDate)} (${daysOut}d) \u00b7 $${(p.premium || 0).toLocaleString()} premium`,
      });
    });
    return triggers.sort((a, b) => a.daysOut - b.daysOut);
  }, [data, todayStr]);

  // 2. Payment Follow-Ups
  const paymentTriggers = useMemo(() => {
    const triggers = [];
    (data.serviceItems || []).forEach(si => {
      if (si.type !== "Ivantage Installment" || si.status === "Done" || si.status === "Completed" || si.status === "Resolved" || si.status === "Auto Pay") return;
      if ((si.flags || []).includes("Auto Pay")) return;
      if (!si.dueDate) return;
      const daysOut = daysBetween(todayStr, si.dueDate);
      if (daysOut > 7) return;
      const account = (data.accounts || []).find(a => a.id === si.accountId);
      if (!account) return;
      const pol = (data.policies || []).find(p => p.id === si.policyId) || {};
      const urgency = daysOut < 0 ? "critical" : daysOut <= 3 ? "high" : "medium";
      triggers.push({
        id: `payment_${si.id}`, type: "payment", urgency, daysOut,
        account, policy: pol, serviceItem: si,
        label: `${account.name} \u2014 ${pol.carrier || si.carrier || ""} ${pol.lob || ""}`,
        detail: `${daysOut < 0 ? Math.abs(daysOut) + "d overdue" : "Due in " + daysOut + "d"} \u00b7 ${si.amountDue ? "$" + Number(si.amountDue).toLocaleString() + " due" : ""}`,
      });
    });
    return triggers.sort((a, b) => a.daysOut - b.daysOut);
  }, [data, todayStr]);

  // 3. Cancellation/Retention
  const retentionTriggers = useMemo(() => {
    const triggers = [];
    const seen = new Set();
    (data.policies || []).forEach(p => {
      if (p.status !== "Requested Cancel") return;
      const account = (data.accounts || []).find(a => a.id === p.accountId);
      if (!account) return;
      seen.add(p.accountId + "_" + p.id);
      triggers.push({
        id: `retention_pol_${p.id}`, type: "retention", urgency: "critical",
        account, policy: p, label: `${account.name} \u2014 ${p.carrier} ${p.lob}`,
        detail: `Requested Cancel \u00b7 $${(p.premium || 0).toLocaleString()} premium at risk`,
      });
    });
    (data.serviceItems || []).forEach(si => {
      if (si.status === "Done" || si.status === "Completed" || si.status === "Resolved") return;
      if (si.type !== "Allstate Termination" && si.type !== "Allstate Cancel") return;
      const account = (data.accounts || []).find(a => a.id === si.accountId);
      if (!account) return;
      const pol = (data.policies || []).find(p => p.id === si.policyId) || {};
      const key = si.accountId + "_" + (si.policyId || si.id);
      if (seen.has(key)) return;
      triggers.push({
        id: `retention_si_${si.id}`, type: "retention", urgency: "high",
        account, policy: pol, serviceItem: si,
        label: `${account.name} \u2014 ${pol.carrier || si.carrier || "Allstate"} ${pol.lob || ""}`,
        detail: `${si.type} \u00b7 ${si.description || ""}`,
      });
    });
    return triggers;
  }, [data, todayStr]);

  const allTriggers = [...renewalTriggers, ...paymentTriggers, ...retentionTriggers].filter(t => !dismissed.has(t.id));
  const filtered = filter === "all" ? allTriggers : allTriggers.filter(t => t.type === filter);

  // ---- TEMPLATE FILL ----
  const getDraft = (trigger) => {
    if (draftEdits[trigger.id]) return draftEdits[trigger.id];
    const tpl = templates[trigger.type] || DEFAULT_OUTREACH_TEMPLATES[trigger.type];
    const vars = buildVars(trigger);
    return { subject: fillTemplate(tpl.subject, vars), body: fillTemplate(tpl.body, vars) };
  };

  const copyDraft = (triggerId) => {
    const trigger = filtered.find(t => t.id === triggerId) || { id: triggerId };
    const d = draftEdits[triggerId] || getDraft(trigger);
    const email = trigger.account?.email || "";
    const text = `${email}\n${stripBold(d.subject)}\n\n${stripBold(d.body)}`;
    // Textarea fallback — navigator.clipboard doesn't work in iframe
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); setCopied(triggerId); setTimeout(() => setCopied(null), 2000); } catch {}
    document.body.removeChild(ta);
  };

  // ---- TEMPLATE EDITING ----
  const startEditTemplates = () => {
    setTplEdits({ renewal: { ...templates.renewal }, payment: { ...templates.payment }, retention: { ...templates.retention } });
    setEditingTemplates(true);
  };
  const saveTemplates = () => {
    const cfg = loadConfig();
    cfg.outreachTemplates = tplEdits;
    saveConfig(cfg);
    if (onConfigChange) onConfigChange(cfg);
    setEditingTemplates(false);
  };

  const urgencyBadge = (u) => {
    const colors = { critical: { bg: "#ef444420", color: "#ef4444" }, high: { bg: "#f59e0b20", color: "#f59e0b" }, medium: { bg: "#3b82f620", color: "#3b82f6" } };
    const c = colors[u] || colors.medium;
    return <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: c.bg, color: c.color, fontWeight: 700, textTransform: "uppercase" }}>{u}</span>;
  };
  const typeBadge = (t) => {
    const labels = { renewal: { text: "Renewal", bg: "#4ade8020", color: "#4ade80" }, payment: { text: "Payment", bg: "#f59e0b20", color: "#f59e0b" }, retention: { text: "Retention", bg: "#ef444420", color: "#ef4444" } };
    const c = labels[t] || labels.renewal;
    return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: c.bg, color: c.color, fontWeight: 700 }}>{c.text}</span>;
  };

  // ---- TEMPLATE EDITOR MODAL ----
  if (editingTemplates) {
    const typeLabels = { renewal: "Renewal Reminder", payment: "Payment Follow-Up", retention: "Retention / Cancellation Save" };
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={S.pageTitle}>\u2709 Edit Outreach Templates</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn("ghost")} onClick={() => setEditingTemplates(false)}>Cancel</button>
            <button style={S.btn()} onClick={saveTemplates}>Save Templates</button>
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: 16, padding: 14, background: `${COLORS.accent}08` }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Available Variables</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEMPLATE_VARIABLES.map(v => (
              <span key={v.key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${COLORS.accent}15`, color: COLORS.accentLight, fontFamily: "monospace", cursor: "help" }} title={v.desc}>{v.key}</span>
            ))}
          </div>
        </div>
        {["renewal", "payment", "retention"].map(type => (
          <div key={type} style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: type === "renewal" ? "#4ade80" : type === "payment" ? "#f59e0b" : "#ef4444" }}>{typeLabels[type]}</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Subject Line</label>
              <input style={{ ...S.input, fontSize: 13 }} value={tplEdits[type]?.subject || ""} onChange={e => setTplEdits(prev => ({ ...prev, [type]: { ...prev[type], subject: e.target.value } }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Email Body</label>
              <textarea style={{ ...S.input, fontSize: 12, lineHeight: 1.6, minHeight: 180, resize: "vertical", fontFamily: "inherit" }} value={tplEdits[type]?.body || ""} onChange={e => setTplEdits(prev => ({ ...prev, [type]: { ...prev[type], body: e.target.value } }))} />
            </div>
            <button style={{ ...S.btn("ghost"), fontSize: 11, marginTop: 8, color: COLORS.textMuted }} onClick={() => setTplEdits(prev => ({ ...prev, [type]: { ...DEFAULT_OUTREACH_TEMPLATES[type] } }))}>Reset to Default</button>
          </div>
        ))}
      </div>
    );
  }

  // ---- MAIN VIEW ----
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>\u2709 Outreach Hub</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dismissed.size > 0 && <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={clearDismissed}>Show {dismissed.size} dismissed</button>}
          <button style={{ ...S.btn("ghost"), fontSize: 12 }} onClick={startEditTemplates}>\u270e Edit Templates</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {[
          { key: "all", label: "Total Pending", count: allTriggers.length, color: COLORS.accent },
          { key: "renewal", label: "Renewal Reminders", count: renewalTriggers.filter(t => !dismissed.has(t.id)).length, color: "#4ade80" },
          { key: "payment", label: "Payment Follow-Ups", count: paymentTriggers.filter(t => !dismissed.has(t.id)).length, color: "#f59e0b" },
          { key: "retention", label: "Retention Saves", count: retentionTriggers.filter(t => !dismissed.has(t.id)).length, color: "#ef4444" },
        ].map(card => (
          <div key={card.key} style={{ ...S.statCard, cursor: "pointer", borderColor: filter === card.key ? card.color : COLORS.border, borderWidth: filter === card.key ? 2 : 1 }} onClick={() => setFilter(card.key)}>
            <div style={{ ...S.statVal, color: card.color }}>{card.count}</div>
            <div style={S.statLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Outreach items */}
      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", padding: 40, color: COLORS.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>\u2713</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No outreach needed right now</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>All clients are up to date on renewals, payments, and retention.</div>
          </div>
        )}
        {filtered.map(trigger => {
          const draft = getDraft(trigger);
          const isEditing = editDraft === trigger.id;
          return (
            <div key={trigger.id} style={{ ...S.card, marginBottom: 12, borderLeft: `3px solid ${trigger.type === "renewal" ? "#4ade80" : trigger.type === "payment" ? "#f59e0b" : "#ef4444"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {typeBadge(trigger.type)}
                    {urgencyBadge(trigger.urgency)}
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      <AccountLink accountId={trigger.account?.id} name={trigger.label} nav={nav} />
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 2 }}>{trigger.detail}</div>
                  {trigger.account?.email && <div style={{ fontSize: 11, color: COLORS.textMuted }}>\u2709 {trigger.account.email}</div>}
                  {!trigger.account?.email && (trigger.account?.contacts || []).some(c => c.email) && (
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>\u2709 {trigger.account.contacts.find(c => c.email)?.email}</div>
                  )}
                </div>
                <button style={{ ...S.btn("ghost"), fontSize: 16, padding: "4px 8px", color: COLORS.textMuted }} title="Dismiss" onClick={() => dismiss(trigger.id)}>\u2715</button>
              </div>

              {/* Draft preview */}
              <div style={{ marginTop: 12, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>Subject</div>
                  {isEditing ? (
                    <input style={{ ...S.input, fontSize: 13, fontWeight: 600 }} value={(draftEdits[trigger.id] || draft).subject}
                      onChange={e => setDraftEdits(prev => ({ ...prev, [trigger.id]: { ...(prev[trigger.id] || draft), subject: e.target.value } }))} />
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{draft.subject}</div>
                  )}
                </div>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>Body</div>
                  {isEditing ? (
                    <textarea style={{ ...S.input, fontSize: 12, lineHeight: 1.6, minHeight: 180, resize: "vertical", fontFamily: "inherit" }} value={(draftEdits[trigger.id] || draft).body}
                      onChange={e => setDraftEdits(prev => ({ ...prev, [trigger.id]: { ...(prev[trigger.id] || draft), body: e.target.value } }))} />
                  ) : (
                    <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", color: COLORS.text }}>{renderBold(draft.body)}</div>
                  )}
                </div>
                <div style={{ padding: "8px 14px", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={{ ...S.btn(), fontSize: 11, padding: "5px 14px" }} onClick={() => copyDraft(trigger.id)}>
                    {copied === trigger.id ? "\u2713 Copied!" : "\ud83d\udccb Copy"}
                  </button>
                  <button style={{ ...S.btn(), fontSize: 11, padding: "5px 14px", background: COLORS.accentLight }} onClick={() => {
                    const d = draftEdits[trigger.id] || getDraft(trigger);
                    const to = trigger.account?.email || (trigger.account?.contacts || []).find(c => c.email)?.email || "";
                    const subject = encodeURIComponent(stripBold(d.subject));
                    const body = encodeURIComponent(stripBold(d.body));
                    const url = `mailto:${to}?subject=${subject}&body=${body}`;
                    window.open(url, "_blank");
                    setCopied("mailto_" + trigger.id); setTimeout(() => setCopied(null), 2000);
                  }}>
                    {copied === "mailto_" + trigger.id ? "\u2713 Opened!" : "✉ Open Email"}
                  </button>
                  <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={() => setEditDraft(isEditing ? null : trigger.id)}>
                    {isEditing ? "Done Editing" : "\u270e Edit This Draft"}
                  </button>
                  <button style={{ ...S.btn("ghost"), fontSize: 11 }} onClick={() => {
                    const si = trigger.serviceItem || (data.serviceItems || []).find(s => s.policyId === trigger.policy?.id && s.status !== "Done");
                    if (si) {
                      const newAttempt = { date: todayStr, method: "Email", notes: `Outreach: ${trigger.type} \u2014 ${draft.subject}` };
                      let updated = { ...data, serviceItems: data.serviceItems.map(s => s.id === si.id ? { ...s, contactAttempts: [newAttempt, ...(s.contactAttempts || [])], lastAction: `Email: ${trigger.type} outreach`, lastActionDate: todayStr } : s) };
                      updated = addActivity(updated, trigger.account.id, "contact_attempt", `Email outreach (${trigger.type})`, draft.subject, config);
                      setData(updated);
                    } else {
                      let updated = addActivity(data, trigger.account.id, "contact_attempt", `Email outreach (${trigger.type})`, draft.subject, config);
                      setData(updated);
                    }
                    dismiss(trigger.id);
                  }}>
                    \u2713 Mark Sent
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== CALENDAR VIEW ====================
function CalendarView({ data, nav, config }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [search, setSearch] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date());

  // Build events for each day
  const dayEvents = useMemo(() => {
    const map = {};
    const q = search.toLowerCase();
    const matchSearch = (name) => !search || (name || "").toLowerCase().includes(q);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const events = [];

      // Service items due
      data.serviceItems.filter(si => si.dueDate === dateStr && si.status !== "Done" && matchSearch(si.accountName)).forEach(si => {
        events.push({ type: "service", color: TXN_COLORS[si.type] || COLORS.info, label: `${si.accountName} — ${si.type}`, id: si.id, accountId: si.accountId, accountName: si.accountName });
      });

      // Policy expirations
      data.policies.filter(p => p.expirationDate === dateStr && p.status === "Active" && matchSearch(p.accountName)).forEach(p => {
        events.push({ type: "renewal", color: COLORS.warning, label: `${p.accountName} — ${p.carrier} ${p.lob} renewal`, id: p.id, accountId: p.accountId, accountName: p.accountName });
      });

      // Tasks due
      data.tasks.filter(t => t.dueDate === dateStr && t.status !== "Completed" && t.status !== "Cancelled" && matchSearch(t.linkedName)).forEach(t => {
        events.push({ type: "task", color: COLORS.info, label: t.title, id: t.id, accountId: t.linkedId, accountName: t.linkedName });
      });

      if (events.length > 0) map[d] = events;
    }
    return map;
  }, [data, year, month, daysInMonth, search]);

  const todayDay = new Date().getDate();
  const isCurrentMonth = new Date().getMonth() === month && new Date().getFullYear() === year;
  const selEvents = selectedDay ? (dayEvents[selectedDay] || []) : [];

  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Calendar</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input style={{ ...S.input, maxWidth: 200 }} placeholder="Filter by client..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn("ghost")} onClick={prevMonth}>←</button>
          <span style={{ fontSize: 16, fontWeight: 600, minWidth: 180, textAlign: "center" }}>{monthName}</span>
          <button style={S.btn("ghost")} onClick={nextMonth}>→</button>
          <button style={{ ...S.btn("ghost"), marginLeft: 8 }} onClick={goToday}>Today</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: COLORS.textDim }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.warning, marginRight: 4 }} />Renewals</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.info, marginRight: 4 }} />Tasks</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.danger, marginRight: 4 }} />Service Items</span>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Calendar Grid */}
        <div style={{ flex: 1 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 600, color: COLORS.textDim, background: COLORS.card, borderRadius: 4 }}>{d}</div>
            ))}
          </div>

          {/* Days */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: 80, background: `${COLORS.card}50`, borderRadius: 4 }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const events = dayEvents[day] || [];
              const isToday = isCurrentMonth && day === todayDay;
              const isSel = selectedDay === day;
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(isSel ? null : day)}
                  style={{
                    minHeight: 80, padding: 4, borderRadius: 4, cursor: "pointer",
                    background: isSel ? `${COLORS.accent}20` : COLORS.card,
                    border: isToday ? `2px solid ${COLORS.accent}` : isSel ? `1px solid ${COLORS.accent}60` : `1px solid transparent`,
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = COLORS.cardHover; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = COLORS.card; }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? COLORS.accent : COLORS.text, marginBottom: 2 }}>{day}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {events.slice(0, 3).map((ev, j) => (
                      <div key={j} style={{ height: 4, borderRadius: 2, background: ev.color }} title={ev.label} />
                    ))}
                    {events.length > 3 && <div style={{ fontSize: 9, color: COLORS.textMuted, textAlign: "center" }}>+{events.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Detail Panel */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={S.card}>
            <div style={S.sectionTitle}>
              <span>{selectedDay ? `${monthName.split(" ")[0]} ${selectedDay}` : "Select a day"}</span>
              {selEvents.length > 0 && <span style={{ fontSize: 12, color: COLORS.textDim }}>{selEvents.length} items</span>}
            </div>
            {selEvents.length > 0 ? selEvents.map((ev, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${COLORS.border}08`, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {ev.accountName && nav ? <AccountLink accountId={ev.accountId} name={ev.accountName} nav={nav} /> : ev.label}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>
                    <span style={S.badge(ev.type === "renewal" ? COLORS.warning : ev.type === "task" ? COLORS.info : COLORS.danger)}>{ev.type}</span>
                    <span style={{ marginLeft: 6 }}>{ev.label.split(" — ")[1] || ev.label}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div style={S.emptyState}>{selectedDay ? "Nothing scheduled" : "Click a day to see details"}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== PRODUCTION REPORT ====================
function ProductionReport({ data, config }) {
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const monthSales = data.salesLog.filter(s => {
    const d = new Date(s.date);
    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
  });

  const totalPremium = monthSales.reduce((s, e) => s + (e.premium || 0), 0);
  const avgPremium = monthSales.length > 0 ? Math.round(totalPremium / monthSales.length) : 0;
  const allstateAuto = monthSales.filter(s => s.carrier === "Allstate" && s.lob === "Auto" && s.saleType !== "Rewrite").reduce((sum, s) => sum + (s.itemCount || 1), 0); // Roadside excluded (separate LOB); Rewrites excluded
  const quotaTarget = config.quotaTarget || 13;

  // By LOB
  const byLob = {};
  monthSales.forEach(s => {
    if (!byLob[s.lob]) byLob[s.lob] = { count: 0, premium: 0 };
    byLob[s.lob].count++;
    byLob[s.lob].premium += s.premium || 0;
  });

  // By Carrier
  const byCarrier = {};
  monthSales.forEach(s => {
    if (!byCarrier[s.carrier]) byCarrier[s.carrier] = { count: 0, premium: 0 };
    byCarrier[s.carrier].count++;
    byCarrier[s.carrier].premium += s.premium || 0;
  });

  // By Source
  const bySource = {};
  monthSales.forEach(s => { bySource[s.source] = (bySource[s.source] || 0) + 1; });

  // By Type
  const byType = {};
  monthSales.forEach(s => { byType[s.saleType] = (byType[s.saleType] || 0) + 1; });

  // Pipeline conversion
  const wonThisMonth = data.prospects.filter(p => p.stage === "Won").length;
  const totalProspects = data.prospects.length;
  const convRate = totalProspects > 0 ? Math.round((wonThisMonth / totalProspects) * 100) : 0;

  // Retention — active vs total policies
  const activePolicies = data.policies.filter(p => p.status === "Active").length;
  const totalPolicies = data.policies.length;
  const retentionRate = totalPolicies > 0 ? Math.round((activePolicies / totalPolicies) * 100) : 0;

  // Service board throughput
  const completedThisMonth = data.serviceItems.filter(si => {
    if (si.status !== "Done") return false;
    if (!si.lastActionDate) return false;
    const d = new Date(si.lastActionDate);
    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
  }).length;
  const openItems = data.serviceItems.filter(si => si.status !== "Done").length;

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const maxPrem = Math.max(...Object.values(byLob).map(v => v.premium), 1);

  const handleExport = () => {
    const lines = [
      `SENTINEL INSURANCE PRODUCTION REPORT`,
      `${monthNames[reportMonth]} ${reportYear}`,
      ``,
      `SUMMARY`,
      `Items Written,${monthSales.length}`,
      `Total Premium,$${totalPremium.toLocaleString()}`,
      `Avg Premium/Sale,$${avgPremium.toLocaleString()}`,
      `Allstate Auto Quota,${allstateAuto}/${quotaTarget}`,
      `Pipeline Conversion,${convRate}%`,
      `Retention Rate,${retentionRate}%`,
      `Service Items Completed,${completedThisMonth}`,
      ``,
      `BY LINE OF BUSINESS`,
      `LOB,Count,Premium`,
      ...Object.entries(byLob).sort((a, b) => b[1].premium - a[1].premium).map(([lob, v]) => `${lob},${v.count},$${v.premium.toLocaleString()}`),
      ``,
      `BY CARRIER`,
      `Carrier,Count,Premium`,
      ...Object.entries(byCarrier).sort((a, b) => b[1].premium - a[1].premium).map(([c, v]) => `${c},${v.count},$${v.premium.toLocaleString()}`),
    ];
    if (_exportCallback) _exportCallback({ csv: lines.join("\n"), filename: `sentinel-production-${monthNames[reportMonth].toLowerCase()}-${reportYear}.csv` });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={S.pageTitle}>Production Report</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select style={{ ...S.input, width: "auto" }} value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}>
            {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...S.input, width: "auto" }} value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button style={S.btn("ghost")} onClick={handleExport}>↓ Export Report</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>ITEMS WRITTEN</div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{monthSales.length}</div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>TOTAL PREMIUM</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: COLORS.success }}>${totalPremium.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim }}>avg ${avgPremium.toLocaleString()}/sale</div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>ALLSTATE AUTO QUOTA</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: allstateAuto >= quotaTarget ? COLORS.success : COLORS.danger }}>{allstateAuto}</span>
            <span style={{ fontSize: 14, color: COLORS.textDim }}>/{quotaTarget}</span>
          </div>
          <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", width: `${Math.min(100, (allstateAuto / quotaTarget) * 100)}%`, background: allstateAuto >= quotaTarget ? COLORS.success : COLORS.accent, borderRadius: 3 }} />
          </div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>SERVICE THROUGHPUT</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: COLORS.info }}>{completedThisMonth}</div>
          <div style={{ fontSize: 11, color: COLORS.textDim }}>completed · {openItems} open</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 8 }}>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>PIPELINE CONVERSION</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{convRate}%</div>
          <div style={{ fontSize: 11, color: COLORS.textDim }}>{wonThisMonth} won of {totalProspects} total</div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, letterSpacing: "0.5px" }}>RETENTION RATE</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: retentionRate >= 85 ? COLORS.success : COLORS.warning }}>{retentionRate}%</div>
          <div style={{ fontSize: 11, color: COLORS.textDim }}>{activePolicies} active of {totalPolicies} policies</div>
        </div>
      </div>

      {/* By LOB + By Carrier */}
      <div style={{ ...S.grid(2), marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>Premium by Line of Business</span></div>
          {Object.entries(byLob).sort((a, b) => b[1].premium - a[1].premium).map(([lob, v]) => (
            <div key={lob} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <div style={{ width: 100, fontSize: 12, fontWeight: 500 }}>{lob}</div>
              <div style={{ flex: 1, height: 20, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(v.premium / maxPrem) * 100}%`, background: COLORS.accent, borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                  {v.premium / maxPrem > 0.3 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>${v.premium.toLocaleString()}</span>}
                </div>
              </div>
              <div style={{ width: 30, fontSize: 12, fontWeight: 600, textAlign: "right" }}>{v.count}</div>
            </div>
          ))}
          {Object.keys(byLob).length === 0 && <div style={S.emptyState}>No sales this month</div>}
        </div>

        <div style={S.card}>
          <div style={S.sectionTitle}><span>Premium by Carrier</span></div>
          {Object.entries(byCarrier).sort((a, b) => b[1].premium - a[1].premium).map(([carrier, v]) => (
            <div key={carrier} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <div style={{ width: 100, fontSize: 12, fontWeight: 500 }}>{carrier}</div>
              <div style={{ flex: 1, height: 20, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(v.premium / maxPrem) * 100}%`, background: COLORS.success, borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                  {v.premium / maxPrem > 0.3 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>${v.premium.toLocaleString()}</span>}
                </div>
              </div>
              <div style={{ width: 30, fontSize: 12, fontWeight: 600, textAlign: "right" }}>{v.count}</div>
            </div>
          ))}
          {Object.keys(byCarrier).length === 0 && <div style={S.emptyState}>No sales this month</div>}
        </div>
      </div>

      {/* By Source + By Type */}
      <div style={{ ...S.grid(2), marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>Sales by Source</span></div>
          {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
            <div key={source} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08` }}>
              <span style={{ fontSize: 13 }}>{source}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 80, height: 6, background: COLORS.border, borderRadius: 3 }}>
                  <div style={{ height: 6, background: COLORS.accent, borderRadius: 3, width: `${(count / monthSales.length) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, width: 20, textAlign: "right" }}>{count}</span>
              </div>
            </div>
          ))}
          {Object.keys(bySource).length === 0 && <div style={S.emptyState}>No sales this month</div>}
        </div>

        <div style={S.card}>
          <div style={S.sectionTitle}><span>Sales by Type</span></div>
          {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}08` }}>
              <span style={{ fontSize: 13 }}>{type}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 80, height: 6, background: COLORS.border, borderRadius: 3 }}>
                  <div style={{ height: 6, background: type === "New Business" ? COLORS.success : COLORS.info, borderRadius: 3, width: `${(count / monthSales.length) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, width: 20, textAlign: "right" }}>{count}</span>
              </div>
            </div>
          ))}
          {Object.keys(byType).length === 0 && <div style={S.emptyState}>No sales this month</div>}
        </div>
      </div>

      {/* Commission Tracker */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.sectionTitle}><span>💰 Commission Tracker</span></div>
        {(() => {
          const rates = config.commissionRates || {};
          const overhead = config.monthlyOverhead || 15000;
          const getRate = (carrier, lob) => rates[`${carrier}|${lob}`] || rates["default"] || 10;
          const getPolRate = (p) => p.commissionPct != null ? Number(p.commissionPct) : getRate(p.carrier, p.lob);

          const activePolicies = data.policies.filter(p => p.status === "Active");
          const bookCommission = activePolicies.reduce((sum, p) => sum + ((p.premium || 0) * getPolRate(p) / 100), 0);
          const totalAgencyFees = activePolicies.reduce((sum, p) => sum + (Number(p.agencyFee) || 0), 0);
          const totalRevenue = bookCommission + totalAgencyFees;
          const monthlyNewCommission = monthSales.reduce((sum, s) => sum + ((s.premium || 0) * getPolRate(s) / 100), 0);
          const monthlyNewFees = monthSales.reduce((sum, s) => sum + (Number(s.agencyFee) || 0), 0);

          const commByCarrier = {};
          activePolicies.forEach(p => {
            const key = `${p.carrier}|${p.lob}`;
            const rate = getPolRate(p);
            if (!commByCarrier[key]) commByCarrier[key] = { carrier: p.carrier, lob: p.lob, premium: 0, commission: 0, agencyFees: 0, rate, count: 0 };
            commByCarrier[key].premium += (p.premium || 0);
            commByCarrier[key].commission += ((p.premium || 0) * rate / 100);
            commByCarrier[key].agencyFees += (Number(p.agencyFee) || 0);
            commByCarrier[key].count++;
          });
          const commRows = Object.values(commByCarrier).sort((a, b) => (b.commission + b.agencyFees) - (a.commission + a.agencyFees));
          const annualNet = totalRevenue - (overhead * 12);

          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>Annual Book Commission</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.success }}>${Math.round(bookCommission).toLocaleString()}</div>
                </div>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>Annual Agency Fees</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.warning }}>${Math.round(totalAgencyFees).toLocaleString()}</div>
                </div>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>Total Annual Revenue</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.accentLight }}>${Math.round(totalRevenue).toLocaleString()}</div>
                </div>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>New Revenue ({monthNames[reportMonth]})</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.info }}>${Math.round(monthlyNewCommission + monthlyNewFees).toLocaleString()}</div>
                </div>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>Annual Net (- ${(overhead * 12).toLocaleString()})</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: annualNet >= 0 ? COLORS.success : COLORS.danger }}>${Math.round(annualNet).toLocaleString()}</div>
                </div>
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Carrier</th><th style={S.th}>LOB</th><th style={S.th}>Policies</th>
                  <th style={S.th}>Premium</th><th style={S.th}>Rate</th><th style={S.th}>Commission</th><th style={S.th}>Agency Fees</th><th style={S.th}>Total Revenue</th>
                </tr></thead>
                <tbody>
                  {commRows.map((r, i) => (
                    <tr key={i}>
                      <td style={S.td}>{r.carrier}</td>
                      <td style={S.td}><span style={S.badge(COLORS.info)}>{r.lob}</span></td>
                      <td style={S.td}>{r.count}</td>
                      <td style={S.td}>${r.premium.toLocaleString()}</td>
                      <td style={S.td}>{r.rate}%</td>
                      <td style={S.td}><span style={{ color: COLORS.success, fontWeight: 600 }}>${Math.round(r.commission).toLocaleString()}</span></td>
                      <td style={S.td}>{r.agencyFees > 0 ? <span style={{ color: COLORS.warning, fontWeight: 600 }}>${Math.round(r.agencyFees).toLocaleString()}</span> : "—"}</td>
                      <td style={S.td}><span style={{ color: COLORS.accentLight, fontWeight: 600 }}>${Math.round(r.commission + r.agencyFees).toLocaleString()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>Commission rates configurable per-policy (Commercial) or in Settings → Commission Rates. Agency fees apply to revenue at 100%.</div>
            </div>
          );
        })()}
      </div>

      {/* Referral Source ROI */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.sectionTitle}><span>📊 Source ROI Analysis</span></div>
        {(() => {
          const sourceStats = {};
          data.salesLog.forEach(s => {
            const src = s.source || "Other";
            if (!sourceStats[src]) sourceStats[src] = { source: src, sales: 0, premium: 0, items: 0 };
            sourceStats[src].sales++;
            sourceStats[src].premium += (s.premium || 0);
            sourceStats[src].items += (s.itemCount || 1);
          });
          const prospectsBySource = {};
          data.prospects.forEach(p => {
            const src = p.source || "Other";
            if (!prospectsBySource[src]) prospectsBySource[src] = { total: 0, won: 0, lost: 0, active: 0 };
            prospectsBySource[src].total++;
            if (p.stage === "Won") prospectsBySource[src].won++;
            else if (p.stage === "Lost") prospectsBySource[src].lost++;
            else prospectsBySource[src].active++;
          });
          const sources = Object.values(sourceStats).sort((a, b) => b.premium - a.premium);
          const totalPremium = sources.reduce((s, r) => s + r.premium, 0);
          const maxPrem = Math.max(...sources.map(r => r.premium), 1);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sources.map(r => {
                const pStats = prospectsBySource[r.source] || { total: 0, won: 0, lost: 0, active: 0 };
                const totalLeads = r.sales + pStats.total;
                const convRate = totalLeads > 0 ? Math.round((r.sales / totalLeads) * 100) : 0;
                const avgPremium = r.sales > 0 ? Math.round(r.premium / r.sales) : 0;
                const pct = totalPremium > 0 ? Math.round((r.premium / totalPremium) * 100) : 0;
                return (
                  <div key={r.source} style={{ background: COLORS.bg, borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.source}</span>
                        <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 8 }}>{r.sales} sales · {pStats.active} active leads</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.success }}>${r.premium.toLocaleString()}</span>
                        <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 6 }}>({pct}%)</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: `${(r.premium / maxPrem) * 100}%`, background: COLORS.success, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: COLORS.textDim }}>
                      <span>Conv Rate: <b style={{ color: convRate >= 40 ? COLORS.success : convRate >= 20 ? COLORS.warning : COLORS.danger }}>{convRate}%</b></span>
                      <span>Avg Premium: <b>${avgPremium.toLocaleString()}</b></span>
                      <span>Items: <b>{r.items}</b></span>
                    </div>
                  </div>
                );
              })}
              {sources.length === 0 && <div style={S.emptyState}>No sales data to analyze</div>}
            </div>
          );
        })()}
      </div>

      {/* Individual Sales Table */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.sectionTitle}><span>All Sales — {monthNames[reportMonth]} {reportYear}</span></div>
        {monthSales.length > 0 ? (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Date</th><th style={S.th}>Account</th><th style={S.th}>LOB</th>
              <th style={S.th}>Carrier</th><th style={S.th}>Premium</th><th style={S.th}>Source</th><th style={S.th}>Type</th>
            </tr></thead>
            <tbody>
              {monthSales.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(s => (
                <tr key={s.id}>
                  <td style={S.td}>{fmtShort(s.date)}</td>
                  <td style={S.td}>{s.accountName}</td>
                  <td style={S.td}><span style={S.badge(COLORS.info)}>{s.lob}</span></td>
                  <td style={S.td}>{s.carrier}</td>
                  <td style={S.td}>${(s.premium || 0).toLocaleString()}</td>
                  <td style={S.td}>{s.source}</td>
                  <td style={S.td}><span style={S.badge(s.saleType === "New Business" ? COLORS.success : COLORS.info)}>{s.saleType}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={S.emptyState}>No sales recorded for this month</div>}
      </div>
    </div>
  );
}

// ==================== SETTINGS & IMPORT ====================
// Isolated input row for carrier portal URLs — local state prevents parent re-render from stealing focus
function PortalUrlRow({ carrier, savedUrl, onSave }) {
  const [val, setVal] = useState(savedUrl);
  useEffect(() => { setVal(savedUrl); }, [savedUrl]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, width: 220, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={carrier}>{carrier}</span>
      <input style={{ ...S.input, fontSize: 12, flex: 1 }} placeholder="https://..." value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== savedUrl) onSave(val); }} />
      {val && <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: COLORS.accentLight, textDecoration: "none", flexShrink: 0 }} title="Test link">↗</a>}
    </div>
  );
}

function Settings({ data, setData, theme, setTheme, onConfigChange }) {
  const [config, setConfigState] = useState(loadConfig());
  const [editSection, setEditSection] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [importTab, setImportTab] = useState("service");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState(null);
  const [cleanupResults, setCleanupResults] = useState(null); // { suspects, orphanPolicies, orphanItems }
  const [cleanupExclude, setCleanupExclude] = useState(new Set()); // IDs to keep
  const [confirmAction, setConfirmAction] = useState(null); // "clear" | "reset" | null
  const [addGroupName, setAddGroupName] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [carrierOverrides, setCarrierOverrides] = useState({}); // { rawValue: selectedGroup }

  const updateConfig = (key, val) => {
    const updated = { ...config, [key]: val };
    setConfigState(updated);
    saveConfig(updated);
    if (onConfigChange) onConfigChange(updated);
  };

  const startEditList = (key) => { setEditSection(key); setEditValue(config[key].join("\n")); };
  const saveEditList = (key) => {
    const items = editValue.split("\n").map(s => s.trim()).filter(Boolean);
    updateConfig(key, items);
    setEditSection(null);
  };

  const parseCSV = (text) => {
    // Strip carriage returns and BOM characters that Excel adds
    const clean = text.replace(/\r/g, "").replace(/^\uFEFF/, "");
    const lines = clean.trim().split("\n");
    if (lines.length < 2) return null;
    // Auto-detect delimiter: tab, semicolon, or comma
    const firstLine = lines[0];
    const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
    const headers = firstLine.split(delim).map(h => h.trim().replace(/^"|"$/g, "").replace(/[\u200B\u00A0]/g, " ").trim());
    const rows = lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = []; let current = "", inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === delim && !inQuotes) { vals.push(current.trim()); current = ""; }
        else { current += ch; }
      }
      vals.push(current.trim());
      return vals;
    });
    return { headers, rows };
  };

  const handlePreview = () => {
    const parsed = parseCSV(csvText);
    if (!parsed || parsed.rows.length === 0) { setImportMsg("Could not parse CSV"); return; }
    setCsvPreview(parsed);
    setImportMsg(`Found ${parsed.rows.length} rows with ${parsed.headers.length} columns`);
  };

  // Unified import — auto-creates clients, policies, and service items based on detected columns
  const handleImportUnified = () => {
    if (!csvPreview) return;
    const { headers, rows } = csvPreview;
    const col = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const colExact = (name) => headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());

    // Name columns
    const firstNameCol = col("first name") !== -1 ? col("first name") : colExact("first") !== -1 ? colExact("first") : -1;
    const lastNameCol = col("last name") !== -1 ? col("last name") : colExact("last") !== -1 ? colExact("last") : -1;
    const entityCol = col("entity") !== -1 ? col("entity") : col("business") !== -1 ? col("business") : col("company name") !== -1 ? col("company name") : -1;
    const fullNameCol = firstNameCol === -1 ? (col("insured") !== -1 ? col("insured") : col("name") !== -1 ? col("name") : col("account")) : -1;
    const titleCase = (s) => (s || "").trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    const getName = (r) => {
      if (firstNameCol !== -1 && lastNameCol !== -1) {
        const entity = entityCol !== -1 ? (r[entityCol] || "").trim() : "";
        if (entity) return titleCase(entity);
        return titleCase(`${(r[firstNameCol]||"").trim()} ${(r[lastNameCol]||"").trim()}`);
      }
      if (fullNameCol !== -1) return titleCase((r[fullNameCol]||"").trim());
      return "";
    };

    // Contact columns
    const phoneCol = col("phone");
    const emailCol = col("email");
    const typeCol = col("type");
    const addressCol = col("address") !== -1 ? col("address") : col("risk address") !== -1 ? col("risk address") : col("street");
    const cityCol = col("city") !== -1 ? col("city") : col("risk city");
    const stateCol = col("state") !== -1 ? col("state") : col("risk state");
    const zipCol = col("zip") !== -1 ? col("zip") : col("risk zip") !== -1 ? col("risk zip") : col("postal");

    // Policy columns
    const policyCol = col("policy") !== -1 ? col("policy") : col("pol #") !== -1 ? col("pol #") : col("pol#");
    const carrierCol = col("carrier") !== -1 ? col("carrier") : col("company");
    const lobCol = col("lob") !== -1 ? col("lob") : col("line of business") !== -1 ? col("line of business") : col("coverage") !== -1 ? col("coverage") : col("product");
    const premiumCol = col("premium") !== -1 ? col("premium") : col("annual premium");
    const effectiveCol = col("effective") !== -1 ? col("effective") : col("eff date");
    const expirationCol = col("expir") !== -1 ? col("expir") : col("exp date") !== -1 ? col("exp date") : col("renewal date");
    const hasPolicyCols = policyCol !== -1 || carrierCol !== -1;

    // Service item columns
    const txnTypeCol = col("transaction") !== -1 ? col("transaction") : -1;
    const statusCol = col("status");
    const dueCol = col("due");
    const amtCol = premiumCol !== -1 ? premiumCol : (col("amount") !== -1 ? col("amount") : col("balance") !== -1 ? col("balance") : col("amt"));
    const descCol = col("description") !== -1 ? col("description") : col("desc");
    const actionCol = col("last action") !== -1 ? col("last action") : col("action");
    const actionDateCol = col("action date") !== -1 ? col("action date") : col("last action date");
    const nextCol = col("next");
    const hasServiceCols = txnTypeCol !== -1;

    // Build client accounts
    const newAccounts = [];
    const allAccounts = [...data.accounts];
    const findOrCreateAccount = (name, r) => {
      if (!name) return null;
      let acct = allAccounts.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (acct) {
        // Merge in contact info if currently blank
        let changed = false;
        if (!acct.phone && phoneCol !== -1 && (r[phoneCol]||"").trim()) { acct.phone = (r[phoneCol]||"").trim(); changed = true; }
        if (!acct.email && emailCol !== -1 && (r[emailCol]||"").trim()) { acct.email = (r[emailCol]||"").trim(); changed = true; }
        if (!acct.address && addressCol !== -1 && (r[addressCol]||"").trim()) { acct.address = titleCase(r[addressCol]||""); changed = true; }
        if ((!acct.zip || acct.zip === "") && zipCol !== -1 && (r[zipCol]||"").trim()) { acct.zip = String(r[zipCol]||"").trim(); changed = true; }
        if ((!acct.city || acct.city === "Fort Lauderdale") && cityCol !== -1 && (r[cityCol]||"").trim()) { acct.city = titleCase(r[cityCol]||""); changed = true; }
        return acct;
      }
      const isCommercial = entityCol !== -1 && (r[entityCol] || "").trim().length > 0;
      const acctType = typeCol !== -1 ? (r[typeCol] || (isCommercial ? "Commercial" : "Personal")) : (isCommercial ? "Commercial" : "Personal");
      acct = {
        id: uid(), name,
        type: acctType,
        phone: phoneCol !== -1 ? (r[phoneCol] || "").trim() : "",
        email: emailCol !== -1 ? (r[emailCol] || "").trim() : "",
        address: addressCol !== -1 ? titleCase(r[addressCol] || "") : "",
        city: cityCol !== -1 ? titleCase(r[cityCol] || "") : (config.defaultCity || "Fort Lauderdale"),
        state: stateCol !== -1 ? (r[stateCol] || "FL").trim().toUpperCase() : "FL",
        zip: zipCol !== -1 ? String(r[zipCol] || "").trim() : "",
        status: "Active", created: today(),
        policyType: "other", lineOfBusiness: acctType === "Commercial" ? "commercial" : "personal", carrier: "", autoItemCount: 0, xDate: "", xDateSource: "", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "service_only", serviceLog: []
      };
      allAccounts.push(acct);
      newAccounts.push(acct);
      return acct;
    };

    // Build policies
    const newPolicies = [];
    const allPolicies = [...data.policies];
    const findOrCreatePolicy = (acct, r) => {
      if (!acct || !hasPolicyCols) return null;
      const polNum = policyCol !== -1 ? (r[policyCol] || "").trim() : "";
      const carrierVal = normalizeCarrier(carrierCol !== -1 ? (r[carrierCol] || "").trim() : "", config.carrierGroups);
      if (!polNum && !carrierVal) return null;
      // Exact policy number match
      if (polNum) {
        let pol = allPolicies.find(p => p.accountId === acct.id && p.policyNumber && p.policyNumber.toLowerCase() === polNum.toLowerCase());
        if (pol) return pol;
      }
      // Already created this import
      let pol = newPolicies.find(p => p.accountId === acct.id && polNum && p.policyNumber && p.policyNumber.toLowerCase() === polNum.toLowerCase());
      if (pol) return pol;
      const rawPrem = premiumCol !== -1 ? (r[premiumCol] || "").replace(/[$,]/g, "").trim() : "";
      const lobVal = normalizeLOB(lobCol !== -1 ? (r[lobCol] || "").trim() : "");
      const effDate = normalizeDate(effectiveCol !== -1 ? r[effectiveCol] || "" : "");
      let expDate = normalizeDate(expirationCol !== -1 ? r[expirationCol] || "" : "");
      // Auto-calculate expiration: Auto LOBs = 6 months, everything else = 12 months
      if (!expDate) {
        const baseDate = effDate || today();
        expDate = calcExpiration(baseDate, lobVal) || "";
      }
      pol = {
        id: uid(), accountId: acct.id, accountName: acct.name, carrier: carrierVal, lob: lobVal,
        policyNumber: polNum, effectiveDate: effDate || today(),
        expirationDate: expDate,
        premium: Number(rawPrem) || 0, status: (() => {
          const txn = (txnTypeCol !== -1 ? (r[txnTypeCol] || "") : "").toLowerCase();
          return txn.includes("renewal") ? "Pending" : "Active";
        })(), paymentPlan: "", vehicleCount: 0,
        documents: {}, notes: "Auto-created from import"
      };
      allPolicies.push(pol);
      newPolicies.push(pol);
      return pol;
    };

    // Build service items (only if transaction type column present)
    const newServiceItems = [];
    const todayStr = today();
    rows.forEach(r => {
      const name = getName(r);
      if (!name) return;
      const acct = findOrCreateAccount(name, r);
      const pol = findOrCreatePolicy(acct, r);
      if (hasServiceCols) {
        const rawType = txnTypeCol !== -1 ? (r[txnTypeCol] || "").trim() : "";
        const siType = rawType || "General";
        const rawAmt = amtCol !== -1 ? (r[amtCol] || "").replace(/[$,]/g, "").trim() : "";
        const lobVal = lobCol !== -1 ? (r[lobCol] || "").trim() : "";
        const si = {
          id: uid(), type: siType,
          accountId: acct ? acct.id : "", accountName: name,
          policyId: pol ? pol.id : "",
          policyNumber: (pol ? pol.policyNumber : "") || (policyCol !== -1 ? (r[policyCol]||"").trim() : ""),
          carrier: (pol ? pol.carrier : "") || normalizeCarrier(carrierCol !== -1 ? (r[carrierCol]||"").trim() : "", config.carrierGroups),
          lob: lobVal || (pol ? pol.lob : ""),
          description: descCol !== -1 ? (r[descCol] || name) : name,
          status: statusCol !== -1 ? (SERVICE_STATUSES.includes(r[statusCol]) ? r[statusCol] : "Uncontacted") : "Uncontacted",
          flags: [], assignedTo: config.agentName || "Agent",
          dueDate: normalizeDate(dueCol !== -1 ? r[dueCol] || "" : ""),
          urgency: "Medium", created: todayStr,
          amountDue: Number(rawAmt) || 0,
          lastAction: actionCol !== -1 ? (r[actionCol] || "") : "",
          lastActionDate: normalizeDate(actionDateCol !== -1 ? r[actionDateCol] || "" : ""),
          nextStep: nextCol !== -1 ? (r[nextCol] || "") : "",
          contactAttempts: []
        };
        newServiceItems.push(si);
      }
    });

    // If no service columns but we still need to process accounts (client-only import)
    if (!hasServiceCols) {
      rows.forEach(r => {
        const name = getName(r);
        if (!name) return;
        const acct = findOrCreateAccount(name, r);
        findOrCreatePolicy(acct, r);
      });
    }

    // Deduplicate service items vs existing
    let uniqueSI = newServiceItems;
    let dupeSI = [];
    if (newServiceItems.length > 0) {
      const existingKeys = new Set(data.serviceItems.map(si => `${(si.accountName || "").toLowerCase()}|${(si.type || "").toLowerCase()}|${si.dueDate || ""}`));
      dupeSI = newServiceItems.filter(si => existingKeys.has(`${(si.accountName || "").toLowerCase()}|${(si.type || "").toLowerCase()}|${si.dueDate || ""}`));
      uniqueSI = newServiceItems.filter(si => !existingKeys.has(`${(si.accountName || "").toLowerCase()}|${(si.type || "").toLowerCase()}|${si.dueDate || ""}`));
    }

    const updated = { ...data, accounts: allAccounts, policies: allPolicies, serviceItems: [...data.serviceItems, ...uniqueSI] };
    setData(updated, { undo: true, message: `Import: ${newAccounts.length} clients, ${newPolicies.length} policies, ${uniqueSI.length} service items` });

    const parts = [];
    if (newAccounts.length) parts.push(`${newAccounts.length} new client${newAccounts.length > 1 ? "s" : ""}`);
    if (newPolicies.length) parts.push(`${newPolicies.length} new polic${newPolicies.length > 1 ? "ies" : "y"}`);
    if (uniqueSI.length) parts.push(`${uniqueSI.length} service item${uniqueSI.length > 1 ? "s" : ""}`);
    if (dupeSI.length) parts.push(`skipped ${dupeSI.length} duplicate item${dupeSI.length > 1 ? "s" : ""}`);
    if (parts.length === 0) parts.push("No new records to import");
    setImportMsg("Imported: " + parts.join(" · "));
    setCsvPreview(null); setCsvText("");
  };

  // Book of Business import — creates BOTH clients AND policies from carrier BOB exports
  const handleImportBOB = () => {
    if (!csvPreview) return;
    const { headers, rows } = csvPreview;
    const col = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const colExact = (name) => headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());

    // Column detection
    const firstNameCol = col("first name") !== -1 ? col("first name") : colExact("first") !== -1 ? colExact("first") : -1;
    const lastNameCol = col("last name") !== -1 ? col("last name") : colExact("last") !== -1 ? colExact("last") : -1;
    const entityCol = col("entity") !== -1 ? col("entity") : col("business") !== -1 ? col("business") : col("company name") !== -1 ? col("company name") : -1;
    const fullNameCol = firstNameCol === -1 ? (col("name") !== -1 ? col("name") : col("insured") !== -1 ? col("insured") : col("account")) : -1;
    const premiumCol = col("premium") !== -1 ? col("premium") : col("annual premium") !== -1 ? col("annual premium") : col("written premium");
    const policyCol = col("policy") !== -1 ? col("policy") : col("pol #") !== -1 ? col("pol #") : col("pol#");
    const carrierCol = col("carrier") !== -1 ? col("carrier") : col("company") !== -1 ? col("company") : col("writing co");
    const effectiveCol = col("effective") !== -1 ? col("effective") : col("eff date") !== -1 ? col("eff date") : col("inception");
    const expirationCol = col("expir") !== -1 ? col("expir") : col("exp date") !== -1 ? col("exp date") : col("renewal");
    const lobCol = col("lob") !== -1 ? col("lob") : col("line of business") !== -1 ? col("line of business") : col("coverage") !== -1 ? col("coverage") : col("product");
    const addressCol = col("address") !== -1 ? col("address") : col("risk address") !== -1 ? col("risk address") : col("street");
    const cityCol = col("city") !== -1 ? col("city") : col("risk city");
    const stateCol = col("state") !== -1 ? col("state") : col("risk state");
    const zipCol = col("zip") !== -1 ? col("zip") : col("risk zip") !== -1 ? col("risk zip") : col("postal");
    const phoneCol = col("phone");
    const emailCol = col("email");

    const titleCase = (s) => (s || "").trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

    // LOB inference from carrier/policy
    const inferLOB = (carrier, policyNum) => {
      const c = (carrier || "").toLowerCase();
      const p = (policyNum || "").toLowerCase();
      // Common patterns
      if (p.startsWith("ovh") || c.includes("peninsula") || c.includes("citizens") || c.includes("tower hill") || c.includes("typtap") || c.includes("heritage") || c.includes("universal") || c.includes("slide") || c.includes("american integrity") || c.includes("edison")) return "Home";
      if (c.includes("flood") || p.includes("flood") || c.includes("wright") || c.includes("fema") || c.includes("neptune")) return "Flood";
      if (c.includes("allstate") && !p.includes("road")) return "Auto"; // default for Allstate, can be wrong
      return "";
    };

    // Pass 1: build client map
    const allAccounts = [...data.accounts];
    const newAccounts = [];
    const clientMap = {}; // name → account

    const getName = (r) => {
      if (firstNameCol !== -1 && lastNameCol !== -1) {
        const first = (r[firstNameCol] || "").trim();
        const last = (r[lastNameCol] || "").trim();
        const entity = entityCol !== -1 ? (r[entityCol] || "").trim() : "";
        return titleCase(entity || (first && last ? `${first} ${last}` : first || last));
      }
      if (fullNameCol !== -1) return titleCase((r[fullNameCol] || "").trim());
      return "";
    };

    const findOrCreateAccount = (r) => {
      const name = getName(r);
      if (!name) return null;
      const key = name.toLowerCase();
      if (clientMap[key]) return clientMap[key];

      // Check existing accounts
      let acct = allAccounts.find(a => a.name.toLowerCase() === key);
      if (acct) {
        // Update address/city/state/zip if currently blank
        let updated = false;
        if (!acct.address && addressCol !== -1 && r[addressCol]) { acct.address = titleCase(r[addressCol]); updated = true; }
        if ((!acct.city || acct.city === "Fort Lauderdale") && cityCol !== -1 && r[cityCol]) { acct.city = titleCase(r[cityCol]); updated = true; }
        if ((!acct.state || acct.state === "FL") && stateCol !== -1 && r[stateCol]) { acct.state = (r[stateCol] || "").trim().toUpperCase(); updated = true; }
        if (!acct.zip && zipCol !== -1 && r[zipCol]) { acct.zip = String(r[zipCol]).trim(); updated = true; }
        clientMap[key] = acct;
        return acct;
      }

      const isCommercial = entityCol !== -1 && (r[entityCol] || "").trim().length > 0;
      const bobAcctType = isCommercial ? "Commercial" : "Personal";
      acct = {
        id: uid(), name,
        type: bobAcctType,
        phone: phoneCol !== -1 ? (r[phoneCol] || "").trim() : "",
        email: emailCol !== -1 ? (r[emailCol] || "").trim() : "",
        address: addressCol !== -1 ? titleCase(r[addressCol] || "") : "",
        city: cityCol !== -1 ? titleCase(r[cityCol] || "") : (config.defaultCity || "Fort Lauderdale"),
        state: stateCol !== -1 ? (r[stateCol] || "FL").trim().toUpperCase() : "FL",
        zip: zipCol !== -1 ? String(r[zipCol] || "").trim() : "",
        status: "Active", created: today(),
        policyType: "other", lineOfBusiness: bobAcctType === "Commercial" ? "commercial" : "personal", carrier: "", autoItemCount: 0, xDate: "", xDateSource: "", roofYear: null, windMitigation: "unknown", constructionType: "", propertyAddress: "", pipelineStatus: "service_only", serviceLog: []
      };
      allAccounts.push(acct);
      newAccounts.push(acct);
      clientMap[key] = acct;
      return acct;
    };

    // Pass 2: build policies and service items
    const allPolicies = [...data.policies];
    const newPolicies = [];
    const newServiceItems = [];
    let updatedPolicies = 0;
    const existingPolKeys = new Set(data.policies.map(p => p.policyNumber ? p.policyNumber.toLowerCase() : ""));

    rows.forEach(r => {
      const acct = findOrCreateAccount(r);
      if (!acct) return;

      const policyNum = policyCol !== -1 ? (r[policyCol] || "").trim() : "";
      const carrierVal = normalizeCarrier(carrierCol !== -1 ? (r[carrierCol] || "").trim() : "", config.carrierGroups);
      const rawPrem = premiumCol !== -1 ? String(r[premiumCol] || "").replace(/[$,]/g, "").trim() : "";
      const effDate = effectiveCol !== -1 ? normalizeDate(r[effectiveCol] || "") : "";
      const expDate = expirationCol !== -1 ? normalizeDate(r[expirationCol] || "") : "";
      const lobRaw = lobCol !== -1 ? (r[lobCol] || "").trim() : inferLOB(carrierVal, policyNum);
      const lobVal = normalizeLOB(lobRaw) || lobRaw;

      if (!policyNum && !carrierVal) return; // skip rows with no policy info

      // Also skip if we already added this policy in this batch
      if (policyNum && newPolicies.find(p => p.policyNumber.toLowerCase() === policyNum.toLowerCase())) return;

      // Check if policy already exists — UPDATE it instead of skipping
      if (policyNum && existingPolKeys.has(policyNum.toLowerCase())) {
        const existingPol = allPolicies.find(p => (p.policyNumber || "").toLowerCase() === policyNum.toLowerCase());
        if (existingPol) {
          // Update fields that are currently empty or if new data is available
          if (effDate && !existingPol.effectiveDate) existingPol.effectiveDate = effDate;
          if (expDate && !existingPol.expirationDate) existingPol.expirationDate = expDate;
          if (lobVal && !existingPol.lob) existingPol.lob = lobVal;
          if (carrierVal && !existingPol.carrier) existingPol.carrier = carrierVal;
          if (Number(rawPrem) && !existingPol.premium) existingPol.premium = Number(rawPrem);
          // Also update accountId linkage if needed
          if (acct.id && !existingPol.accountId) { existingPol.accountId = acct.id; existingPol.accountName = acct.name; }
          updatedPolicies++;
        }
        return;
      }

      const polId = uid();
      const pol = {
        id: polId, accountId: acct.id, accountName: acct.name,
        carrier: carrierVal, lob: lobVal, policyNumber: policyNum,
        effectiveDate: effDate, expirationDate: expDate,
        premium: Number(rawPrem) || 0, status: "Active",
        paymentPlan: "", vehicleCount: isAutoTermLob(lobVal) ? 1 : 0, documents: {},
        notes: "Imported from Book of Business",
      };
      allPolicies.push(pol);
      newPolicies.push(pol);
      existingPolKeys.add(policyNum.toLowerCase());

      // Auto-create renewal service item if expiring within renewal window (with dedup)
      const daysToExp = expDate ? daysBetween(today(), expDate) : -1;
      const _importRenTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal"];
      const _importHasRenewal = data.serviceItems.some(si => si.policyId === polId && _importRenTypes.some(rt => si.type.includes("Renewal")))
        || newServiceItems.some(si => si.policyId === polId && _importRenTypes.some(rt => si.type.includes("Renewal")));
      if (daysToExp >= 0 && daysToExp <= renewalWindow(lobVal) && !_importHasRenewal) {
        const _rebuildType = isCommercialLob(lobVal) ? "Commercial Renewal" : (carrierVal === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
        newServiceItems.push({
          id: uid(), type: _rebuildType, accountId: acct.id, accountName: acct.name,
          policyId: polId, policyNumber: policyNum, carrier: carrierVal, lob: lobVal,
          description: `${carrierVal} ${lobVal} Renewal`, dueDate: expDate || today(),
          amountDue: Number(rawPrem) || 0, status: "Uncontacted", urgency: daysToExp <= 14 ? "High" : "Medium",
          assignedTo: config.agentName || "Agent", created: today(), lastAction: "", lastActionDate: "",
          followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
        });
      }
    });

    const updated = { ...data, accounts: allAccounts, policies: allPolicies, serviceItems: [...data.serviceItems, ...newServiceItems] };
    setData(updated, { undo: true, message: `BOB Import: ${newPolicies.length} new, ${updatedPolicies} updated, ${newAccounts.length} clients, ${newServiceItems.length} service items` });
    const parts = [`Imported ${newPolicies.length} new policies with ${newServiceItems.length} service items`];
    if (updatedPolicies > 0) parts.push(`Updated ${updatedPolicies} existing policies`);
    if (newAccounts.length) parts.push(`Created ${newAccounts.length} new clients`);
    // Debug: show sample date parsing
    const sampleRow = rows[0] || [];
    const sampleEff = effectiveCol !== -1 ? sampleRow[effectiveCol] : "N/A";
    const sampleParsed = effectiveCol !== -1 ? normalizeDate(sampleRow[effectiveCol] || "") : "N/A";
    parts.push(`Date sample: "${sampleEff}" → ${sampleParsed}`);
    setImportMsg(parts.join(" · "));
    setCsvPreview(null); setCsvText("");
  };

  const handleImportSales = () => {
    if (!csvPreview) return;
    const { headers, rows } = csvPreview;
    const col = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const dateCol = col("date") !== -1 ? col("date") : col("sold");
    const nameCol = col("account") !== -1 ? col("account") : col("insured") !== -1 ? col("insured") : col("name");
    const lobCol = col("lob") !== -1 ? col("lob") : col("line");
    const carrierCol = col("carrier") !== -1 ? col("carrier") : col("company");
    const premiumCol = col("premium") !== -1 ? col("premium") : col("amount") !== -1 ? col("amount") : col("amt");
    const sourceCol = col("source") !== -1 ? col("source") : col("lead");
    const typeCol = col("type") !== -1 ? col("type") : col("sale type");
    const zipCol = col("zip") !== -1 ? col("zip") : col("postal");
    const itemCol = col("item") !== -1 ? col("item") : col("count") !== -1 ? col("count") : col("items");

    const newSales = rows.map(r => {
      const rawPrem = premiumCol !== -1 ? (r[premiumCol] || "").replace(/[$,]/g, "").trim() : "";
      return {
        id: uid(),
        date: normalizeDate(dateCol !== -1 ? r[dateCol] || "" : today()),
        accountName: nameCol !== -1 ? (r[nameCol] || "").trim() : "",
        lob: lobCol !== -1 ? (r[lobCol] || "").trim() : "",
        carrier: normalizeCarrier(carrierCol !== -1 ? (r[carrierCol] || "").trim() : "", config.carrierGroups),
        premium: Number(rawPrem) || 0,
        source: sourceCol !== -1 ? (r[sourceCol] || "").trim() : "",
        saleType: typeCol !== -1 ? (r[typeCol] || "New Business").trim() : "New Business",
        zip: zipCol !== -1 ? (r[zipCol] || "").trim() : "",
        itemCount: itemCol !== -1 ? (Number(r[itemCol]) || 1) : 1,
      };
    }).filter(s => s.accountName);

    // Duplicate detection — skip sales matching existing accountName + date + carrier + premium
    const existingSalesKeys = new Set(data.salesLog.map(s => `${(s.accountName || "").toLowerCase()}|${s.date || ""}|${(s.carrier || "").toLowerCase()}|${s.premium || 0}`));
    const saleDupes = newSales.filter(s => existingSalesKeys.has(`${(s.accountName || "").toLowerCase()}|${s.date || ""}|${(s.carrier || "").toLowerCase()}|${s.premium || 0}`));
    const uniqueSales = newSales.filter(s => !existingSalesKeys.has(`${(s.accountName || "").toLowerCase()}|${s.date || ""}|${(s.carrier || "").toLowerCase()}|${s.premium || 0}`));

    const updated = { ...data, salesLog: [...data.salesLog, ...uniqueSales] };
    setData(updated);
    const parts = [`Imported ${uniqueSales.length} sales entries`];
    if (saleDupes.length) parts.push(`Skipped ${saleDupes.length} duplicate${saleDupes.length > 1 ? "s" : ""}`);
    setImportMsg(parts.join(" · "));
    setCsvPreview(null); setCsvText("");
  };

  // ---- Policy Update Import ----
  const handleImportPolicyUpdate = () => {
    if (!csvPreview) return;
    const { headers, rows } = csvPreview;
    const col = (name) => headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(name.toLowerCase().replace(/[^a-z0-9]/g, "")));
    const idCol = col("id");
    const carrierCol = col("carrier") !== -1 ? col("carrier") : col("company");
    const lobCol = col("lob") !== -1 ? col("lob") : col("line");
    const polNumCol = col("policy") !== -1 ? col("policy") : col("polnum");
    const effCol = col("effective") !== -1 ? col("effective") : col("effdate");
    const expCol = col("expiration") !== -1 ? col("expiration") : col("expdate");
    const premCol = col("premium") !== -1 ? col("premium") : col("amount");
    const statusCol = col("status");
    const payCol = col("payment") !== -1 ? col("payment") : col("payplan");
    const vehCol = col("vehicle") !== -1 ? col("vehicle") : col("veh");
    const acctCol = col("account") !== -1 ? col("account") : col("insured") !== -1 ? col("insured") : col("name");

    if (idCol === -1) {
      setImportMsg("⚠️ No ID column found. Export policies first from Settings → Export → Policies, then edit that file.");
      return;
    }

    let matched = 0, skipped = 0, notFound = 0;
    const updatedPolicies = data.policies.map(p => {
      const row = rows.find(r => (r[idCol] || "").trim() === p.id);
      if (!row) return p;
      const changes = {};
      const trySet = (field, colIdx, transform) => {
        if (colIdx === -1) return;
        const val = (row[colIdx] || "").trim();
        if (!val) return;
        changes[field] = transform ? transform(val) : val;
      };
      trySet("carrier", carrierCol, v => normalizeCarrier(v, config.carrierGroups));
      trySet("lob", lobCol, v => normalizeLOB(v));
      trySet("policyNumber", polNumCol);
      trySet("effectiveDate", effCol, v => normalizeDate(v));
      trySet("expirationDate", expCol, v => normalizeDate(v));
      trySet("premium", premCol, v => Number(v.replace(/[$,]/g, "")) || p.premium);
      trySet("status", statusCol);
      trySet("paymentPlan", payCol);
      trySet("vehicleCount", vehCol, v => Number(v) || 0);
      trySet("accountName", acctCol);
      if (Object.keys(changes).length > 0) { matched++; return { ...p, ...changes }; }
      skipped++;
      return p;
    });

    notFound = rows.filter(r => (r[idCol] || "").trim() && !data.policies.some(p => p.id === (r[idCol] || "").trim())).length;

    const updated = { ...data, policies: updatedPolicies };
    setData(updated, { undo: true, message: `Policy update: ${matched} updated` });
    const parts = [`Updated ${matched} policies`];
    if (skipped) parts.push(`${skipped} unchanged`);
    if (notFound) parts.push(`${notFound} IDs not found`);
    setImportMsg(parts.join(" · "));
    setCsvPreview(null); setCsvText("");
  };
  const scanForBadImport = () => {
    const todayStr = today();
    // Fingerprint: created today, no phone, no email, no address — likely a botched BOB/client import
    const suspects = data.accounts.filter(a => {
      if (a.created !== todayStr) return false;
      // Has no contact info and no address — dead giveaway of a bad import
      const noContact = !a.phone && !a.email && !a.address;
      if (!noContact) return false;
      // Check if name looks like first-name-only (single word, or all caps)
      const words = (a.name || "").trim().split(/\s+/);
      const isSingleWord = words.length === 1;
      const isAllCaps = a.name === a.name.toUpperCase() && a.name.length > 1;
      // Also flag if city is still the default and zip is set (imported zip but defaulted city)
      const hasDefaultCity = a.city === "Fort Lauderdale" || a.city === (loadConfig().defaultCity || "Fort Lauderdale");
      return isSingleWord || isAllCaps || hasDefaultCity;
    });

    const suspectIds = new Set(suspects.map(a => a.id));
    // Find any policies linked to these suspect accounts
    const orphanPolicies = data.policies.filter(p => suspectIds.has(p.accountId));
    // Find any service items linked to these suspect accounts
    const orphanItems = data.serviceItems.filter(si => suspectIds.has(si.accountId));

    setCleanupResults({ suspects, orphanPolicies, orphanItems });
    setCleanupExclude(new Set());
  };

  const executeCleanup = () => {
    if (!cleanupResults) return;
    const removeIds = new Set(cleanupResults.suspects.filter(a => !cleanupExclude.has(a.id)).map(a => a.id));
    const removePolicyIds = new Set(cleanupResults.orphanPolicies.filter(p => removeIds.has(p.accountId)).map(p => p.id));
    const updated = {
      ...data,
      accounts: data.accounts.filter(a => !removeIds.has(a.id)),
      policies: data.policies.filter(p => !removePolicyIds.has(p.id)),
      serviceItems: data.serviceItems.filter(si => !removeIds.has(si.accountId)),
    };
    const removed = removeIds.size;
    const removedPol = removePolicyIds.size;
    const removedSi = data.serviceItems.filter(si => removeIds.has(si.accountId)).length;
    setData(updated);
    setCleanupResults(null);
    setImportMsg(`Cleanup complete: removed ${removed} client${removed !== 1 ? "s" : ""}${removedPol ? `, ${removedPol} polic${removedPol !== 1 ? "ies" : "y"}` : ""}${removedSi ? `, ${removedSi} service item${removedSi !== 1 ? "s" : ""}` : ""}`);
  };

  const doExport = (type) => {
    if (type === "clients") {
      exportCSV(["Name","Type","Phone","Email","Address","City","State","Zip","Status","Created"],
        data.accounts.map(a => [a.name,a.type,a.phone,a.email,a.address,a.city,a.state,a.zip,a.status,a.created]),
        `sentinel-clients-${today()}.csv`);
    } else if (type === "policies") {
      exportCSV(["ID","Account","Carrier","LOB","Policy #","Effective","Expiration","Premium","Status","Payment Plan","Vehicles"],
        data.policies.map(p => [p.id,p.accountName,p.carrier,p.lob,p.policyNumber,p.effectiveDate,p.expirationDate,p.premium,p.status,p.paymentPlan,p.vehicleCount||0]),
        `sentinel-policies-${today()}.csv`);
    } else if (type === "sales") {
      exportCSV(["Date","Account","LOB","Carrier","Premium","Source","Type","Zip"],
        data.salesLog.map(s => [s.date,s.accountName,s.lob,s.carrier,s.premium,s.source,s.saleType,s.zip]),
        `sentinel-sales-${today()}.csv`);
    } else if (type === "service") {
      exportCSV(["Insured Name","Policy #","Carrier","Transaction Type","Due Date","Amount Due","Status","Description","Last Action","Next Step"],
        data.serviceItems.map(si => { const pol = data.policies.find(p => p.id === si.policyId); return [si.accountName, pol ? pol.policyNumber : si.policyNumber || "", pol ? pol.carrier : si.carrier || "", si.type, si.dueDate, si.amountDue||0, si.status, si.description||"", si.lastAction||"", si.nextStep||""]; }),
        `sentinel-service-board-${today()}.csv`);
    }
  };

  const dangerReset = () => {}; // handled inline now

  return (
    <div>
      <div style={S.pageTitle}>Settings</div>

      {/* Theme Picker */}
      <div style={{ ...S.card, marginTop: 16, marginBottom: 16 }}>
        <div style={S.sectionTitle}><span>Platform Theme</span></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          {Object.entries(THEMES).map(([key, t]) => (
            <div key={key} onClick={() => setTheme(key)} style={{
              flex: "1 1 140px", maxWidth: 180, padding: 14, borderRadius: 10, cursor: "pointer",
              border: theme === key ? `2px solid ${COLORS.accent}` : `2px solid ${COLORS.border}`,
              background: t.card, transition: "all 0.2s ease",
              boxShadow: theme === key ? `0 0 12px ${COLORS.accent}30` : "none",
            }}>
              {/* Color preview dots */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {[t.bg, t.sidebar, t.card, t.accent, t.accentLight].map((c, i) => (
                  <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: "1px solid rgba(255,255,255,0.1)" }} />
                ))}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: t.text }}>{t.name}</div>
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{t.desc}</div>
              {theme === key && <div style={{ fontSize: 10, color: COLORS.accent, fontWeight: 600, marginTop: 6 }}>✓ Active</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.grid(2), marginTop: 16 }}>
        <div style={S.card}>
          <div style={S.sectionTitle}><span>Agency Configuration</span></div>
          <FormField label="Agent Name">
            <input style={S.input} value={config.agentName} onChange={e => updateConfig("agentName", e.target.value)} />
          </FormField>
          <FormField label="Agency Name">
            <input style={S.input} value={config.agencyName} onChange={e => updateConfig("agencyName", e.target.value)} />
          </FormField>
          <div style={S.grid(2)}>
            <FormField label="Phone">
              <input style={S.input} value={config.agentPhone || ""} onChange={e => updateConfig("agentPhone", e.target.value)} placeholder="954-555-0000" />
            </FormField>
            <FormField label="Email">
              <input style={S.input} value={config.agentEmail || ""} onChange={e => updateConfig("agentEmail", e.target.value)} placeholder="you@agency.com" />
            </FormField>
          </div>
          <FormField label="Allstate Auto Quota Target">
            <input style={{ ...S.input, maxWidth: 100 }} type="number" value={config.quotaTarget} onChange={e => updateConfig("quotaTarget", Number(e.target.value) || 13)} />
          </FormField>

          {/* Carriers Management */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textDim }}>Carriers ({Object.keys(config.carrierGroups || {}).length})</div>
              <span style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer" }} onClick={() => setShowAddGroup(true)}>+ Add Carrier</span>
            </div>
            {showAddGroup && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input style={{ ...S.input, flex: 1, padding: "4px 8px", fontSize: 12 }} placeholder="Carrier name..." value={addGroupName} onChange={e => setAddGroupName(e.target.value)} autoFocus onKeyDown={e => {
                  if (e.key === "Enter" && addGroupName.trim()) {
                    const groups = { ...(config.carrierGroups || {}), [addGroupName.trim()]: [] };
                    updateConfig("carrierGroups", groups);
                    setAddGroupName(""); setShowAddGroup(false);
                  }
                  if (e.key === "Escape") { setAddGroupName(""); setShowAddGroup(false); }
                }} />
                <button style={{ ...S.btn(), padding: "4px 12px", fontSize: 11 }} onClick={() => {
                  if (addGroupName.trim()) {
                    const groups = { ...(config.carrierGroups || {}), [addGroupName.trim()]: [] };
                    updateConfig("carrierGroups", groups);
                    setAddGroupName(""); setShowAddGroup(false);
                  }
                }}>Add</button>
                <button style={{ ...S.btn("ghost"), padding: "4px 8px", fontSize: 11 }} onClick={() => { setAddGroupName(""); setShowAddGroup(false); }}>Cancel</button>
              </div>
            )}
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {Object.keys(config.carrierGroups || {}).sort().map(carrier => (
                <div key={carrier} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", marginBottom: 2, background: `${COLORS.border}15`, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{carrier}</div>
                  <span style={{ fontSize: 11, color: COLORS.danger, cursor: "pointer" }} onClick={() => {
                    const groups = { ...(config.carrierGroups || {}) };
                    delete groups[carrier];
                    updateConfig("carrierGroups", groups);
                  }}>✕</span>
                </div>
              ))}
            </div>
          </div>

          {[
            { key: "lobOptions", label: "Lines of Business" },
            { key: "transactionTypes", label: "Transaction Types" },
            { key: "cancellationReasons", label: "Cancellation Reasons" },
            { key: "sources", label: "Lead Sources" },
            { key: "brokers", label: "Brokers (Commercial)" },
          ].map(({ key, label }) => (
            <div key={key} style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textDim }}>{label} ({config[key].length})</div>
                <span style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer" }} onClick={() => editSection === key ? saveEditList(key) : startEditList(key)}>
                  {editSection === key ? "Save" : "Edit"}
                </span>
              </div>
              {editSection === key ? (
                <textarea style={{ ...S.input, minHeight: 120, fontSize: 12, fontFamily: "monospace" }} value={editValue} onChange={e => setEditValue(e.target.value)} />
              ) : (
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  {config[key].map((item, i) => (
                    <div key={i} style={{ padding: "6px 12px", background: `${COLORS.border}20`, borderRadius: 4, marginBottom: 2, fontSize: 13 }}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <div style={S.card}>
            <div style={S.sectionTitle}><span>Export Data</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Service Items", type: "service", count: data.serviceItems.length },
                { label: "Clients", type: "clients", count: data.accounts.length },
                { label: "Policies", type: "policies", count: data.policies.length },
                { label: "Sales Log", type: "sales", count: data.salesLog.length },
              ].map(({ label, type, count }) => (
                <button key={type} style={{ ...S.btn("ghost"), justifyContent: "space-between", display: "flex", width: "100%" }} onClick={() => doExport(type)}>
                  <span>Export {label}</span>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>{count} records</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={S.sectionTitle}><span>Import from CSV</span></div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {["service","bob","sales","policy-update"].map(tab => (
                <span key={tab} style={S.pill(importTab === tab)} onClick={() => { setImportTab(tab); setCsvPreview(null); setImportMsg(""); setCsvText(""); }}>
                  {tab === "service" ? "Clients & Service" : tab === "bob" ? "📋 Book of Business" : tab === "policy-update" ? "✏️ Policy Update" : "Sales Log"}
                </span>
              ))}
            </div>

            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, padding: 8, background: `${COLORS.border}20`, borderRadius: 4 }}>
              {importTab === "service"
                ? "Paste any combination of client, policy, and service data. Auto-detects columns: Name, Phone, Email, Address, City, State, Zip, Carrier, LOB, Policy #, Premium, Transaction Type, Due Date, Status, Amount, Last Action, Next Step. Creates clients + policies automatically. Service items created when Transaction Type column is present."
                : importTab === "bob"
                ? "📋 Book of Business format — creates BOTH clients AND policies. Columns: First Name, Last Name, Entity Name, Policy #, Carrier, Premium, Effective Date, Expiration Date, Address, City, State, Zip. Works with Ivantage, EZLynx, and similar agency management exports."
                : importTab === "policy-update"
                ? "✏️ Update existing policies from a previously exported CSV. Use Settings → Export → Policies to get a CSV with IDs, edit in Excel, then re-import. Matches on the ID column to update Carrier, LOB, Policy #, Effective, Expiration, Premium, Status, Payment Plan, and Vehicles. Only non-empty fields are updated — blank cells are skipped."
                : "Columns: Date, Account, LOB, Carrier, Premium, Source, Type (New Business/Cross-Sell/Rewrite), Zip"}
              {importTab !== "bob" && <span style={{ display: "block", marginTop: 4 }}>Paste from Excel, Google Sheets, or CSV</span>}
            </div>

            <textarea
              style={{ ...S.input, minHeight: 120, fontSize: 11, fontFamily: "monospace" }}
              placeholder="Paste CSV data here (with header row)..."
              value={csvText} onChange={e => setCsvText(e.target.value)}
            />

            {importMsg && <div style={{ fontSize: 12, color: importMsg.startsWith("Imported") ? COLORS.success : COLORS.warning, marginTop: 8 }}>{importMsg}</div>}

            {csvPreview && (
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: COLORS.textDim, marginBottom: 4 }}>Preview: {csvPreview.rows.length} rows · {csvPreview.headers.length} columns</div>
                <div style={{ maxHeight: 120, overflowY: "auto", background: `${COLORS.border}15`, borderRadius: 4, padding: 8 }}>
                  <div style={{ fontWeight: 600, color: COLORS.accent }}>{csvPreview.headers.join(" | ")}</div>
                  {csvPreview.rows.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ color: COLORS.textDim, borderTop: `1px solid ${COLORS.border}20`, padding: "2px 0" }}>{r.map((v, ci) => `[${ci}]${v}`).join(" | ")}</div>
                  ))}
                  {csvPreview.rows.length > 3 && <div style={{ color: COLORS.textMuted }}>...and {csvPreview.rows.length - 3} more</div>}
                </div>
                {importTab === "bob" && (() => {
                  const h = csvPreview.headers;
                  const _col = (name) => h.findIndex(x => x.toLowerCase().includes(name.toLowerCase()));
                  const _colExact = (name) => h.findIndex(x => x.toLowerCase().trim() === name.toLowerCase());
                  const _fn = _col("first name") !== -1 ? _col("first name") : _colExact("first") !== -1 ? _colExact("first") : -1;
                  const _ln = _col("last name") !== -1 ? _col("last name") : _colExact("last") !== -1 ? _colExact("last") : -1;
                  const _full = _fn === -1 ? (_col("name") !== -1 ? _col("name") : _col("insured") !== -1 ? _col("insured") : _col("account")) : -1;
                  const _prem = _col("premium") !== -1 ? _col("premium") : _col("annual premium") !== -1 ? _col("annual premium") : _col("written premium");
                  const _pol = _col("policy") !== -1 ? _col("policy") : _col("pol #") !== -1 ? _col("pol #") : _col("pol#");
                  const _car = _col("carrier") !== -1 ? _col("carrier") : _col("company") !== -1 ? _col("company") : _col("writing co");
                  const _eff = _col("effective") !== -1 ? _col("effective") : _col("eff date") !== -1 ? _col("eff date") : _col("inception");
                  const _exp = _col("expir") !== -1 ? _col("expir") : _col("exp date") !== -1 ? _col("exp date") : _col("renewal");
                  const _lob = _col("lob") !== -1 ? _col("lob") : _col("line of business") !== -1 ? _col("line of business") : _col("coverage") !== -1 ? _col("coverage") : _col("product");
                  const _addr = _col("address") !== -1 ? _col("address") : _col("risk address") !== -1 ? _col("risk address") : _col("street");
                  const mappings = [
                    ["Name", _fn !== -1 ? `First[${_fn}]+Last[${_ln}]` : _full !== -1 ? `[${_full}] ${h[_full]}` : "❌"],
                    ["Policy #", _pol !== -1 ? `[${_pol}] ${h[_pol]}` : "❌"],
                    ["Carrier", _car !== -1 ? `[${_car}] ${h[_car]}` : "❌"],
                    ["LOB", _lob !== -1 ? `[${_lob}] ${h[_lob]}` : "❌"],
                    ["Premium", _prem !== -1 ? `[${_prem}] ${h[_prem]}` : "❌"],
                    ["Effective", _eff !== -1 ? `[${_eff}] ${h[_eff]}` : "❌"],
                    ["Expiration", _exp !== -1 ? `[${_exp}] ${h[_exp]}` : "❌"],
                    ["Address", _addr !== -1 ? `[${_addr}] ${h[_addr]}` : "❌"],
                  ];
                  const r0 = csvPreview.rows[0] || [];
                  return (
                    <div style={{ marginTop: 6, padding: 8, background: `${COLORS.accent}08`, borderRadius: 4, border: `1px solid ${COLORS.accent}20` }}>
                      <div style={{ fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>Column Mapping (row 1 sample)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        {mappings.map(([label, mapping]) => {
                          const colIdx = mapping.startsWith("[") ? parseInt(mapping.slice(1)) : -1;
                          const sampleVal = colIdx >= 0 && r0[colIdx] ? r0[colIdx] : "";
                          const detected = !mapping.includes("❌");
                          return (
                            <div key={label} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <span style={{ color: detected ? COLORS.success : COLORS.danger, fontWeight: 600 }}>{detected ? "✓" : "✕"}</span>
                              <span style={{ color: COLORS.textDim }}>{label}:</span>
                              <span style={{ color: detected ? COLORS.text : COLORS.danger, fontWeight: 500 }}>{sampleVal || mapping}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {!csvPreview ? (
                <button style={S.btn()} onClick={handlePreview} disabled={!csvText.trim()}>Preview Import</button>
              ) : (
                <button style={{ ...S.btn(), background: COLORS.success }} onClick={importTab === "service" ? handleImportUnified : importTab === "bob" ? handleImportBOB : importTab === "policy-update" ? handleImportPolicyUpdate : handleImportSales}>
                  Import {csvPreview.rows.length} {importTab === "service" ? "Records" : importTab === "bob" ? "BOB Records" : importTab === "policy-update" ? "Policy Updates" : "Sales Entries"}
                </button>
              )}
              {csvPreview && <button style={S.btn("ghost")} onClick={() => { setCsvPreview(null); setImportMsg(""); }}>Cancel</button>}
            </div>
          </div>

          {/* Carrier Payment Portals */}
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={S.sectionTitle}><span>🔗 Carrier Payment Portals</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>
              Map each carrier to their online payment URL. Used in outreach templates via the <span style={{ fontFamily: "monospace", background: `${COLORS.accent}15`, padding: "1px 4px", borderRadius: 3 }}>{"{paymentLink}"}</span> variable.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(config.carriers || []).map(carrier => {
                const portals = getCarrierPortals(config);
                const savedUrl = portals[carrier] || "";
                return <PortalUrlRow key={carrier} carrier={carrier} savedUrl={savedUrl} onSave={(val) => {
                  updateConfig("carrierPortals", { ...getCarrierPortals(config), [carrier]: val });
                }} />;
              })}
            </div>
          </div>

          {/* Import Cleanup Tool */}
          <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.warning}30` }}>
            <div style={S.sectionTitle}><span>🧹 Import Cleanup</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>
              Scan for and remove bad imports — finds clients created today with missing data (no phone, no email, no address) that look like a botched import.
            </div>
            {!cleanupResults ? (
              <button style={S.btn()} onClick={scanForBadImport}>Scan for Bad Imports</button>
            ) : cleanupResults.suspects.length === 0 ? (
              <div>
                <div style={{ fontSize: 13, color: COLORS.success, marginBottom: 8 }}>✓ No suspicious imports found. Your data looks clean.</div>
                <button style={S.btn("ghost")} onClick={() => setCleanupResults(null)}>Dismiss</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: COLORS.warning, fontWeight: 600, marginBottom: 8 }}>
                  Found {cleanupResults.suspects.length} suspicious client{cleanupResults.suspects.length !== 1 ? "s" : ""}
                  {cleanupResults.orphanPolicies.length > 0 && ` + ${cleanupResults.orphanPolicies.length} linked polic${cleanupResults.orphanPolicies.length !== 1 ? "ies" : "y"}`}
                  {cleanupResults.orphanItems.length > 0 && ` + ${cleanupResults.orphanItems.length} linked service item${cleanupResults.orphanItems.length !== 1 ? "s" : ""}`}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Uncheck any you want to KEEP. Checked items will be deleted.</div>
                <div style={{ maxHeight: 300, overflowY: "auto", background: `${COLORS.border}10`, borderRadius: 6, padding: 8, marginBottom: 12 }}>
                  {cleanupResults.suspects.map(a => {
                    const isExcluded = cleanupExclude.has(a.id);
                    const linkedPol = cleanupResults.orphanPolicies.filter(p => p.accountId === a.id);
                    return (
                      <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 4px", borderBottom: `1px solid ${COLORS.border}20`, opacity: isExcluded ? 0.4 : 1 }}>
                        <input type="checkbox" checked={!isExcluded} onChange={() => {
                          const next = new Set(cleanupExclude);
                          if (isExcluded) next.delete(a.id); else next.add(a.id);
                          setCleanupExclude(next);
                        }} style={{ marginTop: 3, cursor: "pointer" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isExcluded ? COLORS.textMuted : COLORS.text }}>{a.name}</div>
                          <div style={{ fontSize: 11, color: COLORS.textDim }}>
                            {a.city}{a.state ? `, ${a.state}` : ""} {a.zip || ""} · Created {a.created}
                            {!a.phone && !a.email && !a.address && <span style={{ color: COLORS.warning, marginLeft: 6 }}>⚠ No contact info</span>}
                          </div>
                          {linkedPol.length > 0 && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                            {linkedPol.length} linked polic{linkedPol.length !== 1 ? "ies" : "y"}: {linkedPol.map(p => p.policyNumber || p.carrier || "unknown").join(", ")}
                          </div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={{ ...S.btn(), background: COLORS.danger }} onClick={executeCleanup}>
                    Delete {cleanupResults.suspects.length - cleanupExclude.size} Client{cleanupResults.suspects.length - cleanupExclude.size !== 1 ? "s" : ""} & Linked Data
                  </button>
                  <button style={S.btn("ghost")} onClick={() => setCleanupResults(null)}>Cancel</button>
                  <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: "auto" }}>
                    {cleanupExclude.size > 0 && `Keeping ${cleanupExclude.size} · `}Removing {cleanupResults.suspects.length - cleanupExclude.size}
                  </span>
                </div>
              </div>
            )}
            {importMsg && importMsg.includes("Cleanup") && <div style={{ fontSize: 12, color: COLORS.success, marginTop: 8 }}>{importMsg}</div>}
          </div>

          {/* Normalize Carriers Tool */}
          <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.warning}30` }}>
            <div style={S.sectionTitle}><span>🔗 Normalize Carriers</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>
              Scans all policies and service items for carrier values that don't match your Carriers. Auto-matched carriers show in green. Unmatched carriers show a dropdown so you can pick the correct carrier, or add it as a new one.
            </div>
            {(() => {
              const cg = config.carrierGroups || {};
              const cgKeys = new Set(Object.keys(cg));
              const cgList = Object.keys(cg).sort();
              const mismatched = data.policies.filter(p => p.carrier && !cgKeys.has(p.carrier));
              const mismatchedSI = data.serviceItems.filter(si => si.carrier && !cgKeys.has(si.carrier));
              const rawCounts = {};
              mismatched.forEach(p => { rawCounts[p.carrier] = (rawCounts[p.carrier] || 0) + 1; });
              mismatchedSI.forEach(si => { rawCounts[si.carrier] = (rawCounts[si.carrier] || 0) + 1; });
              const rawEntries = Object.entries(rawCounts).sort((a, b) => b[1] - a[1]);

              // Compute final mapping for each raw value
              const getMapping = (raw) => {
                if (carrierOverrides[raw]) return carrierOverrides[raw];
                const auto = normalizeCarrier(raw, cg);
                return auto !== raw ? auto : "";
              };

              const allMapped = rawEntries.length > 0 && rawEntries.every(([raw]) => getMapping(raw));
              const mappedCount = rawEntries.filter(([raw]) => getMapping(raw)).length;

              return (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 10, padding: 8, background: `${COLORS.border}10`, borderRadius: 6 }}>
                    <div>📊 <strong>{mismatched.length}</strong> policies and <strong>{mismatchedSI.length}</strong> service items with non-standard carriers</div>
                    {rawEntries.length > 0 && (
                      <div style={{ marginTop: 8, maxHeight: 300, overflowY: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 1fr", gap: "4px 8px", alignItems: "center", fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }}>Current Value</div>
                          <div style={{ fontWeight: 700, color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }}>Count</div>
                          <div style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }} />
                          <div style={{ fontWeight: 700, color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }}>Maps To</div>
                          {rawEntries.map(([raw, count]) => {
                            const autoMapped = normalizeCarrier(raw, cg);
                            const isAutoMatch = autoMapped !== raw;
                            const override = carrierOverrides[raw] || "";
                            const finalMap = override || (isAutoMatch ? autoMapped : "");
                            return (
                              <React.Fragment key={raw}>
                                <div style={{ color: COLORS.danger, fontWeight: 500, padding: "3px 0" }}>"{raw}"</div>
                                <div style={{ color: COLORS.textMuted, textAlign: "center" }}>×{count}</div>
                                <div style={{ color: COLORS.textMuted }}>→</div>
                                <div style={{ padding: "2px 0" }}>
                                  {isAutoMatch && !override ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ color: COLORS.success, fontWeight: 600 }}>"{autoMapped}"</span>
                                      <button style={{ fontSize: 10, color: COLORS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                                        onClick={() => setCarrierOverrides(prev => ({ ...prev, [raw]: autoMapped }))}>change</button>
                                    </div>
                                  ) : (
                                    <select data-no-nav-keys="true" style={{ ...S.input, padding: "2px 4px", fontSize: 11, width: "100%", maxWidth: 280,
                                      borderColor: finalMap ? COLORS.success : COLORS.warning, color: finalMap ? COLORS.text : COLORS.warning
                                    }} value={override} onChange={e => {
                                      const val = e.target.value;
                                      if (val === "__ADD_NEW__") {
                                        // Add this raw value as a new carrier group
                                        const groups = { ...cg, [raw]: [] };
                                        updateConfig("carrierGroups", groups);
                                        setCarrierOverrides(prev => { const n = { ...prev }; delete n[raw]; return n; });
                                      } else {
                                        setCarrierOverrides(prev => ({ ...prev, [raw]: val }));
                                      }
                                    }}>
                                      <option value="">— Select carrier group —</option>
                                      {cgList.map(g => <option key={g} value={g}>{g}</option>)}
                                      <option value="__ADD_NEW__">➕ Add "{raw}" as new group</option>
                                    </select>
                                  )}
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {rawEntries.length === 0 && <div style={{ color: COLORS.success, marginTop: 4 }}>✓ All carriers match your Carriers</div>}
                  </div>
                  {rawEntries.length > 0 && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button style={{ ...S.btn(), background: allMapped ? COLORS.success : COLORS.warning, opacity: mappedCount === 0 ? 0.5 : 1 }}
                        disabled={mappedCount === 0}
                        onClick={() => {
                          let polFixed = 0, siFixed = 0;
                          const updatedPolicies = data.policies.map(p => {
                            if (!p.carrier || cgKeys.has(p.carrier)) return p;
                            const mapped = carrierOverrides[p.carrier] || (normalizeCarrier(p.carrier, cg) !== p.carrier ? normalizeCarrier(p.carrier, cg) : "");
                            if (mapped && mapped !== p.carrier) { polFixed++; return { ...p, carrier: mapped }; }
                            return p;
                          });
                          const updatedSI = data.serviceItems.map(si => {
                            if (!si.carrier || cgKeys.has(si.carrier)) return si;
                            const mapped = carrierOverrides[si.carrier] || (normalizeCarrier(si.carrier, cg) !== si.carrier ? normalizeCarrier(si.carrier, cg) : "");
                            if (mapped && mapped !== si.carrier) { siFixed++; return { ...si, carrier: mapped }; }
                            return si;
                          });
                          setData({ ...data, policies: updatedPolicies, serviceItems: updatedSI }, { undo: true, message: `Normalized ${polFixed} policies, ${siFixed} service items` });
                          setImportMsg(`Normalized carriers: ${polFixed} policies and ${siFixed} service items updated`);
                          setCarrierOverrides({});
                        }}>
                        Normalize {allMapped ? "All" : `${mappedCount} of ${rawEntries.length}`} Carriers
                      </button>
                      {!allMapped && <span style={{ fontSize: 11, color: COLORS.warning }}>⚠ {rawEntries.length - mappedCount} unmatched — pick a group or add new</span>}
                    </div>
                  )}
                </div>
              );
            })()}
            {importMsg && importMsg.includes("Normalized carriers") && <div style={{ fontSize: 12, color: COLORS.success, marginTop: 8 }}>{importMsg}</div>}
          </div>

          {/* Rebuild Service Items Tool */}
          <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.info}30` }}>
            <div style={S.sectionTitle}><span>🔄 Rebuild Service Items from Policies</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>
              Deletes all existing Ivantage Renewal service items and regenerates them for active policies expiring within renewal window (55 days personal, 150 days commercial). Use after a bad import left broken service items.
            </div>
            {(() => {
              const existingRenewals = data.serviceItems.filter(si => si.type === "Ivantage Renewal");
              const noDueDateCount = existingRenewals.filter(si => !si.dueDate).length;
              const noLobCount = existingRenewals.filter(si => {
                const pol = data.policies.find(p => p.id === si.policyId);
                return !si.lob && (!pol || !pol.lob);
              }).length;
              const overdueCount = existingRenewals.filter(si => si.dueDate && si.dueDate < today() && si.status !== "Completed" && si.status !== "Auto Pay").length;
              return (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 10, padding: 8, background: `${COLORS.border}10`, borderRadius: 6 }}>
                    <div>📊 Current: <strong>{existingRenewals.length}</strong> Ivantage Renewals · <strong>{data.policies.length}</strong> policies</div>
                    {noDueDateCount > 0 && <div style={{ color: COLORS.danger }}>⚠ {noDueDateCount} with no due date</div>}
                    {noLobCount > 0 && <div style={{ color: COLORS.warning }}>⚠ {noLobCount} with no LOB</div>}
                    {overdueCount > 0 && <div style={{ color: COLORS.warning }}>⚠ {overdueCount} overdue</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...S.btn(), background: COLORS.info }} onClick={() => {
                      const oldRenewalIds = new Set(data.serviceItems.filter(si => si.type === "Ivantage Renewal").map(si => si.id));
                      const nonRenewalItems = data.serviceItems.filter(si => si.type !== "Ivantage Renewal");
                      const newItems = data.policies.filter(pol => {
                        if (pol.status !== "Active" || !pol.expirationDate) return false;
                        const d = daysBetween(today(), pol.expirationDate);
                        return d >= 0 && d <= 45;
                      }).map(pol => {
                        const acct = data.accounts.find(a => a.id === pol.accountId);
                        const d = daysBetween(today(), pol.expirationDate);
                        return {
                          id: uid(), type: "Ivantage Renewal", accountId: pol.accountId, accountName: pol.accountName || (acct ? acct.name : ""),
                          policyId: pol.id, policyNumber: pol.policyNumber, carrier: pol.carrier, lob: pol.lob || pol.lineOfBusiness || "",
                          description: `${pol.carrier} ${pol.lob || ""} Renewal`.trim(), dueDate: pol.expirationDate || today(),
                          amountDue: pol.premium || 0, status: "Uncontacted", urgency: d <= 14 ? "High" : "Medium",
                          assignedTo: config.agentName || "Agent", created: today(), lastAction: "", lastActionDate: "",
                          followUpDate: "", notes: "", ballInCourt: false, flags: [], contactAttempts: []
                        };
                      });
                      const updated = { ...data, serviceItems: [...nonRenewalItems, ...newItems] };
                      setData(updated, { undo: true, message: `Rebuilt ${newItems.length} service items (replaced ${oldRenewalIds.size})` });
                      setImportMsg(`Rebuilt ${newItems.length} Ivantage Renewal service items from ${data.policies.length} policies (removed ${oldRenewalIds.size} old items)`);
                    }}>
                      Rebuild Renewals (policies expiring within renewal window (55 days personal, 150 days commercial))
                    </button>
                  </div>
                </div>
              );
            })()}
            {importMsg && importMsg.includes("Rebuilt") && <div style={{ fontSize: 12, color: COLORS.success, marginTop: 8 }}>{importMsg}</div>}
          </div>

          {/* Backup & Restore */}
          <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.success}30` }}>
            <div style={S.sectionTitle}><span>💾 Backup & Restore</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>Export your entire database as a JSON file. Restore from a previous backup at any time.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button style={S.btn()} onClick={() => {
                const backup = { version: APP_VERSION, exportedAt: new Date().toISOString(), config: loadConfig(), data };
                const jsonStr = JSON.stringify(backup, null, 2);
                if (_exportCallback) _exportCallback({ csv: jsonStr, filename: `sentinel-backup-${today()}.json` });
                try { localStorage.setItem("sentinel_last_backup", new Date().toISOString()); } catch {}
              }}>📥 Export Full Backup</button>
              <button style={S.btn("ghost")} onClick={() => document.getElementById("backup-restore-input").click()}>📤 Restore from Backup</button>
              <input id="backup-restore-input" type="file" accept=".json" style={{ display: "none" }} onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const backup = JSON.parse(ev.target.result);
                    if (!backup.data || !backup.data.accounts) { setImportMsg("Invalid backup file — missing data structure."); return; }
                    if (backup.config) { saveConfig(backup.config); setConfigState(backup.config); if (onConfigChange) onConfigChange(backup.config); }
                    const restored = migrateData(backup.data);
                    setData(restored);
                    setImportMsg("Backup restored successfully!");
                  } catch (err) { setImportMsg("Error reading backup: " + err.message); }
                };
                reader.readAsText(file);
                e.target.value = "";
              }} />
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim }}>💡 Data persists across artifact updates. Back up regularly as extra protection.</div>
          </div>

          {/* Commission Rates */}
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={S.sectionTitle}><span>💰 Commission Rates</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>Set commission percentages by carrier + LOB. Used in the Production Report commission tracker.</div>
            {(() => {
              const rates = config.commissionRates || {};
              const rateEntries = Object.entries(rates).filter(([k]) => k !== "default").sort();
              return (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim }}>Carrier | LOB</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim }}>Rate %</div>
                    <div />
                  </div>
                  {rateEntries.map(([key, rate]) => (
                    <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontSize: 12 }}>{key.replace("|", " → ")}</div>
                      <input style={{ ...S.input, width: 80 }} type="number" min="0" max="100" value={rate}
                        onChange={e => {
                          const newRates = { ...config.commissionRates, [key]: Number(e.target.value) || 0 };
                          const newConfig = { ...config, commissionRates: newRates };
                          setConfigState(newConfig); saveConfig(newConfig); if (onConfigChange) onConfigChange(newConfig);
                        }} />
                      <button style={{ ...S.btn("ghost"), padding: "2px 6px", fontSize: 10, color: COLORS.danger }} onClick={() => {
                        const newRates = { ...config.commissionRates }; delete newRates[key];
                        const newConfig = { ...config, commissionRates: newRates };
                        setConfigState(newConfig); saveConfig(newConfig); if (onConfigChange) onConfigChange(newConfig);
                      }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>Default rate:</div>
                    <input style={{ ...S.input, width: 80 }} type="number" min="0" max="100" value={rates["default"] || 10}
                      onChange={e => {
                        const newRates = { ...config.commissionRates, default: Number(e.target.value) || 10 };
                        const newConfig = { ...config, commissionRates: newRates };
                        setConfigState(newConfig); saveConfig(newConfig); if (onConfigChange) onConfigChange(newConfig);
                      }} />
                    <div />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <select id="new-comm-carrier" style={{ ...S.input, flex: 1 }}>
                      {config.carriers.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select id="new-comm-lob" style={{ ...S.input, flex: 1 }}>
                      {(config.lobOptions || LOB_OPTIONS).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button style={S.btn()} onClick={() => {
                      const carrier = document.getElementById("new-comm-carrier").value;
                      const lob = document.getElementById("new-comm-lob").value;
                      const key = `${carrier}|${lob}`;
                      if (config.commissionRates[key] !== undefined) return;
                      const newRates = { ...config.commissionRates, [key]: 10 };
                      const newConfig = { ...config, commissionRates: newRates };
                      setConfigState(newConfig); saveConfig(newConfig); if (onConfigChange) onConfigChange(newConfig);
                    }}>+ Add</button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Monthly Overhead */}
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={S.sectionTitle}><span>Monthly Overhead</span></div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>Used in commission tracker to calculate annual net income.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>$</span>
              <input style={{ ...S.input, width: 120 }} type="number" value={config.monthlyOverhead || 15000}
                onChange={e => {
                  const newConfig = { ...config, monthlyOverhead: Number(e.target.value) || 0 };
                  setConfigState(newConfig); saveConfig(newConfig); if (onConfigChange) onConfigChange(newConfig);
                }} />
              <span style={{ fontSize: 12, color: COLORS.textDim }}>/month</span>
            </div>
          </div>

          <div style={{ ...S.card, marginTop: 16, border: `1px solid ${COLORS.danger}30` }}>
            <div style={S.sectionTitle}><span style={{ color: COLORS.danger }}>Danger Zone</span></div>
            {!confirmAction ? (
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={{ ...S.btn("ghost"), color: COLORS.danger, borderColor: `${COLORS.danger}40` }} onClick={() => setConfirmAction("clear")}>Clear All Data (Start Fresh)</button>
                  <button style={{ ...S.btn("ghost"), color: COLORS.danger, borderColor: `${COLORS.danger}40` }} onClick={() => setConfirmAction("reset")}>Full Reset (Load Demo Data)</button>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                  <strong>Clear All Data</strong> = empty slate, keeps your settings · <strong>Full Reset</strong> = load demo data + reset all settings to defaults
                </div>
              </div>
            ) : (
              <div style={{ padding: 16, background: `${COLORS.danger}10`, borderRadius: 8, border: `1px solid ${COLORS.danger}30` }}>
                <div style={{ fontWeight: 700, color: COLORS.danger, marginBottom: 8 }}>
                  {confirmAction === "clear" ? "Clear all data?" : "Full reset — load demo data?"}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 12 }}>
                  {confirmAction === "clear"
                    ? "This will delete all clients, policies, tasks, service items, sales, and prospects. Your settings and carrier groups will be kept."
                    : "This will delete ALL data AND reset all settings back to defaults, replacing everything with demo data. This cannot be undone."}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.btn(), background: COLORS.danger }} onClick={() => {
                    if (confirmAction === "clear") {
                      setData(createEmptyData());
                    } else {
                      // Full reset: reload demo data + reset settings
                      const seed = createSeedData();
                      setData(seed);
                      const defaultCfg = { ...DEFAULT_CONFIG };
                      saveConfig(defaultCfg); // writes to both localStorage + window.storage
                      setConfigState(defaultCfg);
                      if (onConfigChange) onConfigChange(defaultCfg);
                    }
                    setConfirmAction(null);
                  }}>Yes, {confirmAction === "clear" ? "Clear Everything" : "Reset & Load Demo Data"}</button>
                  <button style={S.btn("ghost")} onClick={() => setConfirmAction(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== ACORD 25 FORM RENDERER ====================
function Acord25Print({ cert, account, policies, config, onClose }) {
  const printRef = useRef(null);
  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=850,height=1100");
    win.document.write(`<!DOCTYPE html><html><head><title>ACORD 25 - ${account?.name || "Certificate"}</title><style>${acordCSS}</style></head><body>`);
    win.document.write(content.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const linkedPols = (cert.policyIds || []).map(pid => policies.find(p => p.id === pid)).filter(Boolean);
  const matchLob = (filter) => linkedPols.filter(p => filter((p.lob || "").toLowerCase()));
  const gl = matchLob(l => l.includes("gl") || l.includes("bop") || l.includes("general liability"))[0] || null;
  const auto = matchLob(l => l.includes("auto"))[0] || null;
  const umb = matchLob(l => l.includes("umbrella") || l.includes("excess"))[0] || null;
  const wc = matchLob(l => l.includes("worker") || l.includes("wc") || l.includes("comp"))[0] || null;

  // Unique carriers for insurer grid
  const carriers = [...new Set(linkedPols.map(p => p.carrier).filter(Boolean))];
  const carrierLetter = (carrier) => { const idx = carriers.indexOf(carrier); return idx >= 0 ? String.fromCharCode(65 + idx) : ""; };

  const fmtD = (d) => { if (!d) return ""; const dt = new Date(d + "T12:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
  const chk = (v) => v ? "X" : "";

  const acordCSS = `
@media print { body { margin: 0; } @page { size: letter; margin: 0.25in; } }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; margin: 0; padding: 0; }
.a25 { width: 7.5in; margin: 0 auto; padding: 0.15in 0; }
.bdr { border: 1.5px solid #000; }
.bdr-t { border-top: 1.5px solid #000; }
.bdr-b { border-bottom: 1.5px solid #000; }
.bdr-l { border-left: 1.5px solid #000; }
.bdr-r { border-right: 1.5px solid #000; }
.bdr-thin { border: 0.75px solid #000; }
.cell { padding: 1px 3px; vertical-align: top; }
.lbl { font-size: 5.5pt; color: #000; display: block; line-height: 1.1; }
.val { font-size: 8pt; font-weight: normal; display: block; min-height: 10px; line-height: 1.3; }
.val-b { font-size: 8pt; font-weight: bold; display: block; min-height: 10px; }
.hdr-bg { background: #d4dff0; }
.chk { display: inline-block; width: 8px; height: 8px; border: 1px solid #000; text-align: center; font-size: 6pt; line-height: 8px; vertical-align: middle; margin-right: 1px; font-weight: bold; }
.section-lbl { font-size: 6pt; font-weight: bold; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; padding: 0; }
`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} data-modal="true" onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, width: "95%", maxWidth: 820, maxHeight: "92vh", overflow: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`, borderRadius: "8px 8px 0 0", position: "sticky", top: 0, zIndex: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>ACORD 25 Preview</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.btn(), fontSize: 12 }} onClick={handlePrint}>Print / Save PDF</button>
            <button style={{ ...S.btn("ghost"), fontSize: 12, color: COLORS.textDim }} onClick={onClose}>Close</button>
          </div>
        </div>
        <div ref={printRef}>
          <style dangerouslySetInnerHTML={{ __html: acordCSS }} />
          <div className="a25" style={{ color: "#000", background: "#fff" }}>

            {/* ===== ROW 1: ACORD logo + Title + Date ===== */}
            <table className="bdr" style={{ marginBottom: 0 }}><tbody>
              <tr>
                <td style={{ width: "12%", padding: "4px 6px", verticalAlign: "middle" }}>
                  <div style={{ fontWeight: "bold", fontSize: "14pt", fontStyle: "italic", letterSpacing: "-0.5px" }}>ACORD<sup style={{ fontSize: "6pt" }}>&reg;</sup></div>
                </td>
                <td style={{ textAlign: "center", padding: "4px 8px", verticalAlign: "middle" }}>
                  <div style={{ fontSize: "13pt", fontWeight: "bold", letterSpacing: "1px" }}>CERTIFICATE OF LIABILITY INSURANCE</div>
                </td>
                <td className="bdr-l" style={{ width: "18%", padding: "2px 4px" }}>
                  <span className="lbl">DATE (MM/DD/YYYY)</span>
                  <span className="val-b" style={{ fontSize: "9pt" }}>{fmtD(cert.issuedDate || today())}</span>
                </td>
              </tr>
            </tbody></table>

            {/* ===== Disclaimer ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                <td style={{ padding: "3px 5px", fontSize: "6pt", lineHeight: 1.3 }}>
                  THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER. THIS CERTIFICATE DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED BY THE POLICIES BELOW. THIS CERTIFICATE OF INSURANCE DOES NOT CONSTITUTE A CONTRACT BETWEEN THE ISSUING INSURER(S), AUTHORIZED REPRESENTATIVE OR PRODUCER, AND THE CERTIFICATE HOLDER.
                </td>
              </tr>
            </tbody></table>

            {/* ===== IMPORTANT notice ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                <td style={{ padding: "3px 5px", fontSize: "6pt", lineHeight: 1.3 }}>
                  <strong>IMPORTANT:</strong> If the certificate holder is an ADDITIONAL INSURED, the policy(ies) must be endorsed. If SUBROGATION IS WAIVED, subject to the terms and conditions of the policy, certain policies may require an endorsement. A statement on this certificate does not confer rights to the certificate holder in lieu of such endorsement(s).
                </td>
              </tr>
            </tbody></table>

            {/* ===== PRODUCER / CONTACT / INSURED / INSURERS ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                {/* Producer - left column */}
                <td className="bdr-r" style={{ width: "42%", padding: 0 }} rowSpan={2}>
                  <div style={{ padding: "2px 4px" }}>
                    <span className="lbl">PRODUCER</span>
                    <div className="val-b">{config.agencyName || ""}</div>
                    <div className="val">{config.agentAddress || "2598 E Sunrise Blvd"}</div>
                    <div className="val">{config.agentSuite || "Suite 2104, #2090"}</div>
                    <div className="val">{config.agentCityStateZip || "Fort Lauderdale    FL    33304"}</div>
                  </div>
                </td>
                {/* Contact info - top right */}
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody>
                    <tr>
                      <td className="bdr-r bdr-b cell" style={{ width: "50%" }}>
                        <span className="lbl">CONTACT NAME:</span>
                        <span className="val">{config.agentName || ""}</span>
                      </td>
                      <td className="cell bdr-b" style={{ width: "50%" }}>
                        <table style={{ width: "100%" }}><tbody><tr>
                          <td className="bdr-r cell" style={{ width: "60%" }}>
                            <span className="lbl">PHONE (A/C, No, Ext):</span>
                            <span className="val">{config.agentPhone || ""}</span>
                          </td>
                          <td className="cell">
                            <span className="lbl">FAX (A/C, No):</span>
                            <span className="val">{config.agentFax || ""}</span>
                          </td>
                        </tr></tbody></table>
                      </td>
                    </tr>
                    <tr>
                      <td className="cell bdr-r" colSpan={2}>
                        <span className="lbl">E-MAIL ADDRESS:</span>
                        <span className="val">{config.agentEmail || ""}</span>
                      </td>
                    </tr>
                  </tbody></table>
                </td>
              </tr>
              <tr>
                {/* Insurers - right side */}
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody>
                    <tr><td className="bdr-t cell" colSpan={3} style={{ padding: "1px 3px" }}><span className="lbl" style={{ fontWeight: "bold" }}>INSURER(S) AFFORDING COVERAGE</span></td><td className="bdr-t bdr-l cell" style={{ width: "12%" }}><span className="lbl">NAIC #</span></td></tr>
                    {[0,1,2,3,4,5].map(i => (
                      <tr key={i}>
                        <td className="bdr-t cell" style={{ width: "15%" }}><span className="lbl">INSURER {String.fromCharCode(65+i)} :</span></td>
                        <td className="bdr-t cell" colSpan={2}><span className="val">{carriers[i] || ""}</span></td>
                        <td className="bdr-t bdr-l cell"><span className="val"></span></td>
                      </tr>
                    ))}
                  </tbody></table>
                </td>
              </tr>
            </tbody></table>

            {/* ===== INSURED ===== */}
            <table className="bdr" style={{ borderTop: "none", marginTop: -1 }}><tbody>
              <tr>
                <td style={{ width: "42%", padding: "2px 4px" }} className="bdr-r">
                  <span className="lbl">INSURED</span>
                  <div className="val-b">{account?.name || ""}</div>
                  <div className="val">{account?.address || ""}</div>
                  <div className="val">{[account?.city, account?.state, account?.zip].filter(Boolean).join("    ")}</div>
                </td>
                <td style={{ padding: 0, verticalAlign: "top" }}>
                  {/* empty right side aligns with insurers above */}
                </td>
              </tr>
            </tbody></table>

            {/* ===== COVERAGES HEADER ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr className="hdr-bg">
                <td style={{ padding: "2px 4px", width: "30%" }}><span className="section-lbl">COVERAGES</span></td>
                <td className="bdr-l" style={{ padding: "2px 4px", width: "35%" }}><span className="section-lbl">CERTIFICATE NUMBER:</span></td>
                <td className="bdr-l" style={{ padding: "2px 4px", width: "35%" }}><span className="section-lbl">REVISION NUMBER:</span></td>
              </tr>
            </tbody></table>
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                <td style={{ padding: "2px 4px", fontSize: "5.5pt", lineHeight: 1.3 }}>
                  THIS IS TO CERTIFY THAT THE POLICIES OF INSURANCE LISTED BELOW HAVE BEEN ISSUED TO THE INSURED NAMED ABOVE FOR THE POLICY PERIOD INDICATED. NOTWITHSTANDING ANY REQUIREMENT, TERM OR CONDITION OF ANY CONTRACT OR OTHER DOCUMENT WITH RESPECT TO WHICH THIS CERTIFICATE MAY BE ISSUED OR MAY PERTAIN, THE INSURANCE AFFORDED BY THE POLICIES DESCRIBED HEREIN IS SUBJECT TO ALL THE TERMS, EXCLUSIONS AND CONDITIONS OF SUCH POLICIES. LIMITS SHOWN MAY HAVE BEEN REDUCED BY PAID CLAIMS.
                </td>
              </tr>
            </tbody></table>

            {/* ===== COVERAGE TABLE HEADER ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr className="hdr-bg" style={{ fontSize: "5.5pt", fontWeight: "bold" }}>
                <td className="bdr-r cell" style={{ width: "4%" }}><span className="lbl">INSR LTR</span></td>
                <td className="bdr-r cell" style={{ width: "23%" }}><span className="lbl">TYPE OF INSURANCE</span></td>
                <td className="bdr-r cell" style={{ width: "4%", textAlign: "center" }}><span className="lbl">ADDL INSD</span></td>
                <td className="bdr-r cell" style={{ width: "4%", textAlign: "center" }}><span className="lbl">SUBR WVD</span></td>
                <td className="bdr-r cell" style={{ width: "16%" }}><span className="lbl">POLICY NUMBER</span></td>
                <td className="bdr-r cell" style={{ width: "11%", textAlign: "center" }}><span className="lbl">POLICY EFF (MM/DD/YYYY)</span></td>
                <td className="bdr-r cell" style={{ width: "11%", textAlign: "center" }}><span className="lbl">POLICY EXP (MM/DD/YYYY)</span></td>
                <td className="cell" style={{ width: "27%" }}><span className="lbl">LIMITS</span></td>
              </tr>

              {/* ===== GENERAL LIABILITY ===== */}
              <tr>
                <td className="bdr-r bdr-t cell" rowSpan={4} style={{ textAlign: "center" }}>
                  <span className="val">{gl ? carrierLetter(gl.carrier) : ""}</span>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={4}>
                  <div style={{ fontWeight: "bold", fontSize: "6.5pt" }}>GENERAL LIABILITY</div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ marginLeft: 8, fontSize: "6.5pt" }}>COMMERCIAL GENERAL LIABILITY</span>
                  </div>
                  <div style={{ marginTop: 1, display: "flex", gap: 8, marginLeft: 8 }}>
                    <span><span className="chk">{gl ? "" : ""}</span> CLAIMS-MADE</span>
                    <span><span className="chk">{chk(gl)}</span> OCCUR</span>
                  </div>
                  <div style={{ marginTop: 6 }}></div>
                  <div style={{ fontSize: "6pt", marginTop: 2 }}>GEN'L AGGREGATE LIMIT APPLIES PER:</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
                    <span><span className="chk">X</span> POLICY</span>
                    <span><span className="chk"></span> PROJECT</span>
                    <span><span className="chk"></span> LOC</span>
                  </div>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={4} style={{ textAlign: "center" }}><span className="val">{chk(cert.additionalInsured && gl)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={4} style={{ textAlign: "center" }}><span className="val">{chk(cert.waiverOfSubrogation && gl)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={4}><span className="val">{gl?.policyNumber || ""}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={4} style={{ textAlign: "center" }}><span className="val">{fmtD(gl?.effectiveDate)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={4} style={{ textAlign: "center" }}><span className="val">{fmtD(gl?.expirationDate)}</span></td>
                {/* Limits column - row 1 */}
                <td className="bdr-t" style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="cell" style={{ width: "70%", fontSize: "6pt" }}>EACH OCCURRENCE</td>
                    <td className="bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "1,000,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>DAMAGE TO RENTED PREMISES (Ea occurrence)</td>
                    <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "100,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>MED EXP (Any one person)</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "5,000" : ""}</td>
                    </tr>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>PERSONAL &amp; ADV INJURY</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "1,000,000" : ""}</td>
                    </tr>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>GENERAL AGGREGATE</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "2,000,000" : ""}</td>
                    </tr>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>PRODUCTS - COMP/OP AGG</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {gl ? "2,000,000" : ""}</td>
                    </tr>
                  </tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}></td>
                    <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$</td>
                  </tr></tbody></table>
                </td>
              </tr>

              {/* ===== AUTOMOBILE LIABILITY ===== */}
              <tr>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}>
                  <span className="val">{auto ? carrierLetter(auto.carrier) : ""}</span>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={3}>
                  <div style={{ fontWeight: "bold", fontSize: "6.5pt" }}>AUTOMOBILE LIABILITY</div>
                  <div style={{ marginTop: 2, marginLeft: 4 }}>
                    <div><span className="chk">{chk(auto)}</span> ANY AUTO</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 1 }}>
                      <div><span className="chk"></span> ALL OWNED AUTOS</div>
                      <div><span className="chk"></span> SCHEDULED AUTOS</div>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 1 }}>
                      <div><span className="chk"></span> HIRED AUTOS</div>
                      <div><span className="chk"></span> NON-OWNED AUTOS</div>
                    </div>
                  </div>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{chk(cert.additionalInsured && auto)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{chk(cert.waiverOfSubrogation && auto)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3}><span className="val">{auto?.policyNumber || ""}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{fmtD(auto?.effectiveDate)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{fmtD(auto?.expirationDate)}</span></td>
                <td className="bdr-t" style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="cell" style={{ width: "70%", fontSize: "6pt" }}>COMBINED SINGLE LIMIT (Ea accident)</td>
                    <td className="bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {auto ? "1,000,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>BODILY INJURY (Per person)</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$</td>
                    </tr>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>BODILY INJURY (Per accident)</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$</td>
                    </tr>
                  </tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>PROPERTY DAMAGE (Per accident)</td>
                    <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$</td>
                  </tr></tbody></table>
                </td>
              </tr>

              {/* ===== UMBRELLA LIAB ===== */}
              <tr>
                <td className="bdr-r bdr-t cell" rowSpan={2} style={{ textAlign: "center" }}>
                  <span className="val">{umb ? carrierLetter(umb.carrier) : ""}</span>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={2}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span><span className="chk">{chk(umb)}</span> <strong style={{ fontSize: "6.5pt" }}>UMBRELLA LIAB</strong></span>
                    <span><span className="chk">{chk(umb)}</span> OCCUR</span>
                  </div>
                  <div style={{ marginTop: 1 }}>
                    <span><span className="chk"></span> <strong style={{ fontSize: "6.5pt" }}>EXCESS LIAB</strong></span>
                    <span style={{ marginLeft: 8 }}><span className="chk"></span> CLAIMS-MADE</span>
                  </div>
                  <div style={{ marginTop: 1, fontSize: "6pt" }}>DED <span className="chk"></span> RETENTION $</div>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={2} style={{ textAlign: "center" }}><span className="val"></span></td>
                <td className="bdr-r bdr-t cell" rowSpan={2} style={{ textAlign: "center" }}><span className="val"></span></td>
                <td className="bdr-r bdr-t cell" rowSpan={2}><span className="val">{umb?.policyNumber || ""}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={2} style={{ textAlign: "center" }}><span className="val">{fmtD(umb?.effectiveDate)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={2} style={{ textAlign: "center" }}><span className="val">{fmtD(umb?.expirationDate)}</span></td>
                <td className="bdr-t" style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="cell" style={{ width: "70%", fontSize: "6pt" }}>EACH OCCURRENCE</td>
                    <td className="bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {umb ? "1,000,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>AGGREGATE</td>
                    <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {umb ? "2,000,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>

              {/* ===== WORKERS COMPENSATION ===== */}
              <tr>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}>
                  <span className="val">{wc ? carrierLetter(wc.carrier) : ""}</span>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={3}>
                  <div style={{ fontWeight: "bold", fontSize: "6.5pt" }}>WORKERS COMPENSATION</div>
                  <div style={{ fontSize: "6.5pt" }}>AND EMPLOYERS' LIABILITY</div>
                  <div style={{ fontSize: "5.5pt", marginTop: 1 }}>ANY PROPRIETOR/PARTNER/EXECUTIVE <strong>Y / N</strong></div>
                  <div style={{ fontSize: "5.5pt" }}>OFFICER/MEMBER EXCLUDED?</div>
                  <div style={{ fontSize: "5pt" }}>(Mandatory in NH)</div>
                  <div style={{ fontSize: "5.5pt" }}>If yes, describe under</div>
                  <div style={{ fontSize: "5.5pt" }}>DESCRIPTION OF OPERATIONS below</div>
                </td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">N / A</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3}><span className="val">{wc?.policyNumber || ""}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{fmtD(wc?.effectiveDate)}</span></td>
                <td className="bdr-r bdr-t cell" rowSpan={3} style={{ textAlign: "center" }}><span className="val">{fmtD(wc?.expirationDate)}</span></td>
                <td className="bdr-t" style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="cell" style={{ width: "40%", fontSize: "6pt" }}></td>
                    <td className="bdr-l cell" style={{ textAlign: "center", fontSize: "6pt", fontWeight: "bold" }}>WC STATU-TORY LIMITS</td>
                    <td className="bdr-l cell" style={{ textAlign: "center", fontSize: "6pt", fontWeight: "bold" }}>OTH-ER</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody><tr>
                    <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>E.L. EACH ACCIDENT</td>
                    <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {wc ? "1,000,000" : ""}</td>
                  </tr></tbody></table>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 0 }}>
                  <table style={{ width: "100%" }}><tbody>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>E.L. DISEASE - EA EMPLOYEE</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {wc ? "1,000,000" : ""}</td>
                    </tr>
                    <tr>
                      <td className="bdr-t cell" style={{ width: "70%", fontSize: "6pt" }}>E.L. DISEASE - POLICY LIMIT</td>
                      <td className="bdr-t bdr-l cell" style={{ textAlign: "right", fontSize: "7pt" }}>$ {wc ? "1,000,000" : ""}</td>
                    </tr>
                  </tbody></table>
                </td>
              </tr>

              {/* ===== Extra rows (blank) ===== */}
              <tr>
                <td className="bdr-r bdr-t cell" style={{ textAlign: "center", minHeight: 20 }}><span className="val"></span></td>
                <td className="bdr-r bdr-t cell"></td>
                <td className="bdr-r bdr-t cell" style={{ textAlign: "center" }}></td>
                <td className="bdr-r bdr-t cell" style={{ textAlign: "center" }}></td>
                <td className="bdr-r bdr-t cell"></td>
                <td className="bdr-r bdr-t cell" style={{ textAlign: "center" }}></td>
                <td className="bdr-r bdr-t cell" style={{ textAlign: "center" }}></td>
                <td className="bdr-t cell"></td>
              </tr>
            </tbody></table>

            {/* ===== DESCRIPTION OF OPERATIONS ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                <td style={{ padding: "2px 4px" }}>
                  <span className="lbl" style={{ fontWeight: "bold" }}>DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES (Attach ACORD 101, Additional Remarks Schedule, if more space is required)</span>
                  <div className="val" style={{ minHeight: 45, marginTop: 3, fontSize: "7.5pt", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                    {cert.description || ""}
                    {cert.additionalInsured ? "\nCertificate holder is named as Additional Insured as required by written contract." : ""}
                    {cert.waiverOfSubrogation ? "\nWaiver of Subrogation applies in favor of the certificate holder as required by written contract." : ""}
                  </div>
                </td>
              </tr>
            </tbody></table>

            {/* ===== CERTIFICATE HOLDER / CANCELLATION ===== */}
            <table className="bdr" style={{ borderTop: "none" }}><tbody>
              <tr>
                <td style={{ width: "50%", padding: "2px 4px", verticalAlign: "top" }} className="bdr-r">
                  <span className="lbl" style={{ fontWeight: "bold" }}>CERTIFICATE HOLDER</span>
                  <div style={{ minHeight: 65, marginTop: 4 }}>
                    <div className="val-b" style={{ fontSize: "8.5pt" }}>{cert.holderName || ""}</div>
                    <div className="val">{cert.holderAddress || ""}</div>
                    <div className="val">{[cert.holderCity, cert.holderState, cert.holderZip].filter(Boolean).join(", ")}</div>
                  </div>
                </td>
                <td style={{ padding: 0, verticalAlign: "top" }}>
                  <div style={{ padding: "2px 4px" }}>
                    <span className="lbl" style={{ fontWeight: "bold" }}>CANCELLATION</span>
                    <div style={{ fontSize: "6.5pt", lineHeight: 1.4, marginTop: 4 }}>
                      SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH THE POLICY PROVISIONS.
                    </div>
                  </div>
                  <div className="bdr-t" style={{ padding: "2px 4px", marginTop: 8 }}>
                    <span className="lbl" style={{ fontWeight: "bold" }}>AUTHORIZED REPRESENTATIVE</span>
                    <div style={{ minHeight: 20, marginTop: 8 }}></div>
                  </div>
                </td>
              </tr>
            </tbody></table>

            {/* ===== FOOTER ===== */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, fontSize: "6.5pt" }}>
              <div><strong>ACORD 25 (2010/05)</strong></div>
              <div>&copy; 1988-2010 ACORD CORPORATION. All rights reserved.</div>
            </div>
            <div style={{ textAlign: "center", fontSize: "6pt", marginTop: 1 }}>The ACORD name and logo are registered marks of ACORD</div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== RETENTION TRACKER ====================
const RT_STORAGE_KEY = "sentinel-retention-tracker";
const RT_STAGES = { PENDING: "Pending Cancel", REQ_CANCEL: "Requested Cancellation", CANCEL: "Cancellation", ANAIC: "ANAIC", TERM: "Termination" };
const RT_STAGE_LIST = [RT_STAGES.PENDING, RT_STAGES.CANCEL, RT_STAGES.ANAIC, RT_STAGES.TERM, RT_STAGES.REQ_CANCEL];
const RT_STAGE_COLORS = {
  [RT_STAGES.PENDING]: { accent: "#f59e0b", bg: "#f59e0b20", border: "#f59e0b" },
  [RT_STAGES.REQ_CANCEL]: { accent: "#e879f9", bg: "#e879f920", border: "#e879f9" },
  [RT_STAGES.CANCEL]: { accent: "#f97316", bg: "#f9731620", border: "#f97316" },
  [RT_STAGES.ANAIC]: { accent: "#6366f1", bg: "#6366f120", border: "#6366f1" },
  [RT_STAGES.TERM]: { accent: "#ef4444", bg: "#ef444420", border: "#ef4444" },
};
const RT_IS_ANAIC = (p) => { const cc = (p.companyCode || "").toString().trim().toLowerCase(); return cc.includes("north american") || cc === "anaic" || cc.startsWith("330"); };

function rtLoadData() {
  try { const r = localStorage.getItem(RT_STORAGE_KEY); return r ? JSON.parse(r) : { policies: [], contacts: [], uploads: [] }; }
  catch { return { policies: [], contacts: [], uploads: [] }; }
}
function rtSaveData(d) { localStorage.setItem(RT_STORAGE_KEY, JSON.stringify(d)); }
function rtPolicyKey(r) { return `${(r.policyNumber||"").trim()}-${(r.lastName||"").trim()}-${(r.firstName||"").trim()}`.toLowerCase(); }
function rtDaysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(dateStr); const n = new Date(); t.setHours(0,0,0,0); n.setHours(0,0,0,0);
  return Math.ceil((t - n) / 86400000);
}
function rtUrgencyScore(p) {
  const days = rtDaysUntil(p.cancelDate || p.pendingCancelDate);
  const amt = parseFloat(String(p.amountDue || 0).replace(/[$,]/g, "")) || 0;
  return days * 1000 - amt;
}
function rtUrgencyLabel(p) {
  const d = rtDaysUntil(p.cancelDate || p.pendingCancelDate);
  if (d < 0) return { label: "Overdue", color: COLORS.danger };
  if (d <= 3) return { label: "Critical", color: COLORS.danger };
  if (d <= 7) return { label: "Urgent", color: "#f97316" };
  if (d <= 14) return { label: "Soon", color: COLORS.warning };
  return { label: "Upcoming", color: COLORS.textDim };
}
function rtExcelDate(serial) {
  if (!serial) return null;
  if (typeof serial === "string") { const d = new Date(serial); return isNaN(d) ? null : d.toISOString().split("T")[0]; }
  if (typeof serial === "number") { const u = Math.floor(serial - 25569); return new Date(u * 86400000).toISOString().split("T")[0]; }
  return null;
}

const RT_HEADER_MAP = {
  insuredfirstname: "firstName", firstname: "firstName",
  insuredlastname: "lastName", lastname: "lastName",
  address: "address", city: "city", state: "state", zip: "zip",
  policynumber: "policyNumber", policyno: "policyNumber",
  originalyear: "originalYear", productcode: "productCode", productname: "productName",
  pendingcanceldate: "pendingCancelDate",
  canceldate: "cancelDate", cancellationdate: "cancelDate",
  lastcontactdate: "lastContactDate",
  numberoftimescontacted: "timesContacted",
  amountdue: "amountDue", amountdueusd: "amountDue",
  companycode: "companyCode", company: "companyName", companyname: "companyName",
};

function rtParseExcel(arrayBuffer) {
  const wb = read(arrayBuffer, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = utils.sheet_to_json(ws, { header: 1, defval: "" });
  const norm = (h) => (h||"").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  let headerIdx = -1;
  for (let i = 0; i < Math.min(allRows.length, 6); i++) {
    const r = allRows[i].map(c => norm(c));
    if (r.includes("policynumber") || r.includes("policyno") || r.includes("insuredfirstname")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("Could not find header row with Policy Number / Insured First Name columns.");
  const headers = allRows[headerIdx].map(norm);
  const fieldMap = headers.map(h => RT_HEADER_MAP[h] || null);
  const hasCancelDate = fieldMap.includes("cancelDate");
  const hasPending = fieldMap.includes("pendingCancelDate");
  const reportType = hasCancelDate && !hasPending ? "cancellation" : hasPending ? "pending" : "unknown";
  const records = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.every(c => c === "" || c == null)) continue;
    const rec = {};
    fieldMap.forEach((f, idx) => { if (f && row[idx] !== undefined && row[idx] !== "") rec[f] = row[idx]; });
    if (!rec.policyNumber) continue;
    ["pendingCancelDate", "cancelDate", "lastContactDate"].forEach(df => { if (rec[df]) rec[df] = rtExcelDate(rec[df]); });
    if (rec.amountDue) { const c = String(rec.amountDue).replace(/[$,\s]/g, ""); rec.amountDue = isNaN(parseFloat(c)) ? 0 : parseFloat(c); }
    if (rec.timesContacted) rec.timesContacted = parseInt(rec.timesContacted, 10) || 0;
    records.push(rec);
  }
  return { records, reportType };
}

function RetentionTracker({ data, setData, config }) {
  const [rtData, setRtDataRaw] = useState(rtLoadData);
  const setRtData = useCallback((updater) => {
    setRtDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      rtSaveData(next);
      return next;
    });
  }, []);

  const [view, setView] = useState(() => { try { return localStorage.getItem("rt_view") || "kanban"; } catch { return "kanban"; } });
  const setViewPersist = (v) => { setView(v); try { localStorage.setItem("rt_view", v); } catch {} };
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [contactModal, setContactModal] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [importResult, setImportResult] = useState(null); // { summary, resolvedText }
  const [showHistory, setShowHistory] = useState(false);
  const [contactForm, setContactForm] = useState({ method: "Phone", note: "" });
  const fileRef = useRef(null);
  const [fileDragging, setFileDragging] = useState(false);
  const fileDragCounter = useRef(0);

  // Kanban drag-and-drop state
  const [kanbanDrag, setKanbanDrag] = useState(null); // policy being dragged
  const [kanbanDragOver, setKanbanDragOver] = useState(null); // stage being hovered

  // File upload handler — uses ref so drag/drop closures always call the latest version
  const processFileRef = useRef(null);
  processFileRef.current = async (file) => {
    try {
      const ab = await file.arrayBuffer();
      const { records, reportType } = rtParseExcel(ab);
      if (records.length === 0) { alert("No valid records found."); return; }

      // Read current state directly from localStorage to avoid stale closures
      const prev = rtLoadData();
      // Only keep non-resolved policies in the lookup — resolved ones should be re-importable
      const activeMap = new Map();
      const resolvedList = [];
      prev.policies.forEach(p => {
        if (p.resolved) resolvedList.push(p);
        else activeMap.set(rtPolicyKey(p), p);
      });

      let newCount = 0, updatedCount = 0;
      const resolvedKeys = new Set();

      records.forEach(rec => {
        const key = rtPolicyKey(rec);
        const ex = activeMap.get(key);
        if (ex) {
          const updated = { ...ex, ...rec, importedAt: ex.importedAt, lastUpdated: new Date().toISOString() };
          // Auto-assign ANAIC, or advance pending→cancellation
          if (RT_IS_ANAIC(updated)) updated.stage = RT_STAGES.ANAIC;
          else if (reportType === "cancellation" && ex.stage === RT_STAGES.PENDING) updated.stage = RT_STAGES.CANCEL;
          activeMap.set(key, updated);
          updatedCount++;
        } else {
          const autoStage = RT_IS_ANAIC(rec) ? RT_STAGES.ANAIC : (reportType === "cancellation" ? RT_STAGES.CANCEL : RT_STAGES.PENDING);
          activeMap.set(key, { ...rec, stage: autoStage, resolved: false, importedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() });
          newCount++;
        }
      });

      // Auto-resolve: policies no longer on the uploaded report get marked resolved
      const newKeys = new Set(records.map(r => rtPolicyKey(r)));
      const pendingStages = new Set([RT_STAGES.PENDING]);
      const cancelStages = new Set([RT_STAGES.CANCEL, RT_STAGES.ANAIC, RT_STAGES.TERM]);
      Array.from(activeMap.values()).forEach(p => {
        if (newKeys.has(rtPolicyKey(p))) return;
        if (reportType === "pending" && pendingStages.has(p.stage)) resolvedKeys.add(rtPolicyKey(p));
        if (reportType === "cancellation" && cancelStages.has(p.stage)) resolvedKeys.add(rtPolicyKey(p));
      });

      const activePolicies = Array.from(activeMap.values()).map(p =>
        resolvedKeys.has(rtPolicyKey(p)) ? { ...p, resolved: true, resolvedAt: new Date().toISOString() } : p
      );
      const policies = [...activePolicies, ...resolvedList];
      const uploadEntry = { id: uid(), fileName: file.name, reportType, recordCount: records.length, newCount, updatedCount, resolvedCount: resolvedKeys.size, uploadedAt: new Date().toISOString() };
      const next = { policies, contacts: prev.contacts, uploads: [uploadEntry, ...prev.uploads] };

      rtSaveData(next);
      setRtDataRaw(next);

      const summary = `Imported ${records.length} records: ${newCount} new, ${updatedCount} updated`;
      let resolvedText = "";
      if (resolvedKeys.size) {
        const resolvedNames = activePolicies.filter(p => resolvedKeys.has(rtPolicyKey(p))).map(p => `${p.firstName} ${p.lastName} — ${p.policyNumber}`).join("\n");
        resolvedText = `${resolvedKeys.size} Resolved (no longer on ${reportType === "cancellation" ? "cancellation" : "pending cancel"} list):\n${resolvedNames}`;
      }
      setImportResult({ summary, resolvedText });
    } catch (err) { alert(err.message || "Failed to parse file"); }
  };

  const handleUpload = (e) => { const file = e.target.files?.[0]; if (file) processFileRef.current(file); e.target.value = ""; };

  const onFileDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); fileDragCounter.current++; if (e.dataTransfer.types.includes("Files")) setFileDragging(true); };
  const onFileDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); fileDragCounter.current--; if (fileDragCounter.current <= 0) { fileDragCounter.current = 0; setFileDragging(false); } };
  const onFileDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes("Files")) e.dataTransfer.dropEffect = "copy"; };
  const onFileDrop = (e) => { e.preventDefault(); e.stopPropagation(); setFileDragging(false); fileDragCounter.current = 0; const f = e.dataTransfer.files?.[0]; if (f && /\.xlsx?$/i.test(f.name)) processFileRef.current(f); else if (f) alert("Please drop an .xlsx or .xls file."); };

  const handleLogContact = useCallback(() => {
    if (!contactForm.note.trim()) { alert("Enter a note"); return; }
    const entry = { id: uid(), policyKey: rtPolicyKey(contactModal), method: contactForm.method, note: contactForm.note.trim(), date: new Date().toISOString() };
    setRtData(prev => ({ ...prev, contacts: [entry, ...prev.contacts] }));
    setContactModal(null);
    setContactForm({ method: "Phone", note: "" });
  }, [contactModal, contactForm, setRtData]);

  const handleQuickNote = useCallback((policy, note) => {
    const entry = { id: uid(), policyKey: rtPolicyKey(policy), method: "Email", note, date: new Date().toISOString() };
    setRtData(prev => ({ ...prev, contacts: [entry, ...prev.contacts] }));
    navigator.clipboard.writeText(note);
  }, [setRtData]);

  const handleContactDateChange = useCallback((contactId, newDate) => {
    setRtData(prev => ({
      ...prev,
      contacts: prev.contacts.map(c => c.id === contactId ? { ...c, date: new Date(newDate + "T12:00:00").toISOString() } : c),
    }));
  }, [setRtData]);

  const handleStageChange = useCallback((policy, newStage) => {
    setRtData(prev => ({
      ...prev,
      policies: prev.policies.map(p => {
        if (rtPolicyKey(p) !== rtPolicyKey(policy)) return p;
        if (newStage === "Resolved") return { ...p, resolved: true, resolvedAt: new Date().toISOString() };
        return { ...p, stage: newStage, resolved: false, lastUpdated: new Date().toISOString() };
      }),
    }));
    setStageModal(null);
  }, [setRtData]);

  const handleClearData = useCallback(() => {
    if (!confirm("Clear ALL retention tracker data? This cannot be undone.")) return;
    setRtData({ policies: [], contacts: [], uploads: [] });
  }, [setRtData]);

  const handleDateChange = useCallback((policy, newDate) => {
    setRtData(prev => ({
      ...prev,
      policies: prev.policies.map(p => {
        if (rtPolicyKey(p) !== rtPolicyKey(policy)) return p;
        const dateField = p.cancelDate ? "cancelDate" : "pendingCancelDate";
        return { ...p, [dateField]: newDate, lastUpdated: new Date().toISOString() };
      }),
    }));
  }, [setRtData]);

  const handleKanbanDrop = useCallback((targetStage) => {
    if (!kanbanDrag || kanbanDrag.stage === targetStage) { setKanbanDrag(null); setKanbanDragOver(null); return; }
    handleStageChange(kanbanDrag, targetStage);
    setKanbanDrag(null);
    setKanbanDragOver(null);
  }, [kanbanDrag, handleStageChange]);

  // Filtering & sorting
  const filtered = useMemo(() => {
    let list = rtData.policies.filter(p => !p.resolved);
    if (stageFilter !== "all") list = list.filter(p => p.stage === stageFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p => (p.firstName||"").toLowerCase().includes(q) || (p.lastName||"").toLowerCase().includes(q) || (p.policyNumber||"").toLowerCase().includes(q) || (p.productName||"").toLowerCase().includes(q) || (p.address||"").toLowerCase().includes(q));
    }
    list.sort((a, b) => rtUrgencyScore(a) - rtUrgencyScore(b));
    return list;
  }, [rtData.policies, stageFilter, searchTerm]);

  const resolved = useMemo(() => rtData.policies.filter(p => p.resolved), [rtData.policies]);

  const stageCounts = useMemo(() => {
    const c = { all: 0 }; RT_STAGE_LIST.forEach(s => c[s] = 0);
    rtData.policies.forEach(p => { if (!p.resolved) { c.all++; if (c[p.stage] !== undefined) c[p.stage]++; } });
    return c;
  }, [rtData.policies]);

  const fmtAmt = (v) => { if (v == null || v === "") return "—"; const n = typeof v === "string" ? parseFloat(v.replace(/[$,]/g, "")) : v; return isNaN(n) ? "—" : "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };

  return (
    <div onDragEnter={onFileDragEnter} onDragLeave={onFileDragLeave} onDragOver={onFileDragOver} onDrop={onFileDrop} style={{ position: "relative" }}>
      {/* File drag overlay */}
      {fileDragging && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: `${COLORS.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: COLORS.card, border: `3px dashed ${COLORS.accent}`, borderRadius: 16, padding: "48px 64px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⬆</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.accentLight }}>Drop .xlsx file to import</div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={S.pageTitle}>⛨ Retention Tracker</div>
          <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: -12 }}>{stageCounts.all} active {stageCounts.all === 1 ? "policy" : "policies"} · {resolved.length} resolved</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="file" ref={fileRef} style={{ display: "none" }} accept=".xlsx,.xls" onChange={handleUpload} />
          <button style={S.btn()} onClick={() => fileRef.current?.click()}>⬆ Import</button>
          <button style={S.btn("ghost")} onClick={() => setShowHistory(!showHistory)}>🕐 History</button>
          <div style={{ display: "flex", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
            <button style={{ padding: "6px 10px", background: view === "kanban" ? COLORS.accent : "transparent", color: view === "kanban" ? "#fff" : COLORS.textDim, border: "none", cursor: "pointer", fontSize: 13 }} onClick={() => setViewPersist("kanban")}>▦ Board</button>
            <button style={{ padding: "6px 10px", background: view === "list" ? COLORS.accent : "transparent", color: view === "list" ? "#fff" : COLORS.textDim, border: "none", cursor: "pointer", fontSize: 13 }} onClick={() => setViewPersist("list")}>☰ List</button>
          </div>
        </div>
      </div>

      {/* Upload History */}
      {showHistory && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Import History</div>
            {rtData.uploads.length > 0 && <button style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 12 }} onClick={handleClearData}>🗑 Clear All Data</button>}
          </div>
          {rtData.uploads.length === 0 ? (
            <div style={{ color: COLORS.textDim, fontSize: 13 }}>No imports yet. Upload an Allstate Book of Business cancellation audit export (.xlsx).</div>
          ) : (
            <div style={{ maxHeight: 160, overflow: "auto" }}>
              {rtData.uploads.map(u => (
                <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`, fontSize: 12 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: COLORS.text }}>{u.fileName}</span>
                    <span style={{ ...S.badge(u.reportType === "pending" ? COLORS.warning : "#f97316"), marginLeft: 8 }}>{u.reportType === "pending" ? "Pending Cancel" : "Cancellation"}</span>
                  </div>
                  <span style={{ color: COLORS.textDim }}>{u.recordCount} records · {fmt(u.uploadedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stage filter pills + search */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {[{ key: "all", label: "All" }, ...RT_STAGE_LIST.map(s => ({ key: s, label: s }))].map(f => (
          <button key={f.key} onClick={() => setStageFilter(f.key)} style={S.pill(stageFilter === f.key)}>
            {f.label} ({stageCounts[f.key] || 0})
          </button>
        ))}
        {resolved.length > 0 && (
          <button onClick={() => setStageFilter("resolved")} style={{ ...S.pill(stageFilter === "resolved"), borderColor: stageFilter === "resolved" ? COLORS.success : COLORS.border, background: stageFilter === "resolved" ? `${COLORS.success}20` : "transparent", color: stageFilter === "resolved" ? COLORS.success : COLORS.textDim }}>
            Resolved ({resolved.length})
          </button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <input style={{ ...S.input, width: 220 }} placeholder="Search name, policy..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Empty State */}
      {rtData.policies.length === 0 && (
        <div style={{ ...S.emptyState, border: `2px dashed ${COLORS.border}`, borderRadius: 12, padding: "48px 24px", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⬆</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: COLORS.text }}>Drop file here or click to upload</div>
          <div style={{ fontSize: 13, color: COLORS.textDim, maxWidth: 400, margin: "0 auto" }}>Upload an Allstate "Book of Business" cancellation audit export (.xlsx) to start tracking pending cancellations and retaining clients.</div>
        </div>
      )}

      {/* KANBAN VIEW */}
      {rtData.policies.length > 0 && stageFilter !== "resolved" && view === "kanban" && (
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>
          {RT_STAGE_LIST.map(stage => {
            if (stageFilter !== "all" && stageFilter !== stage) return null;
            const items = filtered.filter(p => p.stage === stage);
            const sc = RT_STAGE_COLORS[stage];
            const isOver = kanbanDragOver === stage && kanbanDrag?.stage !== stage;
            return (
              <div key={stage} style={{ minWidth: 300, flex: 1 }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setKanbanDragOver(stage); }}
                onDragLeave={() => setKanbanDragOver(null)}
                onDrop={e => { e.preventDefault(); handleKanbanDrop(stage); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: sc.accent, display: "flex", alignItems: "center", gap: 6 }}>
                    {stage === RT_STAGES.PENDING ? "⚠" : stage === RT_STAGES.REQ_CANCEL ? "✋" : stage === RT_STAGES.CANCEL ? "⏳" : stage === RT_STAGES.ANAIC ? "★" : "✕"} {stage}
                  </div>
                  <span style={S.badge(sc.accent)}>{items.length}</span>
                </div>
                <div style={{ background: isOver ? `${sc.accent}30` : sc.bg, borderRadius: 8, padding: 8, minHeight: 200, border: isOver ? `2px dashed ${sc.accent}` : "2px solid transparent", transition: "all 0.15s" }}>
                  {items.map(p => {
                    const urg = rtUrgencyLabel(p);
                    const days = rtDaysUntil(p.cancelDate || p.pendingCancelDate);
                    const pContacts = rtData.contacts.filter(c => c.policyKey === rtPolicyKey(p));
                    return (
                      <div key={rtPolicyKey(p)} draggable
                        onDragStart={() => setKanbanDrag(p)}
                        onDragEnd={() => { setKanbanDrag(null); setKanbanDragOver(null); }}
                        style={{ ...S.card, borderLeft: `4px solid ${sc.border}`, marginBottom: 8, padding: 12, cursor: "grab", opacity: kanbanDrag && rtPolicyKey(kanbanDrag) === rtPolicyKey(p) ? 0.5 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{p.lastName}, {p.firstName}</div>
                              <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${p.firstName} ${p.lastName}`); }} title="Copy name" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, color: COLORS.textMuted, lineHeight: 1 }}>📋</button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ fontSize: 12, color: COLORS.textDim }}>{p.policyNumber}</div>
                              <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(p.policyNumber); }} title="Copy policy number" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, color: COLORS.textMuted, lineHeight: 1 }}>📋</button>
                            </div>
                            {p.productName && <div style={{ fontSize: 11, color: COLORS.textMuted }}>{p.productName}</div>}
                          </div>
                          <span style={S.badge(urg.color)}>{urg.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: COLORS.textDim }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>📅
                            <input type="date" value={p.cancelDate || p.pendingCancelDate || ""} onChange={e => handleDateChange(p, e.target.value)}
                              style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: days <= 3 ? COLORS.danger : days <= 7 ? "#f97316" : COLORS.textDim, fontSize: 11, padding: "1px 4px", fontWeight: days <= 7 ? 600 : 400, cursor: "pointer", outline: "none" }} />
                            {days !== Infinity && <span style={{ color: days <= 3 ? COLORS.danger : days <= 7 ? "#f97316" : COLORS.textDim, fontWeight: days <= 7 ? 600 : 400 }}>({days < 0 ? `${Math.abs(days)}d ago` : `${days}d`})</span>}
                          </span>
                          {p.amountDue > 0 && <span>💲{fmtAmt(p.amountDue)}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}`, flexWrap: "wrap" }}>
                          <button style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: "pointer", color: COLORS.textDim, whiteSpace: "nowrap" }} onClick={() => handleQuickNote(p, "Emailed payment reminder")} title="Log: Emailed payment reminder">✉ Payment Reminder</button>
                          <button style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: "pointer", color: COLORS.textDim, whiteSpace: "nowrap" }} onClick={() => handleQuickNote(p, "Emailed cancellation notice")} title="Log: Emailed cancellation notice">✉ Cancel Notice</button>
                        </div>
                        {/* Itemized contact log */}
                        {pContacts.length > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                            {pContacts.map(c => {
                              const isPayment = c.note.toLowerCase().includes("payment reminder");
                              const isCancel = c.note.toLowerCase().includes("cancellation notice");
                              const label = isPayment ? "Payment Reminder" : isCancel ? "Cancel Notice" : c.note;
                              const color = isPayment ? "#f59e0b" : isCancel ? "#ef4444" : COLORS.textDim;
                              const dateVal = c.date ? c.date.slice(0, 10) : "";
                              return (
                                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 3 }}>
                                  <span style={{ color, fontWeight: 600 }}>{isPayment ? "✉" : isCancel ? "✉" : "💬"} {label}</span>
                                  <input type="date" value={dateVal} onChange={e => handleContactDateChange(c.id, e.target.value)}
                                    style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "1px 4px", cursor: "pointer", outline: "none" }} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 6 }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2, color: COLORS.textDim }} onClick={() => setContactModal(p)} title="Log contact">📞</button>
                            <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2, color: COLORS.textDim }} onClick={() => setStageModal(p)} title="Change stage">🔄</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div style={{ textAlign: "center", padding: 32, color: COLORS.textMuted, fontSize: 12 }}>No policies</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {rtData.policies.length > 0 && stageFilter !== "resolved" && view === "list" && (
        <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Insured</th>
                <th style={S.th}>Policy</th>
                <th style={S.th}>Product</th>
                <th style={S.th}>Stage</th>
                <th style={S.th}>Cancel Date</th>
                <th style={S.th}>Amount Due</th>
                <th style={S.th}>Urgency</th>
                <th style={S.th}>Contacts</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const urg = rtUrgencyLabel(p);
                const days = rtDaysUntil(p.cancelDate || p.pendingCancelDate);
                const pContacts = rtData.contacts.filter(c => c.policyKey === rtPolicyKey(p));
                return (
                  <tr key={rtPolicyKey(p)}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {p.lastName}, {p.firstName}
                        <button onClick={() => navigator.clipboard.writeText(`${p.firstName} ${p.lastName}`)} title="Copy name" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, color: COLORS.textMuted, lineHeight: 1 }}>📋</button>
                      </div>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {p.policyNumber}
                        <button onClick={() => navigator.clipboard.writeText(p.policyNumber)} title="Copy policy number" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, color: COLORS.textMuted, lineHeight: 1 }}>📋</button>
                      </div>
                    </td>
                    <td style={{ ...S.td, color: COLORS.textDim }}>{p.productName || "—"}</td>
                    <td style={S.td}><span style={S.badge(RT_STAGE_COLORS[p.stage]?.accent || COLORS.textDim)}>{p.stage}</span></td>
                    <td style={{ ...S.td }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="date" value={p.cancelDate || p.pendingCancelDate || ""} onChange={e => handleDateChange(p, e.target.value)}
                          style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: days <= 3 ? COLORS.danger : days <= 7 ? "#f97316" : COLORS.textDim, fontSize: 12, padding: "2px 6px", fontWeight: days <= 7 ? 600 : 400, cursor: "pointer", outline: "none" }} />
                        {days !== Infinity && <span style={{ fontSize: 11, color: days <= 3 ? COLORS.danger : days <= 7 ? "#f97316" : COLORS.textDim, fontWeight: days <= 7 ? 600 : 400 }}>{days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}</span>}
                      </div>
                    </td>
                    <td style={S.td}>{fmtAmt(p.amountDue)}</td>
                    <td style={S.td}><span style={S.badge(urg.color)}>{urg.label}</span></td>
                    <td style={S.td}>
                      {pContacts.length === 0 ? <span style={{ color: COLORS.textMuted, fontSize: 12 }}>—</span> : pContacts.map(c => {
                        const isPayment = c.note.toLowerCase().includes("payment reminder");
                        const isCancel = c.note.toLowerCase().includes("cancellation notice");
                        const label = isPayment ? "Payment Reminder" : isCancel ? "Cancel Notice" : c.note;
                        const color = isPayment ? "#f59e0b" : isCancel ? "#ef4444" : COLORS.textDim;
                        const dateVal = c.date ? c.date.slice(0, 10) : "";
                        return (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color, fontWeight: 600 }}>{isPayment || isCancel ? "✉" : "💬"} {label}</span>
                            <input type="date" value={dateVal} onChange={e => handleContactDateChange(c.id, e.target.value)}
                              style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "1px 4px", cursor: "pointer", outline: "none" }} />
                          </div>
                        );
                      })}
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: "pointer", color: COLORS.textDim, whiteSpace: "nowrap" }} onClick={() => handleQuickNote(p, "Emailed payment reminder")} title="Log: Emailed payment reminder">✉ Payment Reminder</button>
                        <button style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: "pointer", color: COLORS.textDim, whiteSpace: "nowrap" }} onClick={() => handleQuickNote(p, "Emailed cancellation notice")} title="Log: Emailed cancellation notice">✉ Cancel Notice</button>
                        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2, color: COLORS.textDim }} onClick={() => setContactModal(p)} title="Log contact">📞</button>
                        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2, color: COLORS.textDim }} onClick={() => setStageModal(p)} title="Change stage">🔄</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={S.emptyState}>No policies match your filters</div>}
        </div>
      )}

      {/* RESOLVED VIEW */}
      {stageFilter === "resolved" && (
        <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Insured</th>
                <th style={S.th}>Policy</th>
                <th style={S.th}>Product</th>
                <th style={S.th}>Last Stage</th>
                <th style={S.th}>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map(p => (
                <tr key={rtPolicyKey(p)}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{p.lastName}, {p.firstName}</td>
                  <td style={S.td}>{p.policyNumber}</td>
                  <td style={{ ...S.td, color: COLORS.textDim }}>{p.productName || "—"}</td>
                  <td style={S.td}><span style={S.badge(RT_STAGE_COLORS[p.stage]?.accent || COLORS.textDim)}>{p.stage}</span></td>
                  <td style={{ ...S.td, color: COLORS.textDim }}>{fmt(p.resolvedAt)}</td>
                </tr>
              ))}
              {resolved.length === 0 && <tr><td colSpan={5} style={S.emptyState}>No resolved policies</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Contact Modal */}
      {contactModal && (
        <div style={S.overlay} onClick={() => setContactModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={S.modalTitle}>Log Contact</div>
              <span style={{ cursor: "pointer", fontSize: 20, color: COLORS.textDim }} onClick={() => setContactModal(null)}>✕</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 16 }}>
              {contactModal.firstName} {contactModal.lastName} — {contactModal.policyNumber}
            </div>
            <div style={S.formGroup}>
              <div style={S.formLabel}>Method</div>
              <select style={S.select} value={contactForm.method} onChange={e => setContactForm({ ...contactForm, method: e.target.value })}>
                <option>Phone</option><option>Email</option><option>Text</option><option>In Person</option>
              </select>
            </div>
            <div style={S.formGroup}>
              <div style={S.formLabel}>Note</div>
              <textarea style={{ ...S.input, minHeight: 80 }} value={contactForm.note} onChange={e => setContactForm({ ...contactForm, note: e.target.value })} placeholder="What was discussed..." autoFocus
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleLogContact(); }} />
            </div>
            {/* Show existing contacts */}
            {(() => {
              const hist = rtData.contacts.filter(c => c.policyKey === rtPolicyKey(contactModal));
              return hist.length > 0 ? (
                <div style={{ marginBottom: 16, maxHeight: 120, overflow: "auto" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6, textTransform: "uppercase" }}>Previous Contacts</div>
                  {hist.map(c => (
                    <div key={c.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textDim }}>
                      <span style={{ fontWeight: 600 }}>{c.method}</span> — {c.note} <span style={{ color: COLORS.textMuted }}>({fmt(c.date)})</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={S.btn("ghost")} onClick={() => setContactModal(null)}>Cancel</button>
              <button style={S.btn()} onClick={handleLogContact}>Save Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {importResult && (
        <div style={S.overlay} onClick={() => setImportResult(null)}>
          <div style={{ ...S.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={S.modalTitle}>Import Complete</div>
              <span style={{ cursor: "pointer", fontSize: 20, color: COLORS.textDim }} onClick={() => setImportResult(null)}>✕</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{importResult.summary}</div>
            {importResult.resolvedText && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.success, marginBottom: 6 }}>Resolved</div>
                <textarea readOnly value={importResult.resolvedText} style={{ ...S.input, minHeight: 120, fontFamily: "monospace", fontSize: 12, resize: "vertical", cursor: "text", whiteSpace: "pre" }} onClick={e => e.target.select()} />
                <button style={{ ...S.btn(), marginTop: 8, fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(importResult.resolvedText); }}>Copy to Clipboard</button>
              </div>
            )}
            {!importResult.resolvedText && (
              <div style={{ fontSize: 13, color: COLORS.textDim }}>No policies were resolved in this import.</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button style={S.btn("ghost")} onClick={() => setImportResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Change Modal */}
      {stageModal && (
        <div style={S.overlay} onClick={() => setStageModal(null)}>
          <div style={{ ...S.modal, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={S.modalTitle}>Move Stage</div>
              <span style={{ cursor: "pointer", fontSize: 20, color: COLORS.textDim }} onClick={() => setStageModal(null)}>✕</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 16 }}>
              {stageModal.firstName} {stageModal.lastName} — currently <span style={S.badge(RT_STAGE_COLORS[stageModal.stage]?.accent || COLORS.textDim)}>{stageModal.stage}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {RT_STAGE_LIST.filter(s => s !== stageModal.stage).map(stage => (
                <button key={stage} onClick={() => handleStageChange(stageModal, stage)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: "pointer", color: COLORS.text, fontSize: 13 }}>
                  <span style={S.badge(RT_STAGE_COLORS[stage].accent)}>{stage}</span>
                </button>
              ))}
              <button onClick={() => handleStageChange(stageModal, "Resolved")}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 8, border: `1px solid ${COLORS.success}40`, background: `${COLORS.success}10`, cursor: "pointer", color: COLORS.text, fontSize: 13 }}>
                <span style={S.badge(COLORS.success)}>Resolved</span>
                <span style={{ fontSize: 11, color: COLORS.textDim }}>Payment made / reinstated</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== CERTIFICATES PAGE ====================
function Certificates({ data, setData, nav, config }) {
  const [view, setView] = useState("list"); // list | create | detail | edit
  const [selectedCertId, setSelectedCertId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAcord, setShowAcord] = useState(null); // cert id to show ACORD 25

  // Create/Edit form state
  const emptyForm = { accountId: "", holderName: "", holderAddress: "", holderCity: "", holderState: "", holderZip: "", policyIds: [], description: "", additionalInsured: false, waiverOfSubrogation: false, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [accountSearch, setAccountSearch] = useState("");

  const certificates = data.certificates || [];

  // Auto-set status based on policy expiration
  const getCertStatus = (cert) => {
    if (cert.status === "Revoked") return "Revoked";
    const linkedPolicies = (cert.policyIds || []).map(pid => data.policies.find(p => p.id === pid)).filter(Boolean);
    if (linkedPolicies.length === 0) return cert.status || "Active";
    const allExpired = linkedPolicies.every(p => p.expirationDate && p.expirationDate < today());
    return allExpired ? "Expired" : "Active";
  };

  // Filtered/sorted certificates
  const filtered = useMemo(() => {
    let list = certificates.map(c => ({ ...c, _status: getCertStatus(c) }));
    if (statusFilter !== "All") list = list.filter(c => c._status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.holderName || "").toLowerCase().includes(q) ||
        (c.accountName || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (b.issuedDate || "").localeCompare(a.issuedDate || ""));
  }, [certificates, search, statusFilter, data.policies]);

  // Accounts for dropdown
  const accountResults = useMemo(() => {
    if (!accountSearch || accountSearch.length < 1) return data.accounts.slice(0, 10);
    const q = accountSearch.toLowerCase();
    return data.accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 10);
  }, [accountSearch, data.accounts]);

  const selectedAccount = form.accountId ? data.accounts.find(a => a.id === form.accountId) : null;
  const accountPolicies = selectedAccount ? data.policies.filter(p => p.accountId === selectedAccount.id && p.status === "Active") : [];

  const handleSave = () => {
    if (!form.accountId || !form.holderName.trim()) return;
    const acct = data.accounts.find(a => a.id === form.accountId);
    const cert = {
      id: form.id || uid(),
      accountId: form.accountId,
      accountName: acct ? acct.name : "",
      holderName: form.holderName.trim(),
      holderAddress: form.holderAddress.trim(),
      holderCity: form.holderCity.trim(),
      holderState: form.holderState.trim(),
      holderZip: form.holderZip.trim(),
      policyIds: form.policyIds,
      description: form.description.trim(),
      additionalInsured: form.additionalInsured,
      waiverOfSubrogation: form.waiverOfSubrogation,
      issuedDate: form.issuedDate || today(),
      status: "Active",
      created: form.created || today(),
      notes: form.notes.trim(),
    };

    let updated;
    if (form.id) {
      updated = { ...data, certificates: data.certificates.map(c => c.id === cert.id ? cert : c) };
    } else {
      updated = { ...data, certificates: [...data.certificates, cert] };
    }
    updated = addActivity(updated, cert.accountId, "certificate_issued", `Certificate issued to ${cert.holderName}`, `Policies: ${cert.policyIds.length}`, config);
    setData(updated, { undo: true, message: form.id ? "Certificate updated" : "Certificate issued" });
    setForm(emptyForm);
    setView("list");
    setAccountSearch("");
  };

  const handleRevoke = (certId) => {
    const updated = { ...data, certificates: data.certificates.map(c => c.id === certId ? { ...c, status: "Revoked" } : c) };
    setData(updated, { undo: true, message: "Certificate revoked" });
  };

  const handleDelete = (certId) => {
    const updated = { ...data, certificates: data.certificates.filter(c => c.id !== certId) };
    setData(updated, { undo: true, message: "Certificate deleted" });
    if (selectedCertId === certId) { setSelectedCertId(null); setView("list"); }
  };

  const openEdit = (cert) => {
    setForm({ ...cert, id: cert.id });
    setAccountSearch(cert.accountName || "");
    setView("edit");
  };

  const selectedCert = selectedCertId ? certificates.find(c => c.id === selectedCertId) : null;
  const acordCert = showAcord ? certificates.find(c => c.id === showAcord) : null;
  const acordAccount = acordCert ? data.accounts.find(a => a.id === acordCert.accountId) : null;

  // ---- DETAIL VIEW ----
  if (view === "detail" && selectedCert) {
    const acct = data.accounts.find(a => a.id === selectedCert.accountId);
    const linkedPols = (selectedCert.policyIds || []).map(pid => data.policies.find(p => p.id === pid)).filter(Boolean);
    const status = getCertStatus(selectedCert);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ cursor: "pointer", color: COLORS.accent, fontSize: 13 }} onClick={() => { setView("list"); setSelectedCertId(null); }}>&larr; Back to Certificates</span>
        </div>
        <div style={S.pageTitle}>Certificate Details</div>
        <div style={{ ...S.grid(2), marginBottom: 16 }}>
          <div style={S.card}>
            <div style={S.sectionTitle}><span>Certificate Holder</span><span style={S.badge(statusColor(status))}>{status}</span></div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{selectedCert.holderName}</div>
            <div style={{ fontSize: 13, color: COLORS.textDim }}>{selectedCert.holderAddress}</div>
            <div style={{ fontSize: 13, color: COLORS.textDim }}>{[selectedCert.holderCity, selectedCert.holderState, selectedCert.holderZip].filter(Boolean).join(", ")}</div>
            <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
              {selectedCert.additionalInsured && <span style={S.badge(COLORS.info)}>Additional Insured</span>}
              {selectedCert.waiverOfSubrogation && <span style={S.badge(COLORS.warning)}>Waiver of Subrogation</span>}
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sectionTitle}><span>Insured (Client)</span></div>
            {acct ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, cursor: "pointer", color: COLORS.accent }} onClick={() => nav(acct.id)}>{acct.name}</div>
                <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 4 }}>{acct.address}</div>
                <div style={{ fontSize: 13, color: COLORS.textDim }}>{[acct.city, acct.state, acct.zip].filter(Boolean).join(", ")}</div>
                <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 4 }}>{acct.phone} {acct.email ? ` | ${acct.email}` : ""}</div>
              </>
            ) : <div style={{ color: COLORS.textMuted }}>Client not found</div>}
            <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim }}>
              <strong>Issued:</strong> {fmt(selectedCert.issuedDate)} | <strong>Created:</strong> {fmt(selectedCert.created)}
            </div>
          </div>
        </div>

        {/* Linked Policies */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={S.sectionTitle}><span>Linked Policies ({linkedPols.length})</span></div>
          {linkedPols.length === 0 ? <div style={S.emptyState}>No policies linked</div> : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Carrier</th><th style={S.th}>LOB</th><th style={S.th}>Policy #</th>
                <th style={S.th}>Effective</th><th style={S.th}>Expiration</th><th style={S.th}>Premium</th><th style={S.th}>Status</th>
              </tr></thead>
              <tbody>
                {linkedPols.map(p => (
                  <tr key={p.id}>
                    <td style={S.td}>{p.carrier}</td>
                    <td style={S.td}>{p.lob}</td>
                    <td style={S.td}>{p.policyNumber}</td>
                    <td style={S.td}>{fmtShort(p.effectiveDate)}</td>
                    <td style={S.td}>{fmtShort(p.expirationDate)}</td>
                    <td style={S.td}>${(p.premium || 0).toLocaleString()}</td>
                    <td style={S.td}><span style={S.badge(statusColor(p.status))}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Description & Notes */}
        {(selectedCert.description || selectedCert.notes) && (
          <div style={{ ...S.card, marginBottom: 16 }}>
            {selectedCert.description && <div style={{ marginBottom: 8 }}><strong style={{ fontSize: 12, color: COLORS.textDim }}>DESCRIPTION OF OPERATIONS:</strong><div style={{ marginTop: 4, fontSize: 13 }}>{selectedCert.description}</div></div>}
            {selectedCert.notes && <div><strong style={{ fontSize: 12, color: COLORS.textDim }}>NOTES:</strong><div style={{ marginTop: 4, fontSize: 13 }}>{selectedCert.notes}</div></div>}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn(), background: COLORS.accent }} onClick={() => setShowAcord(selectedCert.id)}>Generate ACORD 25</button>
          <button style={S.btn()} onClick={() => openEdit(selectedCert)}>Edit</button>
          {status !== "Revoked" && <button style={{ ...S.btn("ghost"), color: COLORS.warning }} onClick={() => handleRevoke(selectedCert.id)}>Revoke</button>}
          <button style={{ ...S.btn("ghost"), color: COLORS.danger }} onClick={() => { if (confirm("Delete this certificate?")) handleDelete(selectedCert.id); }}>Delete</button>
        </div>

        {/* ACORD 25 modal */}
        {acordCert && acordAccount && (
          <Acord25Print cert={acordCert} account={acordAccount} policies={data.policies} config={config} onClose={() => setShowAcord(null)} />
        )}
      </div>
    );
  }

  // ---- CREATE/EDIT VIEW ----
  if (view === "create" || view === "edit") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ cursor: "pointer", color: COLORS.accent, fontSize: 13 }} onClick={() => { setView("list"); setForm(emptyForm); setAccountSearch(""); }}>&larr; Back</span>
        </div>
        <div style={S.pageTitle}>{view === "edit" ? "Edit Certificate" : "Issue New Certificate"}</div>

        <div style={{ ...S.grid(2), marginBottom: 16 }}>
          {/* Left: Insured & Policies */}
          <div style={S.card}>
            <div style={S.sectionTitle}><span>Insured (Client)</span></div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Search Client</label>
              <input style={S.input} placeholder="Type client name..." value={accountSearch}
                onChange={e => { setAccountSearch(e.target.value); if (form.accountId) setForm(f => ({ ...f, accountId: "", policyIds: [] })); }} />
              {accountSearch && !form.accountId && accountResults.length > 0 && (
                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: "auto", background: COLORS.card }}>
                  {accountResults.map(a => (
                    <div key={a.id} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${COLORS.border}20` }}
                      onClick={() => { setForm(f => ({ ...f, accountId: a.id, policyIds: [] })); setAccountSearch(a.name); }}
                      onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim }}>{a.type} | {a.phone || a.email || "No contact"}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedAccount && (
                <div style={{ marginTop: 8, padding: 10, background: `${COLORS.accent}10`, borderRadius: 6, border: `1px solid ${COLORS.accent}30` }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedAccount.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>{selectedAccount.address} {selectedAccount.city}, {selectedAccount.state} {selectedAccount.zip}</div>
                </div>
              )}
            </div>

            {/* Policy selection */}
            {selectedAccount && (
              <div style={S.formGroup}>
                <label style={S.formLabel}>Link Policies ({form.policyIds.length} selected)</label>
                {accountPolicies.length === 0 ? <div style={{ fontSize: 12, color: COLORS.textMuted }}>No active policies for this client</div> : (
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {accountPolicies.map(p => {
                      const isSelected = form.policyIds.includes(p.id);
                      return (
                        <div key={p.id}
                          style={{ padding: "8px 10px", cursor: "pointer", fontSize: 12, borderRadius: 4, marginBottom: 2, display: "flex", alignItems: "center", gap: 8, background: isSelected ? `${COLORS.accent}15` : "transparent", border: `1px solid ${isSelected ? COLORS.accent : COLORS.border}30` }}
                          onClick={() => {
                            setForm(f => ({
                              ...f,
                              policyIds: isSelected ? f.policyIds.filter(id => id !== p.id) : [...f.policyIds, p.id]
                            }));
                          }}>
                          <span style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${isSelected ? COLORS.accent : COLORS.border}`, background: isSelected ? COLORS.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>{isSelected ? "✓" : ""}</span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600 }}>{p.carrier}</span> - {p.lob}
                            <span style={{ color: COLORS.textDim, marginLeft: 8 }}>{p.policyNumber}</span>
                          </div>
                          <span style={{ fontSize: 11, color: COLORS.textDim }}>Exp: {fmtShort(p.expirationDate)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {accountPolicies.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer" }} onClick={() => setForm(f => ({ ...f, policyIds: accountPolicies.map(p => p.id) }))}>Select All</span>
                    <span style={{ fontSize: 11, color: COLORS.textDim, cursor: "pointer" }} onClick={() => setForm(f => ({ ...f, policyIds: [] }))}>Clear</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Holder Info */}
          <div style={S.card}>
            <div style={S.sectionTitle}><span>Certificate Holder</span></div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Holder Name *</label>
              <input style={S.input} value={form.holderName} onChange={e => setForm(f => ({ ...f, holderName: e.target.value }))} placeholder="Company or person name" />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Address</label>
              <input style={S.input} value={form.holderAddress} onChange={e => setForm(f => ({ ...f, holderAddress: e.target.value }))} placeholder="Street address" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <div style={S.formGroup}>
                <label style={S.formLabel}>City</label>
                <input style={S.input} value={form.holderCity} onChange={e => setForm(f => ({ ...f, holderCity: e.target.value }))} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>State</label>
                <input style={S.input} value={form.holderState} onChange={e => setForm(f => ({ ...f, holderState: e.target.value }))} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>Zip</label>
                <input style={S.input} value={form.holderZip} onChange={e => setForm(f => ({ ...f, holderZip: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 8, marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.additionalInsured} onChange={e => setForm(f => ({ ...f, additionalInsured: e.target.checked }))} />
                Additional Insured
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.waiverOfSubrogation} onChange={e => setForm(f => ({ ...f, waiverOfSubrogation: e.target.checked }))} />
                Waiver of Subrogation
              </label>
            </div>

            <div style={S.formGroup}>
              <label style={S.formLabel}>Description of Operations</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g., Certificate holder is included as additional insured per written contract..." />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Notes (internal)</label>
              <textarea style={{ ...S.input, minHeight: 40, resize: "vertical" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn(), opacity: (!form.accountId || !form.holderName.trim()) ? 0.5 : 1 }}
            disabled={!form.accountId || !form.holderName.trim()}
            onClick={handleSave}>
            {view === "edit" ? "Update Certificate" : "Issue Certificate"}
          </button>
          <button style={S.btn("ghost")} onClick={() => { setView("list"); setForm(emptyForm); setAccountSearch(""); }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ---- LIST VIEW ----
  const statusCounts = { All: certificates.length, Active: 0, Expired: 0, Revoked: 0 };
  certificates.forEach(c => { const s = getCertStatus(c); if (statusCounts[s] !== undefined) statusCounts[s]++; });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={S.pageTitle}>Certificates of Insurance</div>
        <button style={S.btn()} onClick={() => { setForm(emptyForm); setAccountSearch(""); setView("create"); }}>+ Issue Certificate</button>
      </div>

      {/* Stats */}
      <div style={{ ...S.grid(4), marginBottom: 16 }}>
        {[
          { label: "Total Certs", value: certificates.length, color: COLORS.accent },
          { label: "Active", value: statusCounts.Active, color: COLORS.success },
          { label: "Expired", value: statusCounts.Expired, color: COLORS.warning },
          { label: "Revoked", value: statusCounts.Revoked, color: COLORS.danger },
        ].map((s, i) => (
          <div key={i} style={S.statCard}>
            <div style={{ ...S.statVal, color: s.color }}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...S.input, maxWidth: 300 }} placeholder="Search holder, client, description..." value={search} onChange={e => setSearch(e.target.value)} />
        {["All", "Active", "Expired", "Revoked"].map(s => (
          <span key={s} style={S.pill(statusFilter === s)} onClick={() => setStatusFilter(s)}>
            {s} ({statusCounts[s] || 0})
          </span>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>▣</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No certificates found</div>
          <div style={{ marginTop: 8, color: COLORS.textMuted }}>Issue your first certificate to get started</div>
        </div>
      ) : (
        <div style={S.card}>
          <table style={{ ...S.table, tableLayout: "fixed" }}>
            <thead><tr>
              <th style={{ ...S.th, width: "20%" }}>Certificate Holder</th>
              <th style={{ ...S.th, width: "18%" }}>Insured (Client)</th>
              <th style={{ ...S.th, width: "8%" }}>Policies</th>
              <th style={{ ...S.th, width: "10%" }}>Issued</th>
              <th style={{ ...S.th, width: "12%" }}>Earliest Exp</th>
              <th style={{ ...S.th, width: "8%" }}>AI</th>
              <th style={{ ...S.th, width: "8%" }}>WOS</th>
              <th style={{ ...S.th, width: "8%" }}>Status</th>
              <th style={{ ...S.th, width: "8%" }}>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(cert => {
                const linkedPols = (cert.policyIds || []).map(pid => data.policies.find(p => p.id === pid)).filter(Boolean);
                const earliestExp = linkedPols.reduce((min, p) => {
                  if (!p.expirationDate) return min;
                  return !min || p.expirationDate < min ? p.expirationDate : min;
                }, null);
                const daysToExp = earliestExp ? daysBetween(today(), earliestExp) : null;
                const expColor = daysToExp !== null ? (daysToExp <= 30 ? COLORS.danger : daysToExp <= 60 ? COLORS.warning : COLORS.text) : COLORS.textDim;

                return (
                  <tr key={cert.id} style={{ cursor: "pointer" }}
                    onClick={() => { setSelectedCertId(cert.id); setView("detail"); }}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{cert.holderName}</div>
                      {cert.holderCity && <div style={{ fontSize: 11, color: COLORS.textDim }}>{cert.holderCity}, {cert.holderState}</div>}
                    </td>
                    <td style={S.td}>
                      <span style={{ color: COLORS.accent, cursor: "pointer" }} onClick={e => { e.stopPropagation(); nav(cert.accountId); }}>{cert.accountName}</span>
                    </td>
                    <td style={S.td}>{linkedPols.length}</td>
                    <td style={S.td}>{fmtShort(cert.issuedDate)}</td>
                    <td style={{ ...S.td, color: expColor, fontWeight: daysToExp !== null && daysToExp <= 30 ? 700 : 400 }}>
                      {earliestExp ? fmtShort(earliestExp) : "—"}
                      {daysToExp !== null && daysToExp <= 60 && <div style={{ fontSize: 10 }}>{daysToExp}d</div>}
                    </td>
                    <td style={S.td}>{cert.additionalInsured ? <span style={{ color: COLORS.success }}>Yes</span> : "—"}</td>
                    <td style={S.td}>{cert.waiverOfSubrogation ? <span style={{ color: COLORS.success }}>Yes</span> : "—"}</td>
                    <td style={S.td}><span style={S.badge(statusColor(cert._status))}>{cert._status}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                        <span style={{ cursor: "pointer", fontSize: 14, color: COLORS.accent }} title="Generate ACORD 25" onClick={() => setShowAcord(cert.id)}>▣</span>
                        <span style={{ cursor: "pointer", fontSize: 14, color: COLORS.textDim }} title="Edit" onClick={() => openEdit(cert)}>✎</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ACORD 25 modal */}
      {acordCert && acordAccount && (
        <Acord25Print cert={acordCert} account={acordAccount} policies={data.policies} config={config} onClose={() => setShowAcord(null)} />
      )}
    </div>
  );
}

// ==================== GLOBAL SEARCH ====================
function GlobalSearch({ data, onNavigate, onNavigatePolicy, setPage }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  // Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (inputRef.current) inputRef.current.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = useMemo(() => {
    if (!query || query.length < 2 || !data) return [];
    const q = query.toLowerCase();
    const r = [];

    data.accounts.filter(a => a.name.toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q) || (a.phone || "").includes(q))
      .slice(0, 5).forEach(a => r.push({ type: "client", icon: "\u25CE", label: a.name, sub: `${a.type} \u00B7 ${a.phone || a.email || ""}`, action: () => { onNavigate(a.id); setOpen(false); setQuery(""); } }));

    data.policies.filter(p => (p.policyNumber || "").toLowerCase().includes(q) || (p.accountName || "").toLowerCase().includes(q) || (p.carrier || "").toLowerCase().includes(q))
      .slice(0, 4).forEach(p => r.push({ type: "policy", icon: "\u25C7", label: `${p.carrier} ${p.lob} \u2014 ${p.accountName}`, sub: p.policyNumber, action: () => { onNavigatePolicy(p.id); setOpen(false); setQuery(""); } }));

    data.serviceItems.filter(si => (si.description || "").toLowerCase().includes(q) || (si.accountName || "").toLowerCase().includes(q) || (si.type || "").toLowerCase().includes(q) || (si.notes || "").toLowerCase().includes(q))
      .slice(0, 4).forEach(si => r.push({ type: "service", icon: "\u2630", label: si.description || si.type, sub: `${si.accountName} \u00B7 ${si.type} \u00B7 ${si.status}`, action: () => { setPage("service"); setOpen(false); setQuery(""); } }));

    data.prospects.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.business || "").toLowerCase().includes(q))
      .slice(0, 3).forEach(p => r.push({ type: "prospect", icon: "\u25C8", label: `${p.firstName} ${p.lastName}${p.business ? ` \u2014 ${p.business}` : ""}`, sub: `${p.stage} \u00B7 ${p.lob}`, action: () => { setPage("pipeline"); setOpen(false); setQuery(""); } }));

    data.tasks.filter(t => (t.title || "").toLowerCase().includes(q) || (t.linkedName || "").toLowerCase().includes(q))
      .slice(0, 3).forEach(t => r.push({ type: "task", icon: "\u2611", label: t.title, sub: `${t.linkedName || "No link"} \u00B7 ${t.status} \u00B7 Due ${fmtShort(t.dueDate)}`, action: () => { setPage("tasks"); setOpen(false); setQuery(""); } }));

    data.salesLog.filter(s => (s.accountName || "").toLowerCase().includes(q))
      .slice(0, 3).forEach(s => r.push({ type: "sale", icon: "\u25C6", label: s.accountName, sub: `${s.lob} \u00B7 $${(s.premium || 0).toLocaleString()} \u00B7 ${fmtShort(s.date)}`, action: () => { setPage("sales"); setOpen(false); setQuery(""); } }));

    (data.certificates || []).filter(c => (c.holderName || "").toLowerCase().includes(q) || (c.accountName || "").toLowerCase().includes(q))
      .slice(0, 3).forEach(c => r.push({ type: "certificate", icon: "\u25A3", label: `COI: ${c.holderName}`, sub: `${c.accountName} \u00B7 ${c.status || "Active"}`, action: () => { setPage("certificates"); setOpen(false); setQuery(""); } }));

    return r;
  }, [query, data, onNavigate, onNavigatePolicy, setPage]);

  // Group results by type
  const grouped = useMemo(() => {
    const g = {};
    results.forEach(r => { if (!g[r.type]) g[r.type] = []; g[r.type].push(r); });
    return g;
  }, [results]);
  const typeLabels = { client: "Clients", policy: "Policies", service: "Service Items", prospect: "Prospects", task: "Tasks", sale: "Sales", certificate: "Certificates" };

  return (
    <div style={{ padding: "8px 12px", position: "relative" }}>
      <input
        ref={inputRef}
        style={{ ...S.input, fontSize: 12, padding: "7px 10px 7px 28px", background: `${COLORS.border}40`, border: "none" }}
        placeholder="Search everything... (⌘K)"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      <span style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: COLORS.textMuted, pointerEvents: "none" }}>{"\u2315"}</span>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 8, right: 8, zIndex: 1000,
          background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)", maxHeight: 400, overflowY: "auto", marginTop: 4,
        }}>
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div style={{ padding: "6px 12px 2px", fontSize: 9, fontWeight: 700, color: COLORS.textMuted, letterSpacing: "0.5px", textTransform: "uppercase" }}>{typeLabels[type] || type} ({items.length})</div>
              {items.map((r, i) => (
            <div
              key={i}
              style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${COLORS.border}20` }}
              onMouseDown={r.action}
              onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 14, width: 20, textAlign: "center", color: COLORS.textMuted }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>
              </div>
            </div>
              ))}
            </div>
          ))}
          <div style={{ padding: "6px 12px", fontSize: 10, color: COLORS.textMuted, textAlign: "center", borderTop: `1px solid ${COLORS.border}20` }}>{results.length} result{results.length !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}

// ==================== MAIN APP ====================
export default function App() {
  const [page, setPageRaw] = useState(() => {
    try { const p = sessionStorage.getItem("sentinel_page"); if (p) { sessionStorage.removeItem("sentinel_page"); return p; } } catch {}
    return "clients";
  });
  const setPage = useCallback((p) => setPageRaw(p), []);
  const [theme, setThemeState] = useState(_loadedTheme);
  const setTheme = useCallback((t) => {
    if (!THEMES[t]) return;
    const c = loadConfig(); c.theme = t; saveConfig(c);
    try { sessionStorage.setItem("sentinel_page", "settings"); } catch {}
    window.location.reload();
  }, []);
  const [data, setDataRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState(null);
  const [config, setConfigAppState] = useState(loadConfig());
  const [toast, setToast] = useState(null); // { message, undo?, timer? }
  const undoRef = useRef(null); // snapshot of data before destructive action
  const [exportModal, setExportModal] = useState(null); // { csv, filename }
  _exportCallback = setExportModal;
  const [clientPopupId, setClientPopupId] = useState(null);
  const [serviceLogModal, setServiceLogModal] = useState(null); // null or { accountId?: string }
  const [lastBackup, setLastBackup] = useState(() => { try { return localStorage.getItem("sentinel_last_backup") || null; } catch { return null; } });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [crmMode, setCrmMode] = useState(() => { try { return localStorage.getItem("sentinel_crm_mode") || "personal"; } catch { return "personal"; } });
  const [cloudSyncModal, setCloudSyncModal] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(() => getSupabaseCredentials() ? "connected" : "disconnected"); // disconnected | connected
  useEffect(() => {
    const onResize = () => { const m = window.innerWidth < 768; setIsMobile(m); if (!m) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const doBackup = () => {
    const backup = { version: APP_VERSION, exportedAt: new Date().toISOString(), config: loadConfig(), data };
    const jsonStr = JSON.stringify(backup, null, 2);
    if (_exportCallback) _exportCallback({ csv: jsonStr, filename: `sentinel-backup-${today()}.json` });
    const now = new Date().toISOString();
    setLastBackup(now);
    try { localStorage.setItem("sentinel_last_backup", now); } catch {}
  };

  const getBackupStatus = () => {
    if (!lastBackup) return { label: "Never backed up", color: "#ef4444", urgent: true };
    const hours = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60);
    if (hours < 24) return { label: `Backed up ${Math.round(hours)}h ago`, color: "#22c55e", urgent: false };
    const days = Math.round(hours / 24);
    if (days <= 3) return { label: `Backed up ${days}d ago`, color: "#eab308", urgent: false };
    return { label: `Backed up ${days}d ago!`, color: "#ef4444", urgent: true };
  };

  const [storageError, setStorageError] = useState(false);

  // Auto-save: debounced persist to storage
  const dataRef = useRef(null);
  const isSeedData = useRef(false); // track if current data is just seed/demo
  const saveTimerRef = useRef(null);

  // Flush pending save on page unload
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (dataRef.current) saveData(dataRef.current);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Auto-save: debounced persist to storage
  useEffect(() => {
    if (data && dataRef.current !== null && !isSeedData.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveData(data);
        saveTimerRef.current = null;
      }, 500);
    }
    dataRef.current = data;
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data]);

  // setData wrapper that can optionally store undo snapshot and show toast
  const setData = useCallback((newData, opts) => {
    // Any user-initiated data change means we should start persisting
    if (isSeedData.current) {
      isSeedData.current = false;
      console.log("[Sentinel] User modified data — persistence enabled");
    }
    if (opts && opts.undo) {
      undoRef.current = dataRef.current;
      const tmr = setTimeout(() => { undoRef.current = null; setToast(null); }, 15000);
      setToast({ message: opts.message || "Done", timer: tmr, canUndo: true });
    }
    setDataRaw(newData);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoRef.current) {
      setDataRaw(undoRef.current);
      saveData(undoRef.current);
      undoRef.current = null;
      if (toast && toast.timer) clearTimeout(toast.timer);
      setToast({ message: "Undone ✓", canUndo: false });
      setTimeout(() => setToast(null), 2000);
    }
  }, [toast]);

  // Renewal auto-generation (app-level) — create service items for policies expiring within renewal window
  const renewalGeneratedAppRef = useRef(new Set());
  const renewalRunningRef = useRef(false);
  useEffect(() => {
    if (!data || !data.policies || !data.serviceItems || renewalRunningRef.current) return;
    const todayStr = today();
    const renewalTypes = ["Ivantage Renewal","2026 Renewal","2027 Renewal","Commercial Renewal","Allstate Termination"];
    const policiesNeedingRenewal = data.policies.filter(p => {
      if (p.status !== "Active" || !p.expirationDate) return false;
      if (renewalGeneratedAppRef.current.has(p.id)) return false;
      const daysToExp = daysBetween(todayStr, p.expirationDate);
      const w = renewalWindow(p.lob);
      if (daysToExp < 0 || daysToExp > w) return false;
      // Dedup: check against current data for any renewal/termination SI on this policy
      const hasRenewal = data.serviceItems.some(si => si.policyId === p.id && renewalTypes.some(rt => si.type.includes("Renewal") || si.type.includes("Termination")));
      return !hasRenewal;
    });
    if (policiesNeedingRenewal.length > 0) {
      renewalRunningRef.current = true;
      let updated = { ...data };
      policiesNeedingRenewal.forEach(p => {
        renewalGeneratedAppRef.current.add(p.id);
        // Final dedup: check the updated object we're building (in case multiple policies for same account)
        const alreadyAdded = updated.serviceItems.some(si => si.policyId === p.id && renewalTypes.some(rt => si.type.includes("Renewal") || si.type.includes("Termination")));
        if (alreadyAdded) return;
        const type = isCommercialLob(p.lob) ? "Commercial Renewal" : (p.carrier === "Allstate" ? "2026 Renewal" : "Ivantage Renewal");
        const newSI = {
          id: uid(), type, accountId: p.accountId, accountName: p.accountName, policyId: p.id,
          description: `${p.carrier} ${p.lob} renewal`, status: "Uncontacted", flags: [], assignedTo: config.agentName || "Agent",
          dueDate: p.expirationDate, urgency: daysBetween(todayStr, p.expirationDate) <= 14 ? "High" : "Medium",
          created: todayStr, amountDue: p.premium || 0, lastAction: "", lastActionDate: "",
          nextStep: "Review renewal terms and contact client", followUpDate: todayStr,
          contactAttempts: []
        };
        updated = { ...updated, serviceItems: [...updated.serviceItems, newSI] };
        updated = addActivity(updated, p.accountId, "service_created", `Auto-generated renewal: ${p.carrier} ${p.lob}`, `Policy ${p.policyNumber} expires ${fmtShort(p.expirationDate)}`);
      });
      setData(updated);
      // Allow re-runs after a tick (once the new data has propagated)
      setTimeout(() => { renewalRunningRef.current = false; }, 100);
    }
  }, [data]);

  const navigateToAccount = useCallback((accountId) => {
    setSelectedAccountId(accountId);
    setPage("clients");
  }, []);

  const navigateToPolicy = useCallback((policyId) => {
    setSelectedPolicyId(policyId);
    setPage("policies");
  }, []);

  useEffect(() => {
    (async () => {
      // Restore config from persistent storage (fills localStorage cache)
      const configRestored = await restoreConfig();
      if (configRestored) {
        setConfigAppState(loadConfig());
      }
      // Load data with retry and error differentiation
      const result = await loadData();
      if (result.status === "loaded" && result.data && result.data.accounts) {
        // Success — real data found
        setData(migrateData(result.data));
      } else if (result.status === "empty") {
        // Genuinely first use — start with empty data
        const empty = createEmptyData();
        isSeedData.current = true;
        setDataRaw(empty);
        await saveData(empty);
        console.log("[Sentinel] First use — starting with empty database");
      } else if (result.status === "error") {
        // Storage failed after retries — show empty data but DON'T save over real data
        const empty = createEmptyData();
        isSeedData.current = true;
        setDataRaw(empty);
        setStorageError(true);
        console.error("[Sentinel] SAFE MODE: Storage temporarily unavailable. Your real data is NOT lost.");
      }
      setLoading(false);
    })();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't fire if typing in an input/textarea/select
      const tag = (e.target.tagName || "").toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      const inModal = e.target.closest && e.target.closest("[data-modal]");

      // Escape: close client popup first, then modals / go to briefing
      if (e.key === "Escape") {
        if (serviceLogModal) { setServiceLogModal(null); return; }
        if (clientPopupId) { setClientPopupId(null); return; }
        if (!isInput && !inModal) { setPage("briefing"); return; }
      }

      // Ctrl+L: open service log modal from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        setServiceLogModal({});
        return;
      }

    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPage, clientPopupId, serviceLogModal]);

  const openClientPopup = useCallback((accountId) => setClientPopupId(accountId), []);

  if (loading || !data) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.accentLight }}>Sentinel Platform</div>
        <div style={{ color: COLORS.textDim }}>Loading...</div>
      </div>
    );
  }

  const nav = navigateToAccount;
  const navPol = navigateToPolicy;

  const renderPage = () => {
    switch (page) {
      case "briefing": return <MorningBriefing data={data} setPage={setPage} nav={nav} config={config} />;
      case "dashboard": return <Dashboard data={data} setData={setData} nav={nav} config={config} />;
      case "service": return <ServiceBoard data={data} setData={setData} nav={openClientPopup} navPol={navPol} config={config} setPage={setPage} />;
      case "retention": return <RetentionTracker data={data} setData={setData} config={config} />;
      case "allstate": return <AllstateHub data={data} setData={setData} nav={openClientPopup} navPol={navPol} config={config} setPage={setPage} />;
      case "outreach": return <OutreachHub data={data} setData={setData} nav={openClientPopup} config={config} onConfigChange={setConfigAppState} />;
      case "pipeline": return <Pipeline data={data} setData={setData} nav={nav} config={config} />;
      case "sales": return <SalesLog data={data} setData={setData} config={config} />;
      case "clients": return <Clients data={data} setData={setData} initialAccountId={selectedAccountId} clearInitial={() => setSelectedAccountId(null)} config={config} onLogService={(accountId) => setServiceLogModal({ accountId })} />;
      case "policies": return <Policies data={data} setData={setData} nav={nav} initialPolicyId={selectedPolicyId} clearInitialPolicy={() => setSelectedPolicyId(null)} config={config} />;
      case "certificates": return <Certificates data={data} setData={setData} nav={nav} config={config} />;
      case "tasks": return <Tasks data={data} setData={setData} nav={nav} config={config} />;
      case "calendar": return <CalendarView data={data} nav={nav} config={config} />;
      case "reports": return <ProductionReport data={data} config={config} />;
      case "settings": return <Settings data={data} setData={setData} theme={theme} setTheme={setTheme} onConfigChange={setConfigAppState} />;
      default: return <Dashboard data={data} setData={setData} nav={nav} config={config} />;
    }
  };

  return (
    <div style={{ ...S.app, flexDirection: isMobile ? "column" : "row" }}>
      {/* Font loaded in index.html */}
      {/* Mobile header */}
      {isMobile && (
        <div style={S.mobileHeader}>
          <button style={{ background: "none", border: "none", color: COLORS.text, fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }} onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.accentLight, flex: 1 }}>Sentinel</span>
          <span style={{ fontSize: 13, color: COLORS.textDim }}>{NAV.find(n => n.id === page)?.label || "Dashboard"}</span>
        </div>
      )}
      {/* Sidebar backdrop (mobile) */}
      {isMobile && sidebarOpen && <div style={S.backdrop} onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar */}
      {(!isMobile || sidebarOpen) && (
      <div style={isMobile ? S.sidebarMobile : { ...S.sidebar, width: sidebarCollapsed ? 56 : 220, minWidth: sidebarCollapsed ? 56 : 220, transition: "width 0.2s ease, min-width 0.2s ease", overflow: "hidden" }}>
        {!sidebarCollapsed && <div style={{ padding: "24px 16px 28px", borderBottom: `1px solid ${COLORS.border}`, marginBottom: 4, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAB9gAAALlCAYAAACPYD00AAA34UlEQVR4nO3dXXLcOLYu0K2yR9dhj+AOQhk1kA7p9QzgTkCKMztJ9yGd13I6k9oESRAA14rIqO4qpfgPUvi4gYePj48AADiAl4j4z9W/+2fjZb7f+HffNl4mAAAAAAAbeRCwAwAd+hyWbx2S7+kS0AvlAQAAAAAaIGAHAFpzCc9HDs7XJIQHAAAAAKhEwA4A7OEtBOi1vIfwHQAAAABgFQJ2AGBLgvR2Cd4BAAAAAGbS4Q0ArOElIj5ufDxrtOufuH3MHvdcKQAAAACAlqlgBwDmeomIH3uvBFWdIuJ575UAAAAAANibgB0AmPIYEU97rwTNMbw8AAAAAHBIAnYA4DPV6ZR62HsFAAAAAAC29n3vFQAAdiVQZy3Xb20K3AEAAACA4fyz9woAAFW9xDkIvXyOFK6/X30eKn1ebyz7CD6uPgAAAAAA3TNEPACMb8Sb/SWk/t+I+Lnnimzs7dc/R3sp8jXGPm4AAAAAwKBG66wFAP6uUu/Re0Sc4n5V+Ldfn9FD2st2TlXI91gR/yP6P0cBAAAAgANSwQ4AY+jxhv4e5/CY7bxFfy9UmrsdAAAAAGhWbx2uAMBvvVQAv8b9KnS2da/6veWq98/n9ePO6wIAAAAA8AcBOwD0peVQ/T1uh7mjD+Peo1vB+2nPFbrjKYTtAAAAAEBDDBEPAO1r9WZtKO/xvcR5vvTWnCLiee+VAAAAAACOR8AOAG1q7Qb9GirROWttXncvegAAAAAA1bTUOQoAtOMUhnnntuvh5feez73VKRMAAAAAgAF933sFAIAmqAKm1Ler/99ahTsAAAAAwGp0fgLAMZ3izyrko3mb+HwUfKZ+39FcV7gDAAAAAAxDBTsAHMN7/F1pPIJLgL33S4NTy587fPllyPVRjtfnkP0lIn7stSIAAAAAAEvt3RkNAGznFL+riHsMazPV5P/EeM8zl23KVM335meobgcAAAAAOjZahzQAHN3n8PJ553X5ymNMh+ieU6ZNhfBvcd6/rRO2AwAAAABdefj4mDtqKQBQwZwbdOvh5GNE/DcE5i14j4h/o/2XL0qG1e9xlAYAAAAAoDMCdgBo01c36FZDdXNs96nlgDrzsNry+gMAAAAAA/m+9woAAGmtherC9HFchpv/rJXQ+vN5781QAAAAAGBXhmoFgLadop05qq/nSxeuj+3WHO97z+tuzvbf3uLva3Kvz2VdAAAAAGB4hogHAO7xkMBXXiPi587r8BIR/4k2qu3X9hgRT3uvxEKtjISwFu3iWSsvuaxxPFrZlj3M2X8t7CfXX5nax6638+oWbcsyb5Ev6NlzP2lTzlo4V0doNwCAg1HBDgBcXFelwld+xJ/nzMsO6/AzxglwH+PP/fm069qs43okhD3OEZjifgdsQdsCAAADE7ADwHG9xDED9fc7n4cVPvd+91FcB+57Dynfi5EC9a98PkecH7TiSPdAoB5tCwAADMoQ8QBwLKPd+C/h9b8R8bzniqzkMSL+++t/j/gipCEd/zbaNVniFP1cv47XWSvX8trHo5XtqqW3IXldf2UMET+ftmUZQ8T3pYXzc4R2AwA4GAE7AIyv15v9JTwfZfjvNb39+mfPIfwp+glVt9DrdbmlHjpMHbezVo7VFsejlW2robdAw/VXRsA+n7ZlGQF7X1o4N0doNwCAg+m5UxYAuO16HufWvcbt4da/hXD9nsu+ubXfXqOPYemf4rjzcvdwXe7BfqEFzkNgC9oWAAAYiAp2ABhH6zf114j4ufdKHNhj9DPH9+iVKa1fq3tr+fg7dmetHKMtj0cr27il3ioGXX9lVLDPp21ZRgV7X1o4J0doNwCAgxGwA0DfWryRv4fK857M6QTdw2idaC1esy1q9bg7fmetHJ+tj0cr27mV3gIN118ZAft82pZlBOx9aeF8HKHdAAAOpuXOVADgtpdoa/j3U/w9tDv9uDXUfEtDzPc03cFXam3D+wYfOKIR2h2gPdoWAADo3Pe9VwAASGulM07VwPiuX5J4iYgfe6zIlcs1cOTpBk4R8bz3Styx5nnyEW22NV42OJ5Wz8UjauH6m1uk0MI60yZty/5cnwAAFDNEPAC0r6WbtY5AWjofI/o5J5cOxd/Ldn72GBFPC77f4zZT19whZZe0XyOej4bkLZPdb0edMmeE80rbskwvQ8TTjhHaDQDgYATsANC2Fm/UOjWOrbVzspcAo3S/jXK9HX372UZJh7wg7DeBRhkB+7QRzittyzICduYaod0AAA7GHOwAwGnvFYAF/t17BTY0UgfiSNtC35aci629YAS0Q9sCAAAHooIdANq21Y36VidgdlmCsuPKViRdV+1t+cDZy/k4dx/0sl1z2Q+saUnFm2pTFYOlVLBPG+G80rYso4KduUZoNwCAg1HBDgBte1/xdz18+kBNn8+915V/9/+s/Pu28DLz59feRy2Z2/48brIWoNoU2Ia2BQAADkAFOwC0bU4FyC1zOvlUsPOV7DlyiojnxM89RsRT6cr80sP5OPc67mGblpjzB8hRK0DJWaPi7cjVpioGy6hgnzbCeaVtWUYFO3ON0G4AAAcjYAeA9tUaUlmHMV/Z8iWM0rC9h042w6L/6SUifsz4+dH3B+XW6pA/ahAm0CjjeWnaCOeVtmUZATtzjdBuAAAHI2AHgPbVqizXGcZXnItl5jxwv0bEz61WpCE6UlnDmufREYMw12EZAfu0Ec4rbcsyoz3Hsb0R2g0A4GAE7ADQvppDtxsmnikC9jI6Df9mn7CGtc+jowVhrsMyAvZpI5xX2pZlRnuOY3sjtBsAwMEsmdMVAIDjeKy4LM+owB6WdNp7cx24R9sCAACD0XkJAON423sFGNrT3itww//dewWA4QjCgC1oWwAAYCACdgBo33vy52re118qLou+vFZc1v+puCzgOARhwBa0LQAAMAhzsANAH8x9zd5qnYO1l1XDnAfuo8zZq61hDVvP2Tr6vMnmvC1jDvZpI5xX2pZl3OOZa4R2AwA4GBXsAMBn/+69AhzeiFMdZEehiDjO8/m3OHeQZj6wF9WmwBa0LQAA0LmjdOABwFE8Lvz+8yprwWhqTgng+RRoyZIgbOk9GRiXkB0AADpmiHgA6EPNYfNGG56b5Zx/yxkmHtbXYtt07RTtvrxmSN4yhoifNsJ51UPbssayt2KIeOYaod0AAA5GhRAA9OF17xW4wVt6XDvtvQKD8IwO7Snt0H8KlezAfSrZAQCgQzrvAKAPPysuq8Uwnz4srdKsORR963SaQ3tOhd97CiE7cJ+QHQAAOiNgB4DxLO3Erxnm076aofePisuqreTFFZ3m0JbnELID2xCyAwBAR8zBDgD9aHE+yFO0O7cs62jxvOt17sUR51mFPe01Z+tjnAPzEqdo575pztsy5mCfNsJ5tec2jPCsYA525hqh3QAADkYFOwD0o8Wh25/2XgGacdp7BQb38eujAhb2p5Id2IpKdgAA6IAKdgDoS60K35fID9etimBstc65o1SurP3w/Rqmdajpbe8VaEgLlbl7txtLKtlbaMf23n+9UsE+bYTzqoVtKH1eOMX+o2T0UsHunv7b3m1VC9ccAMAsAnYA6IvhuqmpxfNtjWXtaY+H7/cv/vvenao98cfTby1chy20Gz2H7C3svx4J2KeNcF61sg29huy9BOzu6b/tfS22cs0BAKQZIh4AWErnFDX13qm2x/r/88XnY8PPW5xHxIBRLRku3v0TmFL6zPAUpqIAAIBNCdgBoC+9h4uMaY0pCY7kSNfxP3GebuJW+H604864hOzAVoTsAADQIEPEA0B/sjfvNeZmNkz8cRkefnsexP/Uw7F1zH5r4Xi11nb0Nlx8a/uvF4aInzbCedXiNvQ0XLwh4vuz97XY4jUHADBJBTsAjOtHxWWpRKWG094rsDIdhH9S1U7vVLIDW1HJDgAADRGwA0B/TnuvwA01w3zaclr4/TmBau0KrBoeQtD+2WU4eeiVkB3YipAdAAAaYYh4AOhTrWHi5wx3KyQcx0vkX5owPPy6PJz/1uLxdnx+a+H4tNx+LDlXWhxyuoXj3QpDxE8b4bxqeRt6mIrCEPH92ftabPmaAwC4ScAOAH1qcX7sNeZ8pw3OrzZ4UG+vE9Ux+a2FY9N6h3zrIXvr+69VAvZpI5xXrW9D6yG7gL0/e1+LrV9zAAB/MUQ8APTpde8VuMEw8cdzWvj9OcPDHy1cj/g9fPxDtDk1BDBtSQgg+AHuMRUFAADsTAU7APTLMPFsocXq9TWWNaqXiPhPjP3irGPPPb20Ia1Wsvey/1qjgn3aCOdVL9vQaiV7LxXstKOXaw4A4P8TsANAvwShbKHF8+qIw8PX8BgR/y38bs1A3/Hnnp7uTS2G7D3tv5YI2KeNcF71tA0thuwCdubq6ZoDAIgIATsA9Owl8sOyC9jJyh7rU5yHKN16ORHOqZ7N6WSf4hzglt7akdZC9t72XysE7NNGOK9624bWQvaaf6Mwht6uOQAAATsAdK5WZ4Rh4o+hxer1NZZFO0r/+HAOcEuP7UivIXsr+68FAvZpPV6X13rchtZCdm0Lc/R4zQEABzfyXI0AwHrmVCp7e481nfZeAVb1EOch3+d6WXtFYCdLgoEt7q+CChjDc5Q/M2lbAABgJgE7APTtNONnH7daCYYwJ8CsWb2+ZBh62lQyn3p2qFnogZAd2IKQHQAAKjFEPAD0r8VhvV+jLERjPy2eR2ssi3bN/UPEucC13tuSnoaLb3H/7cUQ8dN6vy4j+t+GnoaLb3H/UV/v1xwAcEAq2AGALag25Z63GT+rA21sJUPFw0hUsgNbUMkOAAAbU8EOAGOo9da/6oIxqV7fxpyXCY5Y5RhxrPOB9Y1y/vRQyd7y/qtNBfu0Ea7LEbYhQttCP0a55gCAA/m+9woAAF15iHwHyEfoAKHc+94rsAKjRQEZc+6t17a41y5ZH6Ad2hYAANiITj8AGMOcoZYfN1sLevQy42dPC5c1p1P1iFV/wHEZLh7YgrYFAAA2YIh4ABhHraH1HiPiqdKy2J7h4bdztO0tYR+xxIjnT6tDOvey/2owRPy0Ea7LEbbhmraFlo14zQEAgxOwA8A4BKWUqHUsj3jOHHGb53qL/KhaR91H3DfqNVb6R/prRPxcc0V+MeXLnwTs00a4LkfYhltaDNl72n9sZ9RrDgAYmCHiAWAcczoblr5hN2d+bEPSt0tnFnvz9wj8rbS9/RHb3HO1/zAGw8UDAMBKVLADwFhUsTNHrWM4p0p5pIo/18jX7COWGP38Kf1j/RQRzyuuB39SwT5thOtyhG2Y0lolO4x+zQEAA1IxAgBjOc342Zpv2alib8+c439auKw5z5xHDCMi6l6PQB9KQ4SncN8F7mutkh0AALqjgh0AxqOKnYxax+4xzmFPjWW1Zu6D9kjbnqUNYYmjnD8q2duign3aCNflCNuQoZKdVhzlmgMABiJgB4Dx1ByOW2dIn+YcN+dIuTnXYsR42/8V+4eljtS+CNnbIWCfNsJ1OcI2ZAnZacGRrjkAYBCGiAeA8czpzF36LHCa8bPe6uvTknDg6EMUz913R7tG/C0CeYaLB7ZguHgAACiggh0AxqRCmXtqVg07NwwTf0/JHyFH2TfkHbGNKf0DfpTtb4EK9mkjXJcjbMNcpW3La0T8XHNFOKQjXnMAQOdUjQDAmOZ0PCx9Hnid8bPe7NtfrXBdxWSZjxh/3wnXoVzpteD+C0wpbVt+xPjPLQAA8BcV7AAwLlXsXGu1ev0U484RPHefX4xaEab6ljUd+d7jWtqPCvZpI1yXI2xDqdK25RTjPsuxvSNfcwBApwTsADC2Wp0VNYNbytXsvNJR9tvSB+7e989LnCvcluh9H7CNo7czQvZ9CNinjXBdjrANSwjZqe3o1xwA0KHve68AANCMtyjvCP4Whp9t3VvFZc2tXmfa9f58j4j/jfYq3B8j4r+x/jRULXWkaufOWjomR/YQZefkRziGwH2lbcvTr3/2ErK7p5/1dj84wnHr7ZgAwCGpYAeA8aliJ6LeefAYvztYt15WTzx0l2vpHHEcz1o5JirezlSy16WCfdoI1+UI27CG0SvZ3dPPWjiHHYs/tXBMAIAvrF1dAgD0bUmV8xE7kXtRs9PqacbPnjZaB8ahgxG+VnqdCDSAKaVty1OcX7gEAIBhqWAHgGOoVYkz98FCeFaH6vU2ePCep8XzwzE8a+XYqDL9k0r2OlSwTxvhuhxhG9Y0atvinn7WwnFyLP7UwjEBAL4gYAeAY6gZfOuUbEurx/412ptDvAYP3zmttg2O31krx8f95m+jBmEtEbBPG+G6HGEb1jZi2+KeftbCMXIs/tTCMQEAviBgB4DjMBf7MTnu7fEAPq3lc8OxO2vlGAnBbhsxCGuJgH3aCNflCNuwhdHaFvf0sxaOj2PxpxaOCQDwBXOwAwC3LOnkmNuZbI7G7dTsrJrzXHnaaiU68RA6zm45hf0CazAnO7AFbQsAAPyigh0AjkU187HUOt41h6EfkQfyfs4Jx+qsleOlynTaaNWmrVDBPm2E63KEbdjSKG2Le/pZC8fFsfhTC8cEAPiCCnYA4J6aVexvC5bFba12VJ32XoEGPcQxq9qPut1Qi2pTYAvaFgAADk/ADgDHMrdDbMnw7e8zftYzybrmHrea1evPC5Z1BA9XnznXUcve4+9tA7Z3KvyeIAyYImQHAODQDBEPAMdTczhvQ4fvo9Vj7Piu6/PID3u+pHJ5CeDf8AIFAAAAAIMTsAPAMc15AFgyh+hjRDzN+HkB7HKthutLlwUAAAAAsDsBOwAc01vMq3gVwvaj1ssTLxHxY8bPO64AAAAAQPfMdwoAxzQ3VF3yRt7cYPVlwbKObu5xKg3XI+aF6wAAAAAAQxCwA8Bxve69AncIbus4LfiuUQkAAAAAgEMyRDwAHJv5usfR6rFcMgw9AAAAAEBTVLADwLHNDVnfFizrfcF3mdZquB4hXAcAAAAABiJgBwDmWPLsUHPed7Yx9wULoxAAAAAAAEMRsAMAc0PQJcH3aebPL6mYP4qa1eueHQEAAACAQ9NJCgBEzB++/aVwOc8zf96zyrS5LyC8LlhWzSAfAAAAAKBJDx8fRl8FACKi7Xm8hbW31dqPLxHxY8bPv4e51wEAAACAAakKAwAuag4VP1dpxfzIar6kMCdcjxCuAwAAAACDErADAHuYG/bODXhHV/OFA6MNAAAAAAD8ImAHAD6rWcXecsV86+a+cLBkaHgAAAAAAH4RsAMA104zf95Q8XW1PDS86nUAAAAAYGgCdgDg2nPBd0qDb0PFz9Py0PCvm6wFAAAAAEBDHj4+jLYKANxUq1L6JVRKZzkmAAAAAAA7UsEOANwztyK59K29nwXfeStcVs9qVpQL1wEAAAAAblDBDgBMmfug8B4R3yot60ihbskDW+n+KQnyS16SAAAAAADojgp2AGDK3JB2ybNFrYr5IygN10tGBhCuAwAAAACHIWAHAL7S8lDxRwjZaw4NP/fZ8EijCAAAAAAACNgBgC/VDL5LAtvHwmX1oGQ/llaU1wzyAQAAAAC6JGAHADJqBt9zl/VUuJzWvRR8p9a86xGGhgcAAAAADkjADgBknWb+/NMG63DPiEPF/5j586Xhes0gHwAAAACgaw8fHyP2RwMAGyl5cKhZVT1K8Nvyfh5lHwMAAAAAzKaCHQCYoyRcNR/7PC2H6wAAAAAAhyZgBwDmqhl8v8/8+afC5bSi9XnXVa9D27w0s8zbr8/Hjc/lvwHzXK6pIzjKdtZ0qz2+9RnhJVsAADoiYAcAStQKvr8VfKfnzs25866/Fi6nJCQSrjO66876Xm0dNIyynyLO++nztvwT9/9Gvvy3kbZ/y20ZYT9lg73Mp+QFulFcrqmjvKCiDV6uZPueYpzrbc22594HAICFzMEOAJRqfSjz3gLhlvfna0T8LFwW9OL6uuitDYmosw0j7KeI9QOGHvfDlsdyhPNkq86SHvdFqRHOgzm0wcusfc29R9nLunur0VE70nkDALALFewAQKnW52PvqXql5XA9QrgOvfI29d8uVeuwl6Ocf7eew46y7RdH295Sc6qq3z99vnIZdQQAAFYnYAcAlqgZss81d7j1vbQerqtwgb6Zm/ZPT3f+/UPyUzo1B2N4n/m55wih373nsJ5egFyDNnja1LXwHn+3wd8+fT7/+9Oma7m/uW1PadsEAECSIeIBgKVKHiZOEfFcaVktB8SPMX9++tLhLkfbd7C2EYbd/eo6X2Obet5PL/F36Ldk/d/i90vrPe2HC0PET1tzG25dmz3uk6wabVGLtMHz3Ntfpyj7O+He7+1tH/W+/gAAhyBgBwDWoAq7TK1t+RwCZZl3naMZoUM706Ys3a6e99P1uq81P+9H9LUfLgTs09behiOF7DXaohZpg/Pu7au1tufzC1W97aNRjjEAwNAMEQ8ArKH1+dhbfKOwVrj+GGXPfMJ1GJPhin9bI1yPEH6Qc5TpBW493xiS+jdt8PbhesT5OVbbDADAZlSwAwBrarkiu3RZW1DxD+0ZoWLs1jZMtQFrvLDU0346UgVxhgr2aSrY55vaxiNuvzb4tiOcC0uMcIwBAIangh0AWFNJdVZJAFxaddhCxVDpnPW1lqUTD8YydU0f7W3rW/viaPuAdhyhqvvzNh71+nuI+8f6CNt/TbgOAMAQBOwAwJpKhxV/K/hOSWfcU8F31lTakfpcaVk6ONf14ZP+sK2HuH99G67493n4sveKMKTHuN3OrTVFQSsy23iElwpu+RbaYMqNcn7s/azZ0wcA6IAh4gGALZQ8YJxi7CD5McoC/lpzzr/HeJ39e/OgndfCyx3Xx6uFdZorsw1T52Vmm0fcT1Neo/zlsdZteSyPdp6U6HGf3HNr6p6pQPnaKPtCG/y13te/hi3anhae8z0X57kuAKADAnYAYCu1gu+awfUStfZH6cOdjpz1edDOa+H8G6HTP7sNSwKeEfZTxLLrc5TQXcA+bcs2vMf9MWVuaD5qyK4N/lrv61+DgB3XBQB0wBDxAMBWaoXDz1E25GjNTp6aLxuU0IkDx/LVkPFHcNkHp4Lv/gjDylNm6trr1ahh+ZZM2wEAAJ1TwQ4AbKn1YdFLlzVHreHye6nkh1aNUFVXsg1zKylH2E9Tbg11ndHjflDBPu3WtZF5oe/W+dPj9mfcu16+2t6XOL+oMvd7rdMGf6339a+htO2Zsnf1OgDAcATsAMDWagbfrYXsNedC72UuemjVCJ3+pdswJ+AZYT/NlX2Bqbd9IWCftmQbjlLVvXaHUgvDWC+hDf7a9fqPMuXGmno/xgAAh2CIeABga6WdQjUD47fC700p7XSuFa6fCr4DjGlqqHRvZJ9HFHn49Dnd+bne99Va98It7qm9OUIgtsX5ftQ+qiMPGX9rJAMAAGieCnYAoJbWK9lPMX9Y9jWXHzFG1T70aoSKsTW24atKyhH201p6r1Leav173y8XS8/1UfbDLfeGeF9Lr/tJG/y1WyOCnGK9Z/AR9H6MAQAO4ahvBwMA9bVeyf4U61QICdeBnk21D97O/tOtffVSfS3K1boXnCotpzWZ+bN7dW/+9JLP643f1dN1tLbR2+BbQfpTbFelP8I+AwCgQSrYAYDaaoXC2Tlzly7nM+E69GuEirE1t2HEecffYv35nXs/b9aush6panuNY3ur0rvX/XGxxTEe5bzRBufVOOaXZfS2j3q/rwAAHIIKdgCgttJOormVLaVDTS55+/BU8B3hOtCiy7zjo/mI9SoaR5gXec0q61vfOxX+rlH8vPHvRqtyuFWBPtfI1f6lRm2Dp3zE+UWotX4XAABsRgU7ALCH0uryU8wPzvcIo7PLPEUf2wNHMELF2Fbb8NWcwL14i79fMl97+pKe9sfFrf0SEfEeuYr/qfm4e9wfF2teT9e/K7tvW7Nl1fGa1+detMHzTG1X6TUywmgIIzyPAAAMTwU7ALCH5yireHqK+RWDNed+n7PMUwjXgT48xLiVyB+fPl9VTr7EdAV8r23tvRDrn5jeL2+//vuI4fra3q/+f499MVsHl7fOQxUhZ6O2wQ9x/++BS/tzaYNe7vzcY/zZjo/oY4MPAAALqWAHAPZU+iByij7C6TUrjoTrsK0RKsZqbEPP++lepfYaetoP96zZOTDi/jj6POO1qvB73k/a4HJbdU6eonzaqL3U6Kgd5bwBANjN971XAAA4tIco60R6+vXPOR1mpcv6iPJOqHvLrBWunwq/B3BPaVvagksYuPb6jxJUXLZj6xFcjurWtfMWfQwVf+uc2Gq936PPCv9aem6Dp6zR/nz2GhE/V/pdAADwF3+0AAB7K+2Mf4o+h4uvGa73VrEDLPN+9dnK1LC+PXiI5UMunz79ntGUbNep4Dut2+J6et3gd9ZwvS+2PNbfbizvq+kbWlGzDT5t+Pv3dGl/Svff5fs9h+vX59EWHwAAFjJEPADQiiMMF18rXN9q2FaAI3iMiP9++v/a07PLfvk3vMAF7OMlIv4T2mUAAHYmYAcAWjJ6yD6HIXoBAAAAABpjiHgAoCWjDxdfYxnCdQAAAACAjQjYAYDW1AzZT4XL2jJkF64DAAAAADRKwA4AtKhWyP4cbYXswnUAAAAAgIYJ2AGAVh0tZBeuAwAAAAA0TsAOALTsKCG7cB0AAAAAoAMPHx9bTiEKALCKWgH0Y5zD+a2X85lwHQAAAACgEyrYAYAeLAmS5wTYzwuXM6dq/vKdUsJ1AAAAAIDKBOwAQC9qhOxLh/Z5inzILlwHAAAAAOiMIeIBgN5sFUyv+VD0GhE/N1qWcB0AAAAAYCcCdgCgR2sH1Fs9EK29LOE6AAAAAMCODBEPAPRozeHit3zb8PPvfly4LOE6AAAAAMDOBOwAQK+WhuxLA+85y3qJ8/zspYTrAAAAAAANMEQ8ANC70R9mhOsAAAAAAI1QwQ4A9G7UAPoU424bAAAAAECXBOwAwAhqBdEPlZZ1iojnCssBAAAAAGAGATsAMIqtg++HO/97bacQrgMAAAAANOn73isAALCih1h/TvbXiPhZaVmGhAcAAAAAaJgKdgBgNA9xrgJfwyluh+ufl7UW4ToAAAAAQONUsAMAI7oMsf604HdkA+81KtmF6wAAAAAAHVDBDgCM6jnKg+u531tSNS9cBwAAAADohIAdABhdSVhe4jnmh+zCdQAAAACAjjx8fCwd0RQAoAuZh561Au+vlvUeEd9WWhYAAAAAAJWoYAcAjuKr8HzNavKp33UK4ToAAAAAQJe+770CAAAVPcTf1eWvEfGz0rIMCQ8AAAAA0DEV7ADA0TzE77nST7FNuP55Wbf+NwAAAAAAHTIHOwAAAAAAAAAkqGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAECCgB0AAAAAAAAAEgTsAAAAAAAAAJAgYAcAAAAAAACABAE7AAAAAAAAACQI2AEAAAAAAAAgQcAOAAAAAAAAAAkCdgAAAAAAAABIELADAAAAAAAAQIKAHQAAAAAAAAASBOwAAAAAAAAAkCBgBwAAAAAAAIAEATsAAAAAAAAAJAjYAQAAAAAAACBBwA4AAAAAAAAACQJ2AAAAAAAAAEgQsAMAAAAAAABAgoAdAAAAAAAAABIE7AAAAAAAAACQIGAHAAAAAAAAgAQBOwAAAAAAAAAkCNgBAAAAAAAAIEHADgAAAAAAAAAJAnYAAAAAAAAASBCwAwAAAAAAAEDC94j42HslAAAAAAAAAKB1/w9t8klmCZ+6MgAAAABJRU5ErkJggg=="
            alt="Sentinel Insurance"
            style={{ width: "100%", height: "auto", maxHeight: 100 }}
          />
        </div>}
        {/* CRM Mode Toggle */}
        {!sidebarCollapsed && (
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
              <button
                style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: crmMode === "personal" ? 700 : 400, cursor: "pointer", border: "none", background: crmMode === "personal" ? COLORS.accent : "transparent", color: crmMode === "personal" ? "#fff" : COLORS.textDim, transition: "all 0.15s" }}
                onClick={() => { setCrmMode("personal"); try { localStorage.setItem("sentinel_crm_mode", "personal"); } catch {} }}
              >Personal</button>
              <button
                style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: crmMode === "commercial" ? 700 : 400, cursor: "pointer", border: "none", borderLeft: `1px solid ${COLORS.border}`, background: crmMode === "commercial" ? COLORS.accent : "transparent", color: crmMode === "commercial" ? "#fff" : COLORS.textDim, transition: "all 0.15s" }}
                onClick={() => { setCrmMode("commercial"); try { localStorage.setItem("sentinel_crm_mode", "commercial"); } catch {} }}
              >Commercial</button>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}` }}>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "4px 8px", color: crmMode === "commercial" ? COLORS.accent : COLORS.textDim, fontWeight: 700 }}
              onClick={() => { const next = crmMode === "personal" ? "commercial" : "personal"; setCrmMode(next); try { localStorage.setItem("sentinel_crm_mode", next); } catch {} }}
              title={crmMode === "personal" ? "Switch to Commercial" : "Switch to Personal"}
            >{crmMode === "personal" ? "P" : "C"}</button>
          </div>
        )}
        {crmMode === "personal" && !sidebarCollapsed && <GlobalSearch data={data} onNavigate={navigateToAccount} onNavigatePolicy={navigateToPolicy} setPage={setPage} />}
        {crmMode === "personal" && <div style={{ marginTop: 4 }}>
          {NAV_SECTIONS.map((section, si) => (
            <React.Fragment key={si}>
              {section.label && !sidebarCollapsed && <div style={{ padding: "12px 20px 4px", fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.label}</div>}
              {sidebarCollapsed && si > 0 && <div style={{ height: 1, background: COLORS.border, margin: "4px 8px", opacity: 0.3 }} />}
              {section.items.map(n => (
                <div key={n.id} style={{ ...S.navItem(page === n.id), justifyContent: sidebarCollapsed ? "center" : undefined, padding: sidebarCollapsed ? "10px 0" : undefined }} onClick={() => { setPage(n.id); if (isMobile) setSidebarOpen(false); }} onMouseEnter={e => { if (page !== n.id) e.currentTarget.style.background = `${COLORS.accent}08`; }} onMouseLeave={e => { if (page !== n.id) e.currentTarget.style.background = "transparent"; }} title={sidebarCollapsed ? n.label : undefined}>
                  <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{n.icon}</span>
                  {!sidebarCollapsed && <span style={{ flex: 1 }}>{n.label}</span>}
                  {!sidebarCollapsed && n.key && <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace", opacity: 0.5 }}>{n.key}</span>}
                </div>
              ))}
            </React.Fragment>
          ))}
          <div style={{ height: 1, background: COLORS.border, margin: "8px 16px", opacity: 0.3 }} />
          {NAV_BOTTOM.map(n => (
            <div key={n.id} style={{ ...S.navItem(page === n.id), justifyContent: sidebarCollapsed ? "center" : undefined, padding: sidebarCollapsed ? "10px 0" : undefined }} onClick={() => { setPage(n.id); if (isMobile) setSidebarOpen(false); }} onMouseEnter={e => { if (page !== n.id) e.currentTarget.style.background = `${COLORS.accent}08`; }} onMouseLeave={e => { if (page !== n.id) e.currentTarget.style.background = "transparent"; }} title={sidebarCollapsed ? n.label : undefined}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{n.icon}</span>
              {!sidebarCollapsed && <span style={{ flex: 1 }}>{n.label}</span>}
              {!sidebarCollapsed && n.key && <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace", opacity: 0.5 }}>{n.key}</span>}
            </div>
          ))}
        </div>}
        {crmMode === "commercial" && <div style={{ marginTop: 4, flex: 1, display: "flex", flexDirection: "column" }}>
          {!sidebarCollapsed && <div style={{ padding: "12px 20px 8px", fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Commercial CRM</div>}
          {!sidebarCollapsed && <div style={{ padding: "8px 20px 12px", fontSize: 12, color: COLORS.textDim }}>Navigation is in the commercial module panel</div>}
          <div style={{ height: 1, background: COLORS.border, margin: "8px 16px", opacity: 0.3 }} />
          {NAV_BOTTOM.map(n => (
            <div key={n.id} style={{ ...S.navItem(page === n.id), justifyContent: sidebarCollapsed ? "center" : undefined, padding: sidebarCollapsed ? "10px 0" : undefined }} onClick={() => { setCrmMode("personal"); setPage(n.id); if (isMobile) setSidebarOpen(false); }} onMouseEnter={e => { if (page !== n.id) e.currentTarget.style.background = `${COLORS.accent}08`; }} onMouseLeave={e => { if (page !== n.id) e.currentTarget.style.background = "transparent"; }} title={sidebarCollapsed ? n.label : undefined}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{n.icon}</span>
              {!sidebarCollapsed && <span style={{ flex: 1 }}>{n.label}</span>}
              {!sidebarCollapsed && n.key && <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace", opacity: 0.5 }}>{n.key}</span>}
            </div>
          ))}
        </div>}
        <div style={{ flex: 1 }} />
        {!sidebarCollapsed ? (
        <div style={{ padding: "8px 16px" }}>
          {(() => {
            const bs = getBackupStatus();
            return (
              <button
                style={{ width: "100%", padding: "8px 12px", background: bs.urgent ? `${bs.color}20` : "rgba(255,255,255,0.08)", border: `1px solid ${bs.urgent ? bs.color : "rgba(255,255,255,0.15)"}`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 12 }}
                onClick={doBackup}
                title="Export full database backup as JSON"
              >
                <span style={{ fontSize: 16 }}>💾</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>Backup Now</div>
                  <div style={{ fontSize: 11, color: bs.color, marginTop: 2, fontWeight: 600 }}>{bs.label}</div>
                </div>
              </button>
            );
          })()}
        </div>
        ) : (
        <div style={{ padding: "8px 0", display: "flex", justifyContent: "center" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 8, color: COLORS.textDim }} onClick={doBackup} title="Backup Now">💾</button>
        </div>
        )}
        {!sidebarCollapsed ? (
        <div style={{ padding: "4px 16px 0" }}>
          <button
            style={{ width: "100%", padding: "8px 12px", background: cloudSyncStatus === "connected" ? `${COLORS.success || "#22c55e"}20` : "rgba(255,255,255,0.08)", border: `1px solid ${cloudSyncStatus === "connected" ? (COLORS.success || "#22c55e") : "rgba(255,255,255,0.15)"}`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 12 }}
            onClick={() => setCloudSyncModal(true)}
            title="Cloud Sync Settings"
          >
            <span style={{ fontSize: 16 }}>{cloudSyncStatus === "connected" ? "\u2601\uFE0F" : "\u2601"}</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>Cloud Sync</div>
              <div style={{ fontSize: 11, color: cloudSyncStatus === "connected" ? (COLORS.success || "#22c55e") : COLORS.textMuted, marginTop: 2, fontWeight: 600 }}>{cloudSyncStatus === "connected" ? "Connected" : "Not connected"}</div>
            </div>
          </button>
        </div>
        ) : (
        <div style={{ padding: "4px 0", display: "flex", justifyContent: "center" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 8, color: cloudSyncStatus === "connected" ? (COLORS.success || "#22c55e") : COLORS.textDim }} onClick={() => setCloudSyncModal(true)} title="Cloud Sync">{"\u2601"}</button>
        </div>
        )}
        {!sidebarCollapsed && (
        <>
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>Shortcuts</div>
          <div>⌘K Search · Esc Home</div>
          <div>Ctrl+L Log Service Update</div>
          <div>1–9,0 Navigate pages</div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${COLORS.border}`, fontSize: 11, color: COLORS.textDim }}>
          <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 13 }}>{config.agentName}</div>
          <div>{config.agencyName}</div>
          <div style={{ marginTop: 4 }}>v{APP_VERSION}</div>
        </div>
        </>
        )}
        {/* Collapse/Expand toggle */}
        {!isMobile && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "6px 0", display: "flex", justifyContent: "center" }}>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, fontSize: 16, padding: "4px 8px", borderRadius: 4 }}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onMouseEnter={e => e.currentTarget.style.color = COLORS.text}
            onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        )}
      </div>
      )}
      {crmMode === "personal" ? (
        <div style={isMobile ? S.mainMobile : S.main}>
          {storageError && (
            <div style={{ background: "#dc2626", color: "#fff", padding: "10px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 8, margin: "0 0 12px 0" }}>
              <span>⚠ Storage unavailable — your saved data is NOT lost. Try refreshing the page.</span>
              <button style={{ background: "#fff", color: "#dc2626", border: "none", borderRadius: 4, padding: "4px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }} onClick={() => window.location.reload()}>Refresh</button>
            </div>
          )}
          {renderPage()}
        </div>
      ) : (
        <CommercialApp COLORS={COLORS} isMobile={isMobile} />
      )}


      {clientPopupId && <ClientQuickView accountId={clientPopupId} data={data} setData={setData} config={config} onClose={() => setClientPopupId(null)} onFullPage={() => { nav(clientPopupId); setClientPopupId(null); }} />}

      {serviceLogModal && <ServiceLogModal data={data} setData={setData} config={config} preselectedAccountId={serviceLogModal.accountId || null} onClose={() => setServiceLogModal(null)} />}

      {/* Cloud Sync Modal */}
      {cloudSyncModal && (() => {
        const CloudSyncModal = () => {
          const [url, setUrl] = useState("");
          const [key, setKey] = useState("");
          const [status, setStatus] = useState("idle"); // idle | testing | migrating | success | error
          const [message, setMessage] = useState("");
          const isConnected = cloudSyncStatus === "connected";
          const creds = getSupabaseCredentials();

          const handleConnect = async () => {
            if (!url.trim() || !key.trim()) { setMessage("Please enter both URL and API key"); setStatus("error"); return; }
            setStatus("testing");
            setMessage("Testing connection...");
            const result = await testSupabaseConnection(url.trim(), key.trim());
            if (!result.ok) {
              if (result.error === "table_missing") {
                setMessage("Connection works but the kv_store table doesn't exist yet. Run the SQL setup below first.");
              } else {
                setMessage("Connection failed: " + result.error);
              }
              setStatus("error");
              return;
            }
            // Save creds and reinitialize storage
            saveSupabaseCredentials(url.trim(), key.trim());
            resetSupabaseClient();
            // Migrate existing local data
            setStatus("migrating");
            setMessage("Connected! Migrating local data to cloud...");
            try {
              const client = getSupabaseClient();
              const migResult = await migrateLocalToSupabase(client);
              initSupabaseStorage();
              setCloudSyncStatus("connected");
              setStatus("success");
              setMessage(`Synced! Migrated ${migResult.migrated} data entries to cloud. Reload to use cloud storage.`);
            } catch (e) {
              setStatus("error");
              setMessage("Migration failed: " + e.message);
            }
          };

          const handleDisconnect = () => {
            clearSupabaseCredentials();
            resetSupabaseClient();
            setCloudSyncStatus("disconnected");
            setStatus("idle");
            setMessage("Disconnected. Using local storage. Reload to apply.");
          };

          const sqlSetup = `-- Run this in Supabase SQL Editor (one time)
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access via anon key"
  ON kv_store FOR ALL
  USING (true)
  WITH CHECK (true);`;

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setCloudSyncModal(false)} data-modal="true">
              <div style={{ background: COLORS.card, borderRadius: 12, padding: 24, maxWidth: 520, width: "90%", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${COLORS.border}` }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.text }}>{"\u2601"} Cloud Sync</div>
                  <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setCloudSyncModal(false)}>{"\u2715"}</button>
                </div>

                {isConnected ? (
                  <div>
                    <div style={{ padding: "12px 16px", background: `${COLORS.success || "#22c55e"}15`, border: `1px solid ${COLORS.success || "#22c55e"}40`, borderRadius: 8, marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.success || "#22c55e", marginBottom: 4 }}>Connected to Supabase</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim, wordBreak: "break-all" }}>{creds?.url}</div>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16, lineHeight: 1.6 }}>
                      Your data is syncing to the cloud. Open this app on your Surface tablet, enter the same Supabase credentials, and your data will be there.
                    </div>
                    {message && <div style={{ padding: "8px 12px", background: `${COLORS.accent}15`, borderRadius: 6, fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>{message}</div>}
                    <button style={{ ...S.btn("ghost"), color: "#ef4444", borderColor: "#ef444440" }} onClick={handleDisconnect}>Disconnect</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16, lineHeight: 1.6 }}>
                      Connect to Supabase to sync your CRM data across devices. Your existing data will be uploaded automatically.
                    </div>

                    <div style={{ marginBottom: 16, padding: "12px 16px", background: `${COLORS.accent}08`, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: COLORS.text, marginBottom: 8 }}>Step 1: Create the table</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Go to your Supabase project &rarr; SQL Editor &rarr; paste and run:</div>
                      <textarea readOnly value={sqlSetup} style={{ ...S.input, fontSize: 10, fontFamily: "monospace", height: 140, resize: "none", whiteSpace: "pre", lineHeight: 1.5 }} onFocus={e => e.target.select()} />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: COLORS.text, marginBottom: 8 }}>Step 2: Enter credentials</div>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>From Settings &rarr; API in your Supabase dashboard:</div>
                      <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>Project URL</label>
                      <input style={{ ...S.input, marginBottom: 8, fontSize: 12 }} placeholder="https://xxxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
                      <label style={{ fontSize: 11, color: COLORS.textDim, display: "block", marginBottom: 4 }}>anon public key</label>
                      <input style={{ ...S.input, marginBottom: 4, fontSize: 12 }} placeholder="sb_publishable_..." value={key} onChange={e => setKey(e.target.value)} />
                    </div>

                    {message && <div style={{ padding: "8px 12px", background: status === "error" ? "#ef444420" : status === "success" ? `${COLORS.success || "#22c55e"}20` : `${COLORS.accent}15`, borderRadius: 6, fontSize: 12, color: status === "error" ? "#ef4444" : status === "success" ? (COLORS.success || "#22c55e") : COLORS.textDim, marginBottom: 12 }}>{message}</div>}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={S.btn()} onClick={handleConnect} disabled={status === "testing" || status === "migrating"}>
                        {status === "testing" ? "Testing..." : status === "migrating" ? "Migrating..." : "Connect & Sync"}
                      </button>
                      <button style={S.btn("ghost")} onClick={() => setCloudSyncModal(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {status === "success" && (
                  <button style={{ ...S.btn(), marginTop: 12, width: "100%" }} onClick={() => window.location.reload()}>Reload App</button>
                )}
              </div>
            </div>
          );
        };
        return <CloudSyncModal />;
      })()}

      {/* Export Modal */}
      {exportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExportModal(null)} data-modal="true">
          <div style={{ background: COLORS.card, borderRadius: 12, padding: 24, maxWidth: 700, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>📋 {exportModal.filename}</div>
              <button style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 20, cursor: "pointer" }} onClick={() => setExportModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 12 }}>Copy the data below and paste into Excel or Google Sheets. Select the text area and use Ctrl+A then Ctrl+C.</div>
            <textarea
              id="export-textarea"
              readOnly
              value={exportModal.csv}
              style={{ ...S.input, flex: 1, minHeight: 300, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre", resize: "vertical" }}
              onFocus={e => e.target.select()}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={{ ...S.btn(), background: COLORS.success }} onClick={() => downloadFile(exportModal.csv, exportModal.filename)}>⬇ Download File</button>
              <button style={S.btn()} onClick={() => { const ta = document.getElementById("export-textarea"); if (ta) { ta.focus(); ta.select(); } }}>📋 Select All — then Ctrl+C</button>
              <button style={S.btn("ghost")} onClick={() => setExportModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast / Undo */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.4)", zIndex: 9999, fontSize: 13 }}>
          <span>{toast.message}</span>
          {toast.canUndo && <button style={{ ...S.btn(), padding: "4px 14px", fontSize: 12, background: COLORS.warning, color: "#000", fontWeight: 700 }} onClick={handleUndo}>Undo</button>}
          <span style={{ cursor: "pointer", color: COLORS.textMuted, fontSize: 16, marginLeft: 4 }} onClick={() => { if (toast.timer) clearTimeout(toast.timer); setToast(null); }}>✕</span>
        </div>
      )}
    </div>
  );
}

