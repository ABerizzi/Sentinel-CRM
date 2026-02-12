import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { colors, s } from "../styles";
import { getClientName, daysUntil, formatDate, formatCurrency, urgencyColor, urgencyBg } from "../utils/helpers";

export default function ServiceView({ data, setView, setSelectedClientId }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, week, 30, 60, 90, overdue, followup
  const [sortField, setSortField] = useState("expirationDate");
  const [sortAsc, setSortAsc] = useState(true);

  const activePolicies = data.policies.filter(p => p.status !== "Cancelled");

  const enriched = useMemo(() => {
    return activePolicies.map(policy => {
      const client = data.clients.find(c => c.id === policy.clientId);
      const days = daysUntil(policy.expirationDate);
      const name = getClientName(client);
      const hasFollowUp = data.followUps.some(f => f.clientId === policy.clientId && !f.completed);
      return { ...policy, client, clientName: name, daysToRenewal: days, hasFollowUp };
    });
  }, [data]);

  const filtered = useMemo(() => {
    let result = enriched;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.clientName.toLowerCase().includes(q) ||
        (r.carrier || "").toLowerCase().includes(q) ||
        (r.coverageType || "").toLowerCase().includes(q) ||
        (r.policyNumber || "").toLowerCase().includes(q)
      );
    }

    // Filter
    switch (filter) {
      case "week":
        result = result.filter(r => r.daysToRenewal >= 0 && r.daysToRenewal <= 7);
        break;
      case "30":
        result = result.filter(r => r.daysToRenewal >= 0 && r.daysToRenewal <= 30);
        break;
      case "60":
        result = result.filter(r => r.daysToRenewal >= 0 && r.daysToRenewal <= 60);
        break;
      case "90":
        result = result.filter(r => r.daysToRenewal >= 0 && r.daysToRenewal <= 90);
        break;
      case "overdue":
        result = result.filter(r => r.daysToRenewal < 0);
        break;
      case "followup":
        result = result.filter(r => r.hasFollowUp);
        break;
    }

    // Sort
    result.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case "clientName": va = a.clientName; vb = b.clientName; return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        case "premium": va = Number(a.premium) || 0; vb = Number(b.premium) || 0; break;
        case "daysToRenewal": va = a.daysToRenewal; vb = b.daysToRenewal; break;
        case "carrier": va = a.carrier || ""; vb = b.carrier || ""; return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        case "coverageType": va = a.coverageType || ""; vb = b.coverageType || ""; return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        default: va = new Date(a.expirationDate || "9999"); vb = new Date(b.expirationDate || "9999");
      }
      return sortAsc ? va - vb : vb - va;
    });

    return result;
  }, [enriched, search, filter, sortField, sortAsc]);

  function toggleSort(field) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  const totalPremium = filtered.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
  const renewalCount = filtered.filter(p => p.daysToRenewal >= 0 && p.daysToRenewal <= 30).length;
  const overdueCount = filtered.filter(p => p.daysToRenewal < 0).length;

  const filters = [
    { key: "all", label: "All" },
    { key: "week", label: "This Week" },
    { key: "30", label: "30 Days" },
    { key: "60", label: "60 Days" },
    { key: "90", label: "90 Days" },
    { key: "overdue", label: "Overdue" },
    { key: "followup", label: "Needs Follow-Up" }
  ];

  const SortHeader = ({ field, label }) => (
    <th
      style={{ ...s.th, cursor: "pointer", userSelect: "none" }}
      onClick={() => toggleSort(field)}
    >
      {label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textBright }}>Service View</h2>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: colors.textMuted }}>
          <span>Policies: <strong style={{ color: colors.textBright }}>{String(filtered.length)}</strong></span>
          <span>Premium: <strong style={{ color: colors.green }}>{formatCurrency(totalPremium)}</strong></span>
          <span>Renewing (30d): <strong style={{ color: colors.orange }}>{String(renewalCount)}</strong></span>
          {overdueCount > 0 && <span>Overdue: <strong style={{ color: colors.red }}>{String(overdueCount)}</strong></span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: colors.textDim }} />
          <input
            placeholder="Search policies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...s.input, paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${filter === f.key ? colors.accent : colors.border}`,
                background: filter === f.key ? colors.accent : "transparent",
                color: filter === f.key ? "#fff" : colors.textMuted,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <p style={{ color: colors.textDim, fontSize: 14, textAlign: "center", padding: 40 }}>No policies match your criteria</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <SortHeader field="clientName" label="Insured" />
                <SortHeader field="coverageType" label="Coverage" />
                <SortHeader field="carrier" label="Carrier" />
                <th style={s.th}>Policy #</th>
                <SortHeader field="premium" label="Premium" />
                <SortHeader field="expirationDate" label="Expiration" />
                <SortHeader field="daysToRenewal" label="Days" />
                <th style={s.th}>Status</th>
                <th style={s.th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const days = row.daysToRenewal;
                const urgC = urgencyColor(days);
                const bgColor = urgencyBg(days);
                return (
                  <tr key={row.id} style={{ background: bgColor }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      <button
                        onClick={() => { setSelectedClientId(row.clientId); setView("client-detail"); }}
                        style={{ background: "none", border: "none", color: colors.blue, cursor: "pointer", fontWeight: 600, fontSize: 13, textAlign: "left" }}
                      >
                        {row.clientName}
                      </button>
                    </td>
                    <td style={s.td}>{row.coverageType}</td>
                    <td style={{ ...s.td, color: colors.textMuted }}>{row.carrier}</td>
                    <td style={{ ...s.td, color: colors.textDim, fontSize: 12 }}>{row.policyNumber || "—"}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: colors.green }}>{formatCurrency(row.premium)}</td>
                    <td style={{ ...s.td, color: colors.textMuted }}>{formatDate(row.expirationDate)}</td>
                    <td style={s.td}>
                      <span style={s.badge(urgC)}>
                        {days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                      </span>
                    </td>
                    <td style={s.td}>
                      {row.hasFollowUp && <span style={s.badge(colors.yellow)}>Follow-Up</span>}
                    </td>
                    <td style={{ ...s.td, fontSize: 12, color: colors.textDim, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.notes || "—"}
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
