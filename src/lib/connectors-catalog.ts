import type { ServiceId } from "@/lib/connected-services";

/** First-party + directory connectors shown in Settings → Connectors. */
export type ConnectorConnectAction = "google" | "microsoft" | "slack" | "device";

export type ConnectorCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: "Google" | "Microsoft" | "Communication" | "Device" | "Productivity" | "Developer";
  /** live = OAuth / device picker wired; coming_soon = listed for discoverability */
  status: "live" | "coming_soon";
  connectAction?: ConnectorConnectAction;
  /** Local service flag(s) flipped when this connector is connected */
  serviceIds?: ServiceId[];
};

export const CONNECTORS_CATALOG: ConnectorCatalogEntry[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read recent mail and search your inbox from chat.",
    category: "Google",
    status: "live",
    connectAction: "google",
    serviceIds: ["gmail"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "List upcoming events and check availability.",
    category: "Google",
    status: "live",
    connectAction: "google",
    serviceIds: ["googleCalendar"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Browse and summarize files in Drive.",
    category: "Google",
    status: "coming_soon",
  },
  {
    id: "outlook",
    name: "Outlook Mail",
    description: "Read Outlook / Microsoft 365 mail.",
    category: "Microsoft",
    status: "live",
    connectAction: "microsoft",
    serviceIds: ["outlook"],
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    description: "Calendar and Graph-backed work data.",
    category: "Microsoft",
    status: "live",
    connectAction: "microsoft",
    serviceIds: ["microsoft365"],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Access files stored in OneDrive.",
    category: "Microsoft",
    status: "coming_soon",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect your Slack workspace identity for chat tools.",
    category: "Communication",
    status: "live",
    connectAction: "slack",
    serviceIds: ["slack"],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Read channels and send messages via Discord.",
    category: "Communication",
    status: "coming_soon",
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "List meetings and join details.",
    category: "Communication",
    status: "coming_soon",
  },
  {
    id: "device-folder",
    name: "This device · folder",
    description: "Pick a local folder for CoWork file organize plans.",
    category: "Device",
    status: "live",
    connectAction: "device",
    serviceIds: ["deviceFiles"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search pages and databases in your Notion workspace.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and status updates.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Atlassian issues and boards.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Tasks and project timelines.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "todoist",
    name: "Todoist",
    description: "Personal task lists and reminders.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Bases, records, and views.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM contacts, deals, and pipelines.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM objects and reports.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Cloud files and shared folders.",
    category: "Productivity",
    status: "coming_soon",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, PRs, and code search.",
    category: "Developer",
    status: "coming_soon",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design files and comments.",
    category: "Developer",
    status: "coming_soon",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Customers, invoices, and payment status.",
    category: "Developer",
    status: "coming_soon",
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Customer conversations and tickets.",
    category: "Communication",
    status: "coming_soon",
  },
];

export const CONNECTOR_CATEGORIES = [
  "Google",
  "Microsoft",
  "Communication",
  "Device",
  "Productivity",
  "Developer",
] as const;
