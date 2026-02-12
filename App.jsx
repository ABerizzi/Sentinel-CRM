import { useState } from "react";
import { colors, s } from "../styles";
import { CARRIER_SUGGESTIONS, PERSONAL_COVERAGE, COMMERCIAL_COVERAGE } from "../data/constants";

export default function PolicyForm({ policy, clientLineType, onSave, onCancel }) {
  const coverageOptions = clientLineType === "commercial" ? COMMERCIAL_COVERAGE : PERSONAL_COVERAGE;

  const [form, setForm] = useState(policy || {
    coverageType: coverageOptions[0],
    carrier: "",
    policyNumber: "",
    premium: "",
    effectiveDate: "",
    expirationDate: "",
    status: "Active",
    notes: ""
  });

  const upd = (field, val) => setForm({ ...form, [field]: val });

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>
          {policy ? "Edit Policy" : "Add Policy"}
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Coverage Type</label>
              <select value={form.coverageType} onChange={e => upd("coverageType", e.target.value)} style={s.select}>
                {coverageOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Carrier</label>
              <input
                value={form.carrier || ""}
                onChange={e => upd("carrier", e.target.value)}
                list="carrier-list"
                style={s.input}
                placeholder="Type or select..."
              />
              <datalist id="carrier-list">
                {CARRIER_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Policy Number</label>
              <input value={form.policyNumber || ""} onChange={e => upd("policyNumber", e.target.value)} style={s.input} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Annual Premium</label>
              <input value={form.premium || ""} onChange={e => upd("premium", e.target.value)} style={s.input} type="number" placeholder="$" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Effective Date</label>
              <input value={form.effectiveDate || ""} onChange={e => upd("effectiveDate", e.target.value)} style={s.input} type="date" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Expiration Date</label>
              <input value={form.expirationDate || ""} onChange={e => upd("expirationDate", e.target.value)} style={s.input} type="date" />
            </div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Status</label>
            <select value={form.status || "Active"} onChange={e => upd("status", e.target.value)} style={s.select}>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Non-Renewed">Non-Renewed</option>
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea value={form.notes || ""} onChange={e => upd("notes", e.target.value)} style={s.textarea} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={s.btnSecondary}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>{policy ? "Save Changes" : "Add Policy"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
