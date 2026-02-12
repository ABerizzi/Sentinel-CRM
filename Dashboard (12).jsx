import { useState, useEffect, useCallback } from "react";
import { loadData, saveData } from "./utils/storage";
import { generateId } from "./utils/helpers";
import { RENEWAL_WORKFLOW_STEPS } from "./data/constants";
import { colors } from "./styles";
import PasswordGate from "./components/PasswordGate";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import ClientList from "./components/ClientList";
import ClientDetail from "./components/ClientDetail";
import ClientForm from "./components/ClientForm";
import Pipeline from "./components/Pipeline";
import CalendarView from "./components/CalendarView";
import Reports from "./components/Reports";
import ServiceView from "./components/ServiceView";

export default function App() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("dashboard");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null);

  // Load data on mount
  useEffect(() => {
    setData(loadData());
  }, []);

  // Persist data changes
  const save = useCallback((newData) => {
    setData(newData);
    saveData(newData);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  if (!data) return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: colors.textMuted }}>Loading...</div>
    </div>
  );

  // ---- CLIENT OPERATIONS ----
  const addClient = (formData) => {
    const client = { ...formData, id: generateId(), createdAt: new Date().toISOString() };
    save({ ...data, clients: [...data.clients, client] });
    setModal(null);
    setSelectedClientId(client.id);
    setView("client-detail");
    showToast("Client added");
  };

  const updateClient = (formData) => {
    save({ ...data, clients: data.clients.map(c => c.id === formData.id ? formData : c) });
    setModal(null);
    setEditItem(null);
    showToast("Client updated");
  };

  const deleteClient = (id) => {
    save({
      ...data,
      clients: data.clients.filter(c => c.id !== id),
      policies: data.policies.filter(p => p.clientId !== id),
      activities: data.activities.filter(a => a.clientId !== id),
      followUps: data.followUps.filter(f => f.clientId !== id),
      documents: data.documents.filter(d => d.clientId !== id),
      renewalWorkflows: data.renewalWorkflows.filter(w => w.clientId !== id)
    });
    setView("clients");
    setSelectedClientId(null);
    showToast("Client deleted");
  };

  // ---- POLICY OPERATIONS ----
  const savePolicy = (formData, isEdit) => {
    if (isEdit) {
      save({ ...data, policies: data.policies.map(p => p.id === formData.id ? formData : p) });
      showToast("Policy updated");
    } else {
      const policy = { ...formData, id: generateId(), createdAt: new Date().toISOString() };
      save({ ...data, policies: [...data.policies, policy] });
      showToast("Policy added");
    }
  };

  const deletePolicy = (id) => {
    save({ ...data, policies: data.policies.filter(p => p.id !== id) });
    showToast("Policy deleted");
  };

  // ---- ACTIVITY OPERATIONS ----
  const saveActivity = (formData) => {
    const activity = { ...formData, id: generateId() };
    save({ ...data, activities: [...data.activities, activity] });
    showToast("Activity logged");
  };

  // ---- FOLLOW-UP OPERATIONS ----
  const saveFollowUp = (formData) => {
    const followUp = { ...formData, id: generateId(), completed: false };
    save({ ...data, followUps: [...data.followUps, followUp] });
    showToast("Follow-up added");
  };

  const toggleFollowUp = (id) => {
    save({
      ...data,
      followUps: data.followUps.map(f => f.id === id ? { ...f, completed: !f.completed } : f)
    });
  };

  const deleteFollowUp = (id) => {
    save({ ...data, followUps: data.followUps.filter(f => f.id !== id) });
    showToast("Follow-up deleted");
  };

  // ---- DOCUMENT OPERATIONS ----
  const saveDocument = (formData) => {
    const doc = { ...formData, id: generateId() };
    save({ ...data, documents: [...data.documents, doc] });
    showToast("Document tracked");
  };

  const deleteDocument = (id) => {
    save({ ...data, documents: data.documents.filter(d => d.id !== id) });
    showToast("Document deleted");
  };

  // ---- PROSPECT OPERATIONS ----
  const saveProspect = (formData, isEdit) => {
    if (isEdit) {
      save({ ...data, prospects: data.prospects.map(p => p.id === formData.id ? formData : p) });
      showToast("Prospect updated");
    } else {
      const prospect = { ...formData, id: generateId(), createdAt: new Date().toISOString() };
      save({ ...data, prospects: [...data.prospects, prospect] });
      showToast("Prospect added");
    }
  };

  const deleteProspect = (id) => {
    save({ ...data, prospects: data.prospects.filter(p => p.id !== id) });
    showToast("Prospect deleted");
  };

  // ---- WORKFLOW OPERATIONS ----
  const startWorkflow = (clientId, policyId) => {
    const policy = data.policies.find(p => p.id === policyId);
    if (!policy || !policy.expirationDate) return;

    const expDate = new Date(policy.expirationDate + "T00:00:00");
    const steps = RENEWAL_WORKFLOW_STEPS.map(step => {
      const target = new Date(expDate);
      target.setDate(target.getDate() - step.daysOut);
      return {
        label: step.label,
        description: step.description,
        daysOut: step.daysOut,
        targetDate: target.toISOString().slice(0, 10),
        completed: false,
        completedDate: null
      };
    });

    const workflow = {
      id: generateId(),
      clientId,
      policyId,
      steps,
      createdAt: new Date().toISOString()
    };

    save({ ...data, renewalWorkflows: [...data.renewalWorkflows, workflow] });
    showToast("Renewal workflow started");
  };

  const completeWorkflowStep = (workflowId, stepIndex) => {
    save({
      ...data,
      renewalWorkflows: data.renewalWorkflows.map(w => {
        if (w.id !== workflowId) return w;
        const steps = w.steps.map((step, i) => {
          if (i !== stepIndex) return step;
          return { ...step, completed: !step.completed, completedDate: !step.completed ? new Date().toISOString().slice(0, 10) : null };
        });
        return { ...w, steps };
      })
    });
  };

  // ---- RENDER ----
  const selectedClient = data.clients.find(c => c.id === selectedClientId);

  return (
    <PasswordGate>
      <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Header view={view} setView={setView} data={data} />

        <main style={{ flex: 1 }}>
          {view === "dashboard" && (
            <Dashboard data={data} setView={setView} setSelectedClientId={setSelectedClientId} />
          )}

          {view === "clients" && (
            <ClientList data={data} setView={setView} setSelectedClientId={setSelectedClientId} setModal={setModal} />
          )}

          {view === "client-detail" && selectedClient && (
            <ClientDetail
              client={selectedClient}
              data={data}
              setView={setView}
              onUpdateClient={updateClient}
              onDeleteClient={deleteClient}
              onSavePolicy={savePolicy}
              onDeletePolicy={deletePolicy}
              onSaveActivity={saveActivity}
              onSaveFollowUp={saveFollowUp}
              onToggleFollowUp={toggleFollowUp}
              onDeleteFollowUp={deleteFollowUp}
              onSaveDocument={saveDocument}
              onDeleteDocument={deleteDocument}
              onStartWorkflow={startWorkflow}
              onCompleteWorkflowStep={completeWorkflowStep}
              setModal={setModal}
              setEditItem={setEditItem}
            />
          )}

          {view === "pipeline" && (
            <Pipeline data={data} onSaveProspect={saveProspect} onDeleteProspect={deleteProspect} />
          )}

          {view === "calendar" && (
            <CalendarView data={data} setView={setView} setSelectedClientId={setSelectedClientId} />
          )}

          {view === "reports" && (
            <Reports data={data} />
          )}

          {view === "service" && (
            <ServiceView data={data} setView={setView} setSelectedClientId={setSelectedClientId} />
          )}
        </main>

        {/* Global Modals */}
        {modal === "add-client" && (
          <ClientForm onSave={addClient} onCancel={() => setModal(null)} />
        )}
        {modal === "edit-client" && editItem && (
          <ClientForm client={editItem} onSave={updateClient} onCancel={() => { setModal(null); setEditItem(null); }} />
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            padding: "12px 20px",
            color: colors.textBright,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 200,
            animation: "fadeIn 0.2s"
          }}>
            {toast}
          </div>
        )}
      </div>
    </PasswordGate>
  );
}
