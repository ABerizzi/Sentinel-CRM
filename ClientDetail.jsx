export const colors = {
  bg: "#0f1724",
  bgCard: "#141e30",
  bgHover: "#1a2436",
  bgInput: "#0f1724",
  border: "#1e293b",
  borderLight: "#334155",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textBright: "#f8fafc",
  accent: "#1d4ed8",
  accentHover: "#2563eb",
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  blue: "#3b82f6"
};

export const s = {
  card: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 20
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    outline: "none"
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    outline: "none"
  },
  textarea: {
    width: "100%",
    padding: "10px 14px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    outline: "none",
    minHeight: 80,
    resize: "vertical"
  },
  btnPrimary: {
    padding: "10px 20px",
    background: colors.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  },
  btnSecondary: {
    padding: "10px 20px",
    background: "transparent",
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer"
  },
  btnDanger: {
    padding: "10px 20px",
    background: "#7f1d1d",
    color: "#fca5a5",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer"
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  },
  formGroup: {
    marginBottom: 16
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20
  },
  modalContent: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 520,
    maxHeight: "85vh",
    overflowY: "auto"
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: `${color}20`,
    color: color
  }),
  navBtn: (active) => ({
    padding: "7px 14px",
    borderRadius: 8,
    border: "none",
    background: active ? colors.accent : "transparent",
    color: active ? "#fff" : colors.textMuted,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.15s"
  }),
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: colors.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${colors.border}`
  },
  td: {
    padding: "12px 14px",
    fontSize: 13,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text
  }
};
