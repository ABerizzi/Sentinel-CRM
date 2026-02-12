import { Users, Shield, Calendar, AlertCircle, DollarSign, TrendingUp } from "lucide-react";
import { colors, s } from "../styles";
import { daysUntil, formatDate, getClientName, formatCurrency } from "../utils/helpers";

export default function Dashboard({ data, setView, setSelectedClientId }) {
  const { clients, policies, followUps, activities, prospects } = data;

  const activePolicies = policies.filter(p => p.status !== "Cancelled");
  const totalPremium = activePolicies.reduce((sum, p) => sum + (Number(p.premium) || 0), 0);
  const commercialPremium = activePolicies.filter(p => p.lineType === "commercial").reduce((sum, p) => sum + (Number(p.premium) || 0), 0);

  const now = new Date();
  const overdueFollowUps = followUps.filter(f => !f.completed && new Date(f.dueDate + "T00:00:00") < now);
  const renewalsNext90 = activePolicies.filter(p => {
    const d = daysUntil(p.expirationDate);
    return d >= 0 && d <= 90;
  });
  const renewalsNext30 = renewalsNext90.filter(p => daysUntil(p.expirationDate) <= 30);

  const recentActivities = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  const stats = [
    { label: "Total Clients", value: String(clients.length), Icon: Users, color: colors.blue },
    { label: "Active Policies", value: String(activePolicies.length), Icon: Shield, color: colors.green },
    { label: "Total Premium", value: formatCurrency(totalPremium), Icon: DollarSign, color: colors.accent },
    { label: "Commercial Premium", value: formatCurrency(commercialPremium), Icon: TrendingUp, color: "#8b5cf6" },
    { label: "Renewals (90 days)", value: String(renewalsNext90.length), Icon: Calendar, color: colors.orange },
    { label: "Overdue Follow-Ups", value: String(overdueFollowUps.length), Icon: AlertCircle, color: colors.red }
  ];

  return (
    <div style={{ padding: 20 }}>
      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...s.card, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${st.color}18`, borderRadius: 10, padding: 10, display: "flex" }}>
              <st.Icon size={20} color={st.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: colors.textBright }}>{st.value}</div>
              <div style={{ fontSize: 11, color: colors.textDim }}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Upcoming Renewals */}
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textBright, marginBottom: 14 }}>
            Upcoming Renewals ({renewalsNext30.length} within 30 days)
          </h3>
          {renewalsNext90.length === 0 ? (
            <p style={{ color: colors.textDim, fontSize: 13 }}>No upcoming renewals</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {renewalsNext90.sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate)).slice(0, 10).map(policy => {
                const client = clients.find(c => c.id === policy.clientId);
                const days = daysUntil(policy.expirationDate);
                const urgColor = days <= 14 ? colors.red : days <= 30 ? colors.orange : days <= 60 ? colors.blue : colors.green;
                return (
                  <div key={policy.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderBottom: `1px solid ${colors.border}`
                  }}>
                    <div>
                      <button
                        onClick={() => { setSelectedClientId(policy.clientId); setView("client-detail"); }}
                        style={{ background: "none", border: "none", color: colors.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}
                      >
                        {getClientName(client)}
                      </button>
                      <div style={{ fontSize: 11, color: colors.textDim }}>{policy.coverageType} — {policy.carrier}</div>
                    </div>
                    <span style={s.badge(urgColor)}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textBright, marginBottom: 14 }}>Recent Activity</h3>
          {recentActivities.length === 0 ? (
            <p style={{ color: colors.textDim, fontSize: 13 }}>No activity logged yet</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {recentActivities.map(act => {
                const client = clients.find(c => c.id === act.clientId);
                return (
                  <div key={act.id} style={{ padding: "10px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{act.type}</span>
                      <span style={{ fontSize: 11, color: colors.textDim }}>{formatDate(act.date)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>
                      {getClientName(client)} {act.notes ? `— ${act.notes}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue Follow-Ups */}
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textBright, marginBottom: 14 }}>
            Overdue Follow-Ups ({overdueFollowUps.length})
          </h3>
          {overdueFollowUps.length === 0 ? (
            <p style={{ color: colors.textDim, fontSize: 13 }}>All caught up!</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {overdueFollowUps.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 10).map(fu => {
                const client = clients.find(c => c.id === fu.clientId);
                return (
                  <div key={fu.id} style={{ padding: "10px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <button
                        onClick={() => { setSelectedClientId(fu.clientId); setView("client-detail"); }}
                        style={{ background: "none", border: "none", color: colors.blue, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                      >
                        {getClientName(client)}
                      </button>
                      <span style={s.badge(colors.red)}>{formatDate(fu.dueDate)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>{fu.description}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Prospects */}
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textBright, marginBottom: 14 }}>
            Active Prospects ({prospects.filter(p => !["Closed Won", "Closed Lost"].includes(p.stage)).length})
          </h3>
          {prospects.filter(p => !["Closed Won", "Closed Lost"].includes(p.stage)).length === 0 ? (
            <p style={{ color: colors.textDim, fontSize: 13 }}>No active prospects</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {prospects.filter(p => !["Closed Won", "Closed Lost"].includes(p.stage)).slice(0, 10).map(pr => (
                <div key={pr.id} style={{ padding: "10px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{pr.name}</span>
                    <span style={s.badge(colors.blue)}>{pr.stage}</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>
                    {pr.coverageType} {pr.estimatedPremium ? `— ${formatCurrency(pr.estimatedPremium)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
