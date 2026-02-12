import { useState } from "react";
import { Shield } from "lucide-react";
import { hashPassword, getSession, setSession, getPasswordHash, setPasswordHash } from "../utils/storage";
import { colors, s } from "../styles";

export default function PasswordGate({ children }) {
  const [authenticated, setAuthenticated] = useState(() => {
    const session = getSession();
    const storedHash = getPasswordHash();
    return session && storedHash && session.hash === storedHash;
  });
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");

  const isFirstTime = !getPasswordHash();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (isFirstTime) {
      if (pw.length < 4) { setError("Password must be at least 4 characters"); return; }
      if (pw !== confirmPw) { setError("Passwords do not match"); return; }
      const hash = await hashPassword(pw);
      setPasswordHash(hash);
      setSession(hash);
      setAuthenticated(true);
    } else {
      const hash = await hashPassword(pw);
      if (hash === getPasswordHash()) {
        setSession(hash);
        setAuthenticated(true);
      } else {
        setError("Incorrect password");
      }
    }
  }

  if (authenticated) return children;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ ...s.card, maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ marginBottom: 20 }}>
          <Shield size={40} color={colors.accent} />
        </div>
        <h2 style={{ color: colors.textBright, fontSize: 22, marginBottom: 6 }}>Sentinel Insurance</h2>
        <p style={{ color: colors.textDim, fontSize: 13, marginBottom: 24 }}>
          {isFirstTime ? "Create a password to protect your CRM" : "Service & Sales Management"}
        </p>

        <div style={s.formGroup}>
          <input
            type="password"
            placeholder={isFirstTime ? "Create password" : "Enter password"}
            value={pw}
            onChange={e => setPw(e.target.value)}
            style={s.input}
            autoFocus
          />
        </div>

        {isFirstTime && (
          <div style={s.formGroup}>
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              style={s.input}
            />
          </div>
        )}

        {error && <p style={{ color: colors.red, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button type="submit" style={{ ...s.btnPrimary, width: "100%" }}>
          {isFirstTime ? "Set Password & Enter" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
