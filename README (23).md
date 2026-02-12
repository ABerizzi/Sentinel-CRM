import { useState } from "react";
import { colors, s } from "../styles";
import { INDUSTRY_SUGGESTIONS } from "../data/constants";

export default function ClientForm({ client, onSave, onCancel }) {
  const [form, setForm] = useState(client || {
    lineType: "personal",
    fullName: "",
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    industry: "",
    notes: ""
  });

  const upd = (field, val) => setForm({ ...form, [field]: val });

  function handleSubmit(e) {
    e.preventDefault();
    if (form.lineType === "personal" && !form.fullName.trim()) return;
    if (form.lineType === "commercial" && !form.businessName.trim()) return;
    onSave(form);
  }

  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>
          {client ? "Edit Client" : "Add Client"}
        </h3>
        <form onSubmit={handleSubmit}>
          {/* Line Type Toggle */}
          <div style={{ ...s.formGroup }}>
            <label style={s.label}>Client Type</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["personal", "Personal"], ["commercial", "Commercial"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => upd("lineType", key)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 8,
                    border: `1px solid ${form.lineType === key ? colors.accent : colors.border}`,
                    background: form.lineType === key ? colors.accent : "transparent",
                    color: form.lineType === key ? "#fff" : colors.textMuted,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.lineType === "personal" ? (
            <div style={s.formGroup}>
              <label style={s.label}>Full Name *</label>
              <input value={form.fullName} onChange={e => upd("fullName", e.target.value)} style={s.input} autoFocus required />
            </div>
          ) : (
            <>
              <div style={s.formGroup}>
                <label style={s.label}>Business Name *</label>
                <input value={form.businessName} onChange={e => upd("businessName", e.target.value)} style={s.input} autoFocus required />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Contact Name</label>
                <input value={form.contactName || ""} onChange={e => upd("contactName", e.target.value)} style={s.input} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Industry</label>
                <input
                  value={form.industry || ""}
                  onChange={e => upd("industry", e.target.value)}
                  list="industry-list"
                  style={s.input}
                  placeholder="Type or select..."
                />
                <datalist id="industry-list">
                  {INDUSTRY_SUGGESTIONS.map(ind => <option key={ind} value={ind} />)}
                </datalist>
              </div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Phone</label>
              <input value={form.phone || ""} onChange={e => upd("phone", e.target.value)} style={s.input} type="tel" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Email</label>
              <input value={form.email || ""} onChange={e => upd("email", e.target.value)} style={s.input} type="email" />
            </div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Address</label>
            <input value={form.address || ""} onChange={e => upd("address", e.target.value)} style={s.input} />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea value={form.notes || ""} onChange={e => upd("notes", e.target.value)} style={s.textarea} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>{client ? "Save Changes" : "Add Client"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
