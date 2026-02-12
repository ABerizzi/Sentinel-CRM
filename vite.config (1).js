const STORAGE_KEY = "sentinel-crm-data";
const SESSION_KEY = "sentinel-session";

const DEFAULT_DATA = {
  clients: [],
  policies: [],
  activities: [],
  followUps: [],
  prospects: [],
  documents: [],
  renewalWorkflows: []
};

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA };
    const parsed = JSON.parse(raw);
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      policies: Array.isArray(parsed.policies) ? parsed.policies : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      prospects: Array.isArray(parsed.prospects) ? parsed.prospects : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      renewalWorkflows: Array.isArray(parsed.renewalWorkflows) ? parsed.renewalWorkflows : []
    };
  } catch (e) {
    console.error("Failed to load data:", e);
    return { ...DEFAULT_DATA };
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save data:", e);
  }
}

export function exportBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sentinel-crm-backup-${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(data) {
  const rows = [];
  rows.push(["Client Name", "Type", "Coverage", "Carrier", "Policy #", "Premium", "Effective", "Expiration", "Status"].join(","));
  for (const policy of data.policies) {
    const client = data.clients.find(c => c.id === policy.clientId);
    const name = client ? (client.lineType === "commercial" ? client.businessName : client.fullName) : "Unknown";
    rows.push([
      `"${name}"`, policy.lineType || "", policy.coverageType || "", `"${policy.carrier || ""}"`,
      policy.policyNumber || "", policy.premium || "", policy.effectiveDate || "",
      policy.expirationDate || "", policy.status || "Active"
    ].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentinel-crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Password hashing
export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function getSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    // Session expires after 24 hours
    if (Date.now() - parsed.ts > 86400000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export function setSession(hash) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ hash, ts: Date.now() }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getPasswordHash() {
  return localStorage.getItem("sentinel-pw-hash");
}

export function setPasswordHash(hash) {
  localStorage.setItem("sentinel-pw-hash", hash);
}
