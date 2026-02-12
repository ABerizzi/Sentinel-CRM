import { useState } from "react";
import { colors, s } from "../styles";
import { formatCurrency, daysUntil } from "../utils/helpers";
import { exportCSV } from "../utils/storage";

export default function Reports({ data }) {
  const [tab, setTab] = useState("snapshot");
  const { clients, policies, activities, followUps, prospects } = data;

  const activePolicies = policies.filter(p => p.status !== "Cancelled");
  const personalPolicies = activePolicies.filter(p => p.lineType !== "commercial");
  const commercialPolicies = activePolicies.filter(p => p.lineType === "commercial");

  const totalPremium = activePolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
  const personalPremium = personalPolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
  const commercialPremium = commercialPolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);

  // Carrier breakdown
  const carrierMap = {};
  for (const p of activePolicies) {
    const carrier = p.carrier || "Unknown";
    if (!carrierMap[carrier]) carrierMap[carrier] = { count: 0, premium: 0 };
    carrierMap[carrier].count++;
    carrierMap[carrier].premium += Number(p.premium) || 0;
  }
  const carrierBreakdown = Object.entries(carrierMap).sort((a, b) => b[1].premium - a[1].premium);

  // Coverage breakdown
  const coverageMap = {};
  for (const p of activePolicies) {
    const cov = p.coverageType || "Other";
    if (!coverageMap[cov]) coverageMap[cov] = { count: 0, premium: 0 };
    coverageMap[cov].count++;
    coverageMap[cov].premium += Number(p.premium) || 0;
  }
  const coverageBreakdown = Object.entries(coverageMap).sort((a, b) => b[1].premium - a[1].premium);

  // Activity stats (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = activities.filter(a => new Date(a.date) >= thirtyDaysAgo);
  const activityTypeMap = {};
  for (const a of recentActivities) {
    activityTypeMap[a.type] = (activityTypeMap[a.type] || 0) + 1;
  }

  const tabs = [
    { key: "snapshot", label: "Book Snapshot" },
    { key: "carriers", label: "By Carrier" },
    { key: "coverage", label: "By Coverage" },
    { key: "activity", label: "Activity (30d)" }
  ];

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textBright }}>Reports</h2>
        <button onClick={() => exportCSV(data)} style={s.btnSecondary}>Export CSV</button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${tab === t.key ? colors.accent : colors.border}`,
              background: tab === t.key ? colors.accent : "transparent",
              color: tab === t.key ? "#fff" : colors.textMuted,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "snapshot" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <StatCard label="Total Clients" value={String(clients.length)} />
          <StatCard label="Active Policies" value={String(activePolicies.length)} />
          <StatCard label="Total Premium" value={formatCurrency(totalPremium)} color={colors.green} />
          <StatCard label="Personal Lines" value={`${personalPolicies.length} policies`} sub={formatCurrency(personalPremium)} />
          <StatCard label="Commercial Lines" value={`${commercialPolicies.length} policies`} sub={formatCurrency(commercialPremium)} />
          <StatCard label="Avg Premium" value={activePolicies.length ? formatCurrency(totalPremium / activePolicies.length) : "$0"} />
          <StatCard label="Renewals (30d)" value={String(activePolicies.filter(p => { const d = daysUntil(p.expirationDate); return d >= 0 && d <= 30; }).length)} color={colors.orange} />
          <StatCard label="Active Prospects" value={String(prospects.filter(p => !["Closed Won", "Closed Lost"].includes(p.stage)).length)} />
          <StatCard label="Open Follow-Ups" value={String(followUps.filter(f => !f.completed).length)} />
        </div>
      )}

      {tab === "carriers" && (
        <div style={s.card}>
          {carrierBreakdown.length === 0 ? (
            <p style={{ color: colors.textDim, textAlign: "center", padding: 20 }}>No policies yet</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={s.th}>Carrier</th>
                  <th style={s.th}>Policies</th>
                  <th style={s.th}>Premium</th>
                  <th style={s.th}>% of Book</th>
                </tr>
              </thead>
              <tbody>
                {carrierBreakdown.map(([carrier, info]) => (
                  <tr key={carrier}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{carrier}</td>
                    <td style={s.td}>{String(info.count)}</td>
                    <td style={{ ...s.td, color: colors.green }}>{formatCurrency(info.premium)}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: colors.border, borderRadius: 3 }}>
                          <div style={{
                            width: `${totalPremium > 0 ? (info.premium / totalPremium * 100) : 0}%`,
                            height: "100%", background: colors.accent, borderRadius: 3
                          }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{totalPremium > 0 ? (info.premium / totalPremium * 100).toFixed(1) : "0"}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "coverage" && (
        <div style={s.card}>
          {coverageBreakdown.length === 0 ? (
            <p style={{ color: colors.textDim, textAlign: "center", padding: 20 }}>No policies yet</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={s.th}>Coverage</th>
                  <th style={s.th}>Policies</th>
                  <th style={s.th}>Premium</th>
                  <th style={s.th}>% of Book</th>
                </tr>
              </thead>
              <tbody>
                {coverageBreakdown.map(([cov, info]) => (
                  <tr key={cov}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{cov}</td>
                    <td style={s.td}>{String(info.count)}</td>
                    <td style={{ ...s.td, color: colors.green }}>{formatCurrency(info.premium)}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: colors.border, borderRadius: 3 }}>
                          <div style={{
                            width: `${totalPremium > 0 ? (info.premium / totalPremium * 100) : 0}%`,
                            height: "100%", background: colors.green, borderRadius: 3
                          }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{totalPremium > 0 ? (info.premium / totalPremium * 100).toFixed(1) : "0"}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 14 }}>
            {recentActivities.length} activities logged in the last 30 days
          </p>
          {Object.entries(activityTypeMap).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13, color: colors.text }}>{type}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.textBright }}>{String(count)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...s.card, padding: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || colors.textBright }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.textDim }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: colors.green, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
