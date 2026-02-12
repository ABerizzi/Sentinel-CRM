import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { colors, s } from "../styles";
import { getClientName, daysUntil } from "../utils/helpers";

export default function CalendarView({ data, setView, setSelectedClientId }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const firstDay = new Date(month.year, month.month, 1);
  const lastDay = new Date(month.year, month.month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthName = firstDay.toLocaleString("en-US", { month: "long", year: "numeric" });

  const prev = () => setMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 });
  const next = () => setMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 });

  // Gather events for this month
  const events = [];
  for (const policy of data.policies) {
    if (policy.status === "Cancelled" || !policy.expirationDate) continue;
    const exp = new Date(policy.expirationDate + "T00:00:00");
    if (exp.getFullYear() === month.year && exp.getMonth() === month.month) {
      const client = data.clients.find(c => c.id === policy.clientId);
      events.push({
        day: exp.getDate(),
        type: "renewal",
        label: `${getClientName(client)} — ${policy.coverageType}`,
        clientId: policy.clientId,
        color: colors.orange
      });
    }
  }
  for (const fu of data.followUps) {
    if (fu.completed || !fu.dueDate) continue;
    const due = new Date(fu.dueDate + "T00:00:00");
    if (due.getFullYear() === month.year && due.getMonth() === month.month) {
      const client = data.clients.find(c => c.id === fu.clientId);
      events.push({
        day: due.getDate(),
        type: "followup",
        label: `${getClientName(client)} — ${fu.description}`,
        clientId: fu.clientId,
        color: colors.blue
      });
    }
  }

  const today = new Date();
  const isToday = (day) => today.getFullYear() === month.year && today.getMonth() === month.month && today.getDate() === day;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={prev} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}>
          <ChevronLeft size={24} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textBright }}>{monthName}</h2>
        <button onClick={next} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}>
          <ChevronRight size={24} />
        </button>
      </div>

      <div style={{ ...s.card }}>
        {/* Day Headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${colors.border}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ padding: 10, textAlign: "center", fontSize: 11, fontWeight: 600, color: colors.textDim, textTransform: "uppercase" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {/* Empty cells before first day */}
          {Array.from({ length: startDow }).map((_, i) => (
            <div key={`e${i}`} style={{ minHeight: 90, padding: 6, borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}` }} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = events.filter(e => e.day === day);
            return (
              <div key={day} style={{
                minHeight: 90, padding: 6,
                borderBottom: `1px solid ${colors.border}`,
                borderRight: `1px solid ${colors.border}`,
                background: isToday(day) ? `${colors.accent}10` : "transparent"
              }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday(day) ? 700 : 500,
                  color: isToday(day) ? colors.accent : colors.textMuted,
                  marginBottom: 4
                }}>
                  {day}
                </div>
                {dayEvents.slice(0, 3).map((ev, j) => (
                  <button
                    key={j}
                    onClick={() => { setSelectedClientId(ev.clientId); setView("client-detail"); }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "2px 4px",
                      marginBottom: 2,
                      background: `${ev.color}20`,
                      border: "none",
                      borderRadius: 4,
                      color: ev.color,
                      fontSize: 10,
                      textAlign: "left",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                    title={ev.label}
                  >
                    {ev.type === "renewal" ? "🔄 " : "📋 "}{ev.label}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: 10, color: colors.textDim }}>+{dayEvents.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textMuted }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: colors.orange }} /> Renewal
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textMuted }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: colors.blue }} /> Follow-Up
        </div>
      </div>
    </div>
  );
}
