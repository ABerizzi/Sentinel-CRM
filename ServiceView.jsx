import { useState } from "react";
import { ArrowLeft, Plus, Edit2, Trash2, Mail, CheckCircle, Circle, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { colors, s } from "../styles";
import { getClientName, formatDate, daysUntil, formatCurrency, generateId, todayStr } from "../utils/helpers";
import { RENEWAL_WORKFLOW_STEPS } from "../data/constants";
import PolicyForm from "./PolicyForm";
import { ActivityForm, FollowUpForm, DocumentForm } from "./Forms";

export default function ClientDetail({
  client, data, setView,
  onUpdateClient, onDeleteClient,
  onSavePolicy, onDeletePolicy,
  onSaveActivity, onSaveFollowUp, onToggleFollowUp, onDeleteFollowUp,
  onSaveDocument, onDeleteDocument,
  onStartWorkflow, onCompleteWorkflowStep,
  setModal, setEditItem
}) {
  const [activeTab, setActiveTab] = useState("policies");
  const [showForm, setShowForm] = useState(null); // "policy", "activity", "followup", "document"
  const [editPolicy, setEditPolicy] = useState(null);
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);

  if (!client) return null;

  const clientPolicies = data.policies.filter(p => p.clientId === client.id);
  const clientActivities = data.activities.filter(a => a.clientId === client.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const clientFollowUps = data.followUps.filter(f => f.clientId === client.id).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  const clientDocs = data.documents.filter(d => d.clientId === client.id).sort((a, b) => new Date(b.dateFiled) - new Date(a.dateFiled));
  const clientWorkflows = data.renewalWorkflows.filter(w => w.clientId === client.id);

  const name = getClientName(client);
  const totalPremium = clientPolicies.filter(p => p.status !== "Cancelled").reduce((sum, p) => sum + (Number(p.premium) || 0), 0);

  // Email templates
  const emailTemplates = [
    {
      label: "Renewal Reminder",
      subject: `Policy Renewal — ${name}`,
      body: `Hi ${client.lineType === "commercial" ? (client.contactName || name) : name.split(" ")[0]},\n\nThis is a courtesy reminder that your policy is coming up for renewal. I'd love to review your coverage and make sure you have the best options available.\n\nPlease let me know a good time to connect.\n\nBest regards,\nAlec Berizzi\nSentinel Insurance, LLC`
    },
    {
      label: "Payment Reminder",
      subject: `Payment Reminder — ${name}`,
      body: `Hi ${client.lineType === "commercial" ? (client.contactName || name) : name.split(" ")[0]},\n\nThis is a friendly reminder that your insurance payment is coming due. Please reach out if you have any questions.\n\nThank you,\nAlec Berizzi\nSentinel Insurance, LLC`
    },
    {
      label: "Welcome / New Policy",
      subject: `Welcome to Sentinel Insurance — ${name}`,
      body: `Hi ${client.lineType === "commercial" ? (client.contactName || name) : name.split(" ")[0]},\n\nWelcome! I'm excited to have you as a client. Your new policy is now active. Please don't hesitate to reach out with any questions about your coverage.\n\nBest regards,\nAlec Berizzi\nSentinel Insurance, LLC`
    }
  ];

  const tabs = [
    { key: "policies", label: `Policies (${clientPolicies.length})` },
    { key: "activities", label: `Activity (${clientActivities.length})` },
    { key: "followups", label: `Follow-Ups (${clientFollowUps.filter(f => !f.completed).length})` },
    { key: "documents", label: `Documents (${clientDocs.length})` },
    ...(client.lineType === "commercial" ? [{ key: "workflows", label: `Workflows (${clientWorkflows.length})` }] : [])
  ];

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <button onClick={() => setView("clients")} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.textBright }}>{name}</h2>
          <div style={{ display: "flex", gap: 12, fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
            <span style={s.badge(client.lineType === "commercial" ? "#8b5cf6" : colors.blue)}>
              {client.lineType === "commercial" ? "Commercial" : "Personal"}
            </span>
            {client.phone && <span>{client.phone}</span>}
            {client.email && <span>{client.email}</span>}
            {client.industry && <span>{client.industry}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 13, color: colors.textDim, marginRight: 10 }}>
            Premium: <strong style={{ color: colors.green }}>{formatCurrency(totalPremium)}</strong>
          </span>
          <button onClick={() => { setEditItem(client); setModal("edit-client"); }} style={s.btnSecondary}>
            <Edit2 size={13} style={{ marginRight: 4 }} />Edit
          </button>
          <button onClick={() => { if (confirm("Delete this client?")) onDeleteClient(client.id); }} style={s.btnDanger}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Email Buttons */}
      {client.email && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {emailTemplates.map((tpl, i) => (
            <a
              key={i}
              href={`mailto:${client.email}?subject=${encodeURIComponent(tpl.subject)}&body=${encodeURIComponent(tpl.body)}`}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                color: colors.blue,
                fontSize: 12,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Mail size={12} />{tpl.label}<ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <div style={{ ...s.card, marginBottom: 16, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, marginBottom: 4, textTransform: "uppercase" }}>Notes</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{client.notes}</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${colors.border}`, marginBottom: 16 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === key ? colors.accent : "transparent"}`,
              color: activeTab === key ? colors.textBright : colors.textMuted,
              fontSize: 13,
              fontWeight: activeTab === key ? 600 : 500,
              cursor: "pointer"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "policies" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm("policy")} style={s.btnPrimary}>
              <Plus size={14} style={{ marginRight: 4 }} />Add Policy
            </button>
          </div>
          {clientPolicies.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No policies yet</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clientPolicies.map(policy => {
                const days = daysUntil(policy.expirationDate);
                const urgColor = days < 0 ? colors.red : days <= 30 ? colors.orange : days <= 60 ? colors.blue : colors.green;
                return (
                  <div key={policy.id} style={{ ...s.card, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: colors.textBright }}>{policy.coverageType}</div>
                        <div style={{ fontSize: 13, color: colors.textMuted }}>{policy.carrier} — {policy.policyNumber || "No policy #"}</div>
                        <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
                          {formatDate(policy.effectiveDate)} → {formatDate(policy.expirationDate)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: colors.green }}>{formatCurrency(policy.premium)}</div>
                        {policy.status !== "Cancelled" && (
                          <span style={s.badge(urgColor)}>
                            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to renewal`}
                          </span>
                        )}
                        {policy.status === "Cancelled" && <span style={s.badge(colors.red)}>Cancelled</span>}
                        <div style={{ marginTop: 8, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={() => { setEditPolicy(policy); setShowForm("edit-policy"); }} style={{ background: "none", border: "none", color: colors.blue, cursor: "pointer", fontSize: 12 }}>Edit</button>
                          <button onClick={() => { if (confirm("Delete this policy?")) onDeletePolicy(policy.id); }} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", fontSize: 12 }}>Delete</button>
                        </div>
                      </div>
                    </div>
                    {policy.notes && <div style={{ marginTop: 8, fontSize: 12, color: colors.textDim }}>{policy.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "activities" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm("activity")} style={s.btnPrimary}>
              <Plus size={14} style={{ marginRight: 4 }} />Log Activity
            </button>
          </div>
          {clientActivities.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No activity logged</div>
          ) : (
            <div style={s.card}>
              {clientActivities.map(act => (
                <div key={act.id} style={{ padding: "12px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{act.type}</span>
                    <span style={{ fontSize: 12, color: colors.textDim }}>{formatDate(act.date)}</span>
                  </div>
                  {act.notes && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{act.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "followups" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm("followup")} style={s.btnPrimary}>
              <Plus size={14} style={{ marginRight: 4 }} />Add Follow-Up
            </button>
          </div>
          {clientFollowUps.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No follow-ups</div>
          ) : (
            <div style={s.card}>
              {clientFollowUps.map(fu => {
                const overdue = !fu.completed && new Date(fu.dueDate + "T00:00:00") < new Date();
                return (
                  <div key={fu.id} style={{
                    padding: "12px 0", borderBottom: `1px solid ${colors.border}`,
                    opacity: fu.completed ? 0.5 : 1, display: "flex", alignItems: "center", gap: 12
                  }}>
                    <button
                      onClick={() => onToggleFollowUp(fu.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: fu.completed ? colors.green : colors.textDim, flexShrink: 0 }}
                    >
                      {fu.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, textDecoration: fu.completed ? "line-through" : "none" }}>
                        {fu.description}
                      </div>
                      <div style={{ fontSize: 11, color: overdue ? colors.red : colors.textDim }}>
                        Due: {formatDate(fu.dueDate)} {overdue ? "(OVERDUE)" : ""} — {fu.priority}
                      </div>
                    </div>
                    <button onClick={() => { if (confirm("Delete?")) onDeleteFollowUp(fu.id); }} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm("document")} style={s.btnPrimary}>
              <Plus size={14} style={{ marginRight: 4 }} />Track Document
            </button>
          </div>
          {clientDocs.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No documents tracked</div>
          ) : (
            <div style={s.card}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={s.th}>Type</th>
                    <th style={s.th}>Policy</th>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Notes</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {clientDocs.map(doc => {
                    const pol = clientPolicies.find(p => p.id === doc.policyId);
                    return (
                      <tr key={doc.id}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{doc.docType}</td>
                        <td style={{ ...s.td, color: colors.textMuted }}>{pol ? `${pol.coverageType} — ${pol.carrier}` : "General"}</td>
                        <td style={{ ...s.td, color: colors.textMuted }}>{formatDate(doc.dateFiled)}</td>
                        <td style={{ ...s.td, color: colors.textDim, fontSize: 12 }}>{doc.notes || "—"}</td>
                        <td style={s.td}>
                          <button onClick={() => { if (confirm("Delete?")) onDeleteDocument(doc.id); }} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "workflows" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            {clientPolicies.filter(p => p.status !== "Cancelled" && p.lineType === "commercial").length > 0 && (
              <button onClick={() => setShowForm("workflow")} style={s.btnPrimary}>
                <Plus size={14} style={{ marginRight: 4 }} />Start Workflow
              </button>
            )}
          </div>
          {clientWorkflows.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40, color: colors.textDim }}>No renewal workflows started</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clientWorkflows.map(wf => {
                const pol = clientPolicies.find(p => p.id === wf.policyId);
                const completed = wf.steps.filter(st => st.completed).length;
                const total = wf.steps.length;
                const expanded = expandedWorkflow === wf.id;
                return (
                  <div key={wf.id} style={s.card}>
                    <div
                      onClick={() => setExpandedWorkflow(expanded ? null : wf.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textBright }}>
                          {pol ? `${pol.coverageType} — ${pol.carrier}` : "Unknown Policy"}
                        </div>
                        <div style={{ fontSize: 12, color: colors.textDim }}>
                          {completed}/{total} steps complete
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 100, height: 6, background: colors.border, borderRadius: 3 }}>
                          <div style={{
                            width: `${total > 0 ? (completed / total * 100) : 0}%`,
                            height: "100%",
                            background: completed === total ? colors.green : colors.accent,
                            borderRadius: 3,
                            transition: "width 0.3s"
                          }} />
                        </div>
                        {expanded ? <ChevronUp size={16} color={colors.textDim} /> : <ChevronDown size={16} color={colors.textDim} />}
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ marginTop: 14 }}>
                        {wf.steps.map((step, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                            borderBottom: i < wf.steps.length - 1 ? `1px solid ${colors.border}` : "none",
                            opacity: step.completed ? 0.6 : 1
                          }}>
                            <button
                              onClick={() => onCompleteWorkflowStep(wf.id, i)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: step.completed ? colors.green : colors.textDim, flexShrink: 0 }}
                            >
                              {step.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
                            </button>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, textDecoration: step.completed ? "line-through" : "none" }}>
                                {step.label}
                              </div>
                              <div style={{ fontSize: 11, color: colors.textDim }}>
                                {step.description} — Target: {formatDate(step.targetDate)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {(showForm === "policy" || showForm === "edit-policy") && (
        <PolicyForm
          policy={showForm === "edit-policy" ? editPolicy : null}
          clientLineType={client.lineType}
          onSave={(formData) => {
            onSavePolicy({ ...formData, clientId: client.id, lineType: client.lineType }, showForm === "edit-policy");
            setShowForm(null);
            setEditPolicy(null);
          }}
          onCancel={() => { setShowForm(null); setEditPolicy(null); }}
        />
      )}
      {showForm === "activity" && (
        <ActivityForm
          onSave={(formData) => { onSaveActivity({ ...formData, clientId: client.id }); setShowForm(null); }}
          onCancel={() => setShowForm(null)}
        />
      )}
      {showForm === "followup" && (
        <FollowUpForm
          onSave={(formData) => { onSaveFollowUp({ ...formData, clientId: client.id }); setShowForm(null); }}
          onCancel={() => setShowForm(null)}
        />
      )}
      {showForm === "document" && (
        <DocumentForm
          policies={clientPolicies}
          onSave={(formData) => { onSaveDocument({ ...formData, clientId: client.id }); setShowForm(null); }}
          onCancel={() => setShowForm(null)}
        />
      )}
      {showForm === "workflow" && (
        <WorkflowStartModal
          policies={clientPolicies.filter(p => p.status !== "Cancelled")}
          onStart={(policyId) => { onStartWorkflow(client.id, policyId); setShowForm(null); }}
          onCancel={() => setShowForm(null)}
        />
      )}
    </div>
  );
}

function WorkflowStartModal({ policies, onStart, onCancel }) {
  const [selected, setSelected] = useState(policies[0]?.id || "");
  return (
    <div style={s.modal} onClick={onCancel}>
      <div style={s.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, marginBottom: 20 }}>Start 150-Day Renewal Workflow</h3>
        <div style={s.formGroup}>
          <label style={s.label}>Select Policy</label>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={s.select}>
            {policies.map(p => <option key={p.id} value={p.id}>{p.coverageType} — {p.carrier}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 8 }}>Workflow steps:</div>
          {RENEWAL_WORKFLOW_STEPS.map((step, i) => (
            <div key={i} style={{ fontSize: 12, color: colors.textMuted, padding: "4px 0" }}>
              {i + 1}. {step.label} ({step.daysOut} days before expiration)
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={s.btnSecondary}>Cancel</button>
          <button onClick={() => onStart(selected)} style={s.btnPrimary}>Start Workflow</button>
        </div>
      </div>
    </div>
  );
}
