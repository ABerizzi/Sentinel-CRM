export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getClientName(client) {
  if (!client) return "Unknown";
  return client.lineType === "commercial" ? (client.businessName || "Unnamed") : (client.fullName || "Unnamed");
}

export function urgencyColor(days) {
  if (days < 0) return "#ef4444";    // overdue - red
  if (days <= 14) return "#f97316";  // urgent - orange
  if (days <= 30) return "#eab308";  // soon - yellow
  if (days <= 60) return "#3b82f6";  // upcoming - blue
  if (days <= 90) return "#22c55e";  // comfortable - green
  return "#64748b";                   // distant - gray
}

export function urgencyBg(days) {
  if (days < 0) return "rgba(239,68,68,0.08)";
  if (days <= 14) return "rgba(249,115,22,0.08)";
  if (days <= 30) return "rgba(234,179,8,0.06)";
  if (days <= 60) return "rgba(59,130,246,0.06)";
  if (days <= 90) return "rgba(34,197,94,0.05)";
  return "transparent";
}

export function formatCurrency(num) {
  const n = Number(num) || 0;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function sortByDate(arr, field, asc = true) {
  return [...arr].sort((a, b) => {
    const da = new Date(a[field] || "9999-12-31");
    const db = new Date(b[field] || "9999-12-31");
    return asc ? da - db : db - da;
  });
}
