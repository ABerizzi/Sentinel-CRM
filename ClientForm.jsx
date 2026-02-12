import { BarChart3, Users, Target, Calendar, FileText, LayoutList, HardDrive, LogOut } from "lucide-react";
import { colors, s } from "../styles";
import { exportBackup, clearSession } from "../utils/storage";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: BarChart3 },
  { key: "clients", label: "Clients", Icon: Users },
  { key: "pipeline", label: "Pipeline", Icon: Target },
  { key: "calendar", label: "Calendar", Icon: Calendar },
  { key: "reports", label: "Reports", Icon: FileText },
  { key: "service", label: "Service View", Icon: LayoutList }
];

export default function Header({ view, setView, data }) {
  return (
    <header style={{
      background: colors.bgCard,
      borderBottom: `1px solid ${colors.border}`,
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      zIndex: 50,
      flexWrap: "wrap",
      gap: 10
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: colors.textBright, letterSpacing: "-0.02em" }}>
            Sentinel Insurance
          </div>
          <div style={{ fontSize: 10, color: colors.textDim, fontWeight: 500 }}>
            Service & Sales Management
          </div>
        </div>
      </div>

      <nav style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={s.navBtn(view === key)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={() => exportBackup(data)}
          title="Download full backup"
          style={{
            padding: "7px 12px",
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            color: colors.textMuted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12
          }}
        >
          <HardDrive size={13} />
          Backup
        </button>
        <button
          onClick={() => { clearSession(); window.location.reload(); }}
          title="Lock CRM"
          style={{
            padding: "7px 10px",
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            color: colors.textDim,
            cursor: "pointer",
            display: "flex",
            alignItems: "center"
          }}
        >
          <LogOut size={13} />
        </button>
      </div>
    </header>
  );
}
