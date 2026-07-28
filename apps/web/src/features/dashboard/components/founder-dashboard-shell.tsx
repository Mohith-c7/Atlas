import { FounderAccountPanel } from "@/features/account";
import { ApprovalPanel } from "@/features/approvals";
import { BillingStatusPanel } from "@/features/billing";
import { CommandComposer, VoiceCommandPanel } from "@/features/commands";
import { ExecutionTimelinePanel } from "@/features/executions";
import { GitHubConnectionPanel, IntegrationCatalogPanel } from "@/features/integrations";
import { MemoryManagementPanel } from "@/features/memory";
import { CapabilityReadinessPanel } from "@/features/mcp";
import { FounderOnboardingChecklist } from "./founder-onboarding-checklist";
import { FounderOperatingSnapshot } from "./founder-operating-snapshot";
import { WorkflowCatalogPanel } from "@/features/workflows";

const navigationItems = [
  { href: "#command-center", label: "Command" },
  { href: "#setup", label: "Setup" },
  { href: "#snapshot", label: "Snapshot" },
  { href: "#operations", label: "Operations" },
  { href: "#integrations", label: "Integrations" },
  { href: "#memory", label: "Memory" },
  { href: "#settings", label: "Settings" },
];

const readinessItems = [
  {
    label: "Voice-first",
    value: "Live",
    detail: "Capture founder intent quickly.",
  },
  {
    label: "MCP-native",
    value: "Guarded",
    detail: "Execute through connected tools.",
  },
  {
    label: "Approval-safe",
    value: "Human gated",
    detail: "Pause before sensitive actions.",
  },
];

function SectionHeader({
  eyebrow,
  title,
  description,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
}>) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function FounderDashboardShell() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Founder AI Operating System
            </p>
            <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
              Founder command console
            </h1>
          </div>

          <nav aria-label="Dashboard sections" className="flex gap-2 overflow-x-auto pb-1">
            {navigationItems.map((item) => (
              <a
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:py-10">
        <section
          className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-start"
          id="command-center"
        >
          <div className="grid gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-accent">
                AI-native startup execution
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                Run your startup tools from one command.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                Tell FAIOS what needs to happen. It plans the workflow, checks tool readiness, and
                keeps founder approval in the loop before sensitive work runs.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {readinessItems.map((item) => (
                <div className="border-l-2 border-primary bg-white/60 p-4" key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{item.value}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{item.detail}</p>
                </div>
              ))}
            </div>

            <VoiceCommandPanel />
          </div>

          <CommandComposer />
        </section>

        <section className="scroll-mt-28" id="setup">
          <FounderOnboardingChecklist />
        </section>

        <section className="scroll-mt-28" id="snapshot">
          <FounderOperatingSnapshot />
        </section>

        <section className="grid scroll-mt-28 gap-5" id="operations">
          <SectionHeader
            description="Review planned work, approve sensitive steps, and follow the execution timeline after tools are queued."
            eyebrow="Operations"
            title="Command history and approval queue"
          />
          <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.75fr)_minmax(0,1.25fr)]">
            <ApprovalPanel />
            <ExecutionTimelinePanel />
          </div>
          <WorkflowCatalogPanel />
        </section>

        <section className="grid scroll-mt-28 gap-5" id="integrations">
          <SectionHeader
            description="Connect founder tools, test readiness, inspect permissions, and see which MCP capabilities are available for planning."
            eyebrow="Integrations"
            title="Tool access and capability readiness"
          />
          <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <div className="grid gap-5">
              <GitHubConnectionPanel />
              <CapabilityReadinessPanel />
            </div>
            <IntegrationCatalogPanel />
          </div>
        </section>

        <section className="grid scroll-mt-28 gap-5" id="memory">
          <SectionHeader
            description="Review and maintain the durable context that gets injected into AI planning for future founder commands."
            eyebrow="Memory"
            title="Organizational context"
          />
          <MemoryManagementPanel />
        </section>

        <section className="grid scroll-mt-28 gap-5" id="settings">
          <SectionHeader
            description="Keep founder context, workspace details, active sessions, and SaaS billing state visible without leaving the console."
            eyebrow="Settings"
            title="Founder profile and plan"
          />
          <div className="grid gap-5 xl:grid-cols-2">
            <FounderAccountPanel />
            <BillingStatusPanel />
          </div>
        </section>
      </div>
    </main>
  );
}
