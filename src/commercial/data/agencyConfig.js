// Agency Configuration — auto-populates the "Agency" section of every ACORD form
// This is the single source of truth for agency info across all generated documents.

const AGENCY_CONFIG = {
  agencyName: "Sentinel Insurance, LLC",
  agencyDBA: "",
  agencyPhone: "954-428-4355",
  agencyFax: "",
  agencyEmail: "",
  agencyWebsite: "",
  agencyLicense: "",

  // Physical / Mailing Address
  agencyAddress: {
    street: "2598 E Sunrise Blvd",
    suite: "Suite 2104, #2090",
    city: "Fort Lauderdale",
    state: "FL",
    zip: "33304",
    county: "Broward",
  },

  // Producer Info (default — can be overridden per account)
  defaultProducer: "Alec",
  defaultCSR: "",

  // Carrier Appointments (commercial-focused)
  carrierAppointments: [
    { name: "AmWINS", type: "Wholesale", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "Ivantage", type: "Wholesale", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "AmTrust", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "Hartford", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "Travelers", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "CNA", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "EMPLOYERS", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "Guard Insurance", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "Markel", type: "Direct", contactName: "", contactPhone: "", contactEmail: "" },
    { name: "BTIS", type: "MGA", contactName: "", contactPhone: "", contactEmail: "" },
  ],
};

export default AGENCY_CONFIG;
