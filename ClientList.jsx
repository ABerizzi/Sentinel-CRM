import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { colors, s } from "../styles";
import { PROSPECT_STAGES, LEAD_SOURCES, COVERAGE_TYPES } from "../data/constants";
import { formatDate, formatCurrency, generateId } from "../utils/helpers";

export default function Pipeline({ data, onSaveProspect, onDeleteProspect }) {
  const [showForm, setShowForm] = useState(false);
  const [editProspect, setEditProspect] = useState(null);
  const [stageFilter, setStageFilter] = useState("active"); // active, all, won, lost

  const prospects = data.prospects || [];
  const filtered = prospects.filter(p => {
    if (stageFilter === "active") return !["Closed Won", "Closed Lost"].includes(p.stage);
    if (stageFilter === "won") return p.stage === "Closed Won";
    if (stageFilter === "lost") return p.stage === "Closed Lost";
    return true;
  });

  const stageColors = {
    "New Lead": "#3b82f6",
    "Contacted": "#8b5cf6",
    "Quoting": "#f59e0b",
    "Proposal Sent": "#f97316",
    "Follow-Up": "#ef4444",
    "Closed Won": "#22c55e",
    "Closed Lost": "#64748b"
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textBright }}>Pipeline ({filtered.length})</h2>
        <button onClick={() => { setEditProspect(null); setShowForm(true); }} style={s.btnPrimary}>
          <Plus size={14} style={{ marginRight: 4 }} />Add Prospect
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["active", "Active"], ["all", "All"], ["won", "Won"], ["lost", "Lost"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStageFilter(key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${stageFilter === key ? colors.accent : colors.border}`,
              background: stageFilter === key ? colors.accent : "transparent",
              color: stageFilter === key ? "#fff" : colors.textMuted,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No prospects in this view</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map(prospect => (
            <div key={prospect.id} style={{ ...s.card, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: colors.textBright }}>{prospect.name}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted }}>
                    {prospect.coverageType} {prospect.source ? `— via ${prospect.source}` : ""}
                  </div>
                  {prospect.phone && <div style={{ fontSize: 12, color: colors.textDim }}>{prospect.phone}</div>}
                  {prospect.email && <div style={{ fontSize: 12, color: colors.textDim }}>{prospect.email}</div>}
                  {prospect.notes && <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>{prospect.notes}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={s.badge(stageColors[prospect.stage] || colors.blue)}>{prospect.stage}</span>
                  {prospect.estimatedPremium && (
                    <div style={{ fontSize: 14, fontWeight: 600, color: colors.green, marginTop: 6 }}>
                      {formatCurrency(prospect.estimatedPremium)}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => { setEditProspect(prospect); setShowForm(true); }} style={{ background: "none", border: "none", color: colors.blue, cursor: "pointer" }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => { if (confirm("Delete?")) onDeleteProspect(prospect.id); }} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProspectForm
          prospect={editProspect}
          onSave={(formData) => {
            onSaveProspect(formData, !!editProspect);
            setShowForm(false);
            setEditProspect(null);
          }}
          onCancel={() => { setShowForm(false); setEditProspect(null); }}
        />
      )}
    </div>
  );
}

function ProspectForm({ prospect, onSave, onCancel }) {
  const [form, setForm] = useState(prospect || {
    name: "", phone: "", email: "",
    coverageType: "Auto", source: "Referral",
    stage: "New Lead", estimatedPremium: "",
    notes: ""
  });
  const upd = (f, v) => setForm({ ...form, [f]: v });

  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>
          {prospect ? "Edit Prospect" : "Add Prospect"}
        </h3>
        <form onSubmit={e => { e.preventDefault(); if (!form.name.trim()) return; onSave(form); }}>
          <div style={s.formGroup}>
            <label style={s.label}>Name *</label>
            <input value={form.name} onChange={e => upd("name", e.target.value)} style={s.input} required autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Phone</label>
              <input value={form.phone || ""} onChange={e => upd("phone", e.target.value)} style={s.input} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Email</label>
              <input value={form.email || ""} onChange={e => upd("email", e.target.value)} style={s.input} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Coverage Type</label>
              <select value={form.coverageType} onChange={e => upd("coverageType", e.target.value)} style={s.select}>
                {COVERAGE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Lead Source</label>
              <select value={form.source} onChange={e => upd("source", e.target.value)} style={s.select}>
                {LEAD_SOURCES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Stage</label>
              <select value={form.stage} onChange={e => upd("stage", e.target.value)} style={s.select}>
                {PROSPECT_STAGES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Est. Premium</label>
              <input value={form.estimatedPremium || ""} onChange={e => upd("estimatedPremium", e.target.value)} style={s.input} type="number" placeholder="$" />
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea value={form.notes || ""} onChange={e => upd("notes", e.target.value)} style={s.textarea} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>{prospect ? "Save" : "Add Prospect"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
