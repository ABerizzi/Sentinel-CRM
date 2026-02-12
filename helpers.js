import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { colors, s } from "../styles";
import { getClientName } from "../utils/helpers";

export default function ClientList({ data, setView, setSelectedClientId, setModal }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, personal, commercial

  const filtered = data.clients.filter(c => {
    const name = getClientName(c).toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search);
    const matchesFilter = filter === "all" || c.lineType === filter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => getClientName(a).localeCompare(getClientName(b)));

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textBright }}>
          Clients ({filtered.length})
        </h2>
        <button onClick={() => setModal("add-client")} style={s.btnPrimary}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Add Client
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: colors.textDim }} />
          <input
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...s.input, paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "All"], ["personal", "Personal"], ["commercial", "Commercial"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${filter === key ? colors.accent : colors.border}`,
                background: filter === key ? colors.accent : "transparent",
                color: filter === key ? "#fff" : colors.textMuted,
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.card}>
        {filtered.length === 0 ? (
          <p style={{ color: colors.textDim, fontSize: 14, textAlign: "center", padding: 40 }}>
            {search ? "No clients match your search" : "No clients yet. Add your first client!"}
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Phone</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Policies</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const policyCount = data.policies.filter(p => p.clientId === client.id && p.status !== "Cancelled").length;
                return (
                  <tr
                    key={client.id}
                    onClick={() => { setSelectedClientId(client.id); setView("client-detail"); }}
                    style={{ cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ ...s.td, fontWeight: 600, color: colors.textBright }}>
                      {getClientName(client)}
                      {client.lineType === "commercial" && client.contactName && (
                        <div style={{ fontSize: 11, color: colors.textDim, fontWeight: 400 }}>
                          Contact: {client.contactName}
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={s.badge(client.lineType === "commercial" ? "#8b5cf6" : colors.blue)}>
                        {client.lineType === "commercial" ? "Commercial" : "Personal"}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: colors.textMuted }}>{client.phone || "—"}</td>
                    <td style={{ ...s.td, color: colors.textMuted }}>{client.email || "—"}</td>
                    <td style={s.td}>{String(policyCount)}</td>
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
