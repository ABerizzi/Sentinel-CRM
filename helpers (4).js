# Sentinel CRM

Service & Sales Management system for Sentinel Insurance, LLC.

## Features

- **Client Management** — Personal + Commercial with toggle, contact details, notes
- **Policy Tracking** — Coverage types, carriers (40+ suggestions), renewal countdown, color-coded urgency
- **Service View** — Spreadsheet-style overview of all policies with filters and sorting
- **Sales Pipeline** — Prospect management with stages, lead sources, estimated premiums
- **Activity Logging** — Track calls, emails, meetings, quotes, and all client touchpoints
- **Follow-Up Scheduling** — Set tasks with due dates, auto-surface overdue items
- **Document Tracking** — Dec pages, COIs, loss runs, wind mits, 4-points per client
- **150-Day Commercial Renewal Workflow** — 6-step checklist from marketing to confirmation
- **Email Templates** — One-click mailto for renewal reminders, payment reminders, welcome
- **Calendar View** — Monthly view showing renewals and follow-ups
- **Reports** — Book snapshot, carrier breakdown, coverage analysis, activity summary
- **CSV Export** — Download all policy data
- **Backup Export** — One-click full JSON backup
- **Password Protection** — SHA-256 hashed password gate with session management

## Tech Stack

- React 18 + Vite
- localStorage for data persistence
- Lucide React for icons
- Auto-deploys via Netlify

## Development

```bash
npm install
npm run dev
```

## Deploy

Connected to Netlify for auto-deploy on push. Build settings are in `netlify.toml`.

## Data

All data is stored in your browser's localStorage. Data persists across code deployments. 
Use the Backup button to download a JSON snapshot before major updates.
