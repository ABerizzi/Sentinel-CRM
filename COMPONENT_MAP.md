# Sentinel Platform — Component Map

This file maps every component in SentinelApp.jsx to help Claude Code
plan the decomposition into individual files.

## Components by line number

| Component | Line | Type | Description |
|-----------|------|------|-------------|
| `getServiceStatuses` | 77 | Component |  |
| `RenewalPopup` | 85 | Component | Modal for renewing Ivantage policies |
| `CancellationModal` | 178 | Component | Modal for cancelling policies with win-back logic |
| `exportCSV` | 594 | Component |  |
| `AccountLink` | 663 | Component | Clickable account name link |
| `ClientQuickView` | 675 | Component | Side-panel popup showing full client details |
| `createSeedData` | 964 | Component |  |
| `createEmptyData` | 1054 | Component |  |
| `migrateData` | 1119 | Component |  |
| `validatePolicyFields` | 1227 | Component |  |
| `safeActivateRenewalPolicy` | 1268 | Component |  |
| `addActivity` | 1286 | Component |  |
| `Modal` | 1341 | Component | Generic modal wrapper |
| `FormField` | 1355 | Component | Form field label wrapper |
| `TemplateModal` | 1360 | Component | Communication template selector and composer |
| `MorningBriefing` | 1453 | Page | Daily briefing page — tasks, renewals, quota |
| `Dashboard` | 1794 | Page | Overview dashboard with stats |
| `calcPriority` | 2166 | Component |  |
| `priorityLabel` | 2213 | Component |  |
| `groupServiceItems` | 2221 | Component |  |
| `ServiceBoard` | 2267 | Page | Main service item management view |
| `AllstateHub` | 3174 | Page | Allstate-specific service item view |
| `Pipeline` | 3856 | Page | Sales pipeline / prospect management |
| `SalesLog` | 4206 | Page | Won business log with quota tracking |
| `Clients` | 4415 | Page | Client/account management with detail view |
| `Policies` | 5803 | Page | Policy list and detail management |
| `Tasks` | 6895 | Page | Task management view |
| `getCarrierPortals` | 7077 | Component |  |
| `getOutreachTemplates` | 7081 | Component |  |
| `fillTemplate` | 7085 | Component |  |
| `detectOutreachType` | 7095 | Component |  |
| `buildOutreachMailto` | 7104 | Component |  |
| `copyMailtoToClipboard` | 7131 | Component |  |
| `OutreachHub` | 7143 | Page | Outreach campaigns and templates |
| `CalendarView` | 7510 | Page | Calendar view of due dates and tasks |
| `ProductionReport` | 7657 | Page | Production and commission reports |
| `PortalUrlRow` | 8040 | Component | Settings sub-component for carrier portal URLs |
| `Settings` | 8054 | Page | App settings and configuration |
| `GlobalSearch` | 9287 | Component | Cmd+K global search overlay |
| `App` | 9385 | Shell | Main app shell — routing, state, sidebar |

## Key shared code sections

| Section | Lines | Description |
|---------|-------|-------------|
| THEMES + COLORS | 1-49 | Theme definitions and active theme loading |
| NAV_SECTIONS | 51-72 | Navigation structure |
| SERVICE constants | 74-82 | Service types, statuses, flag definitions |
| CARRIER_ABBREV | 271-309 | Carrier abbreviation mapping |
| TXN_COLORS | 348-361 | Transaction type row colors |
| Utility functions | 362-598 | Date helpers, uid, normalizeDate, exportCSV |
| DEFAULT_CONFIG | 601-642 | Default configuration object |
| Storage layer | 1058-1116 | window.storage polyfill, loadData, saveData |
| migrateData | 1118-1290 | Data migration and normalization |
| Styles (S) | 1293-1327 | Shared style object |
| Color helpers | 1329-1337 | urgencyColor, statusColor functions |

## Decomposition plan for Claude Code

### Priority order:
1. Extract constants → src/constants/index.js
2. Extract utils → src/utils/index.js
3. Extract styles → src/styles.js
4. Extract storage → src/storage.js
5. Extract shared components (Modal, AccountLink, GlobalSearch) → src/components/
6. Extract page components → src/pages/
7. Slim down App.jsx to just shell + routing

### Cross-cutting dependencies:
- Nearly ALL components import: COLORS, S (styles), utility functions
- Page components receive: data, setData, nav, config as props
- ServiceBoard and AllstateHub share: service status logic, flag system, carrier helpers
- ClientQuickView is used by ServiceBoard and AllstateHub as a popup
- RenewalPopup and CancellationModal are used inside ClientQuickView and ServiceBoard
