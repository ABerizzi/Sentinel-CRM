import { useState } from "react";
import { colors, s } from "../styles";
import { ACTIVITY_TYPES, DOC_TYPES } from "../data/constants";
import { todayStr } from "../utils/helpers";

export function ActivityForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ type: ACTIVITY_TYPES[0], date: todayStr(), notes: "" });
  const upd = (f, v) => setForm({ ...form, [f]: v });
  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>Log Activity</h3>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Type</label>
              <select value={form.type} onChange={e => upd("type", e.target.value)} style={s.select}>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Date</label>
              <input value={form.date} onChange={e => upd("date", e.target.value)} style={s.input} type="date" />
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea value={form.notes} onChange={e => upd("notes", e.target.value)} style={s.textarea} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>Log Activity</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FollowUpForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ description: "", dueDate: "", priority: "Normal" });
  const upd = (f, v) => setForm({ ...form, [f]: v });
  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>Add Follow-Up</h3>
        <form onSubmit={e => { e.preventDefault(); if (!form.description.trim() || !form.dueDate) return; onSave(form); }}>
          <div style={s.formGroup}>
            <label style={s.label}>Description *</label>
            <input value={form.description} onChange={e => upd("description", e.target.value)} style={s.input} autoFocus required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Due Date *</label>
              <input value={form.dueDate} onChange={e => upd("dueDate", e.target.value)} style={s.input} type="date" required />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Priority</label>
              <select value={form.priority} onChange={e => upd("priority", e.target.value)} style={s.select}>
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>Add Follow-Up</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DocumentForm({ policies, onSave, onCancel }) {
  const [form, setForm] = useState({ docType: DOC_TYPES[0], policyId: "", dateFiled: todayStr(), notes: "" });
  const upd = (f, v) => setForm({ ...form, [f]: v });
  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>Track Document</h3>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Document Type</label>
              <select value={form.docType} onChange={e => upd("docType", e.target.value)} style={s.select}>
                {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Related Policy</label>
              <select value={form.policyId || ""} onChange={e => upd("policyId", e.target.value)} style={s.select}>
                <option value="">General</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.coverageType} — {p.carrier}</option>)}
              </select>
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Date Filed</label>
            <input value={form.dateFiled} onChange={e => upd("dateFiled", e.target.value)} style={s.input} type="date" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea value={form.notes || ""} onChange={e => upd("notes", e.target.value)} style={s.textarea} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>Track Document</button>
          </div>
        </form>
      </div>
    </div>
  );
}
