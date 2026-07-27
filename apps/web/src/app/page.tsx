import { CommandComposer } from "@/features/commands";
import { ApprovalPanel } from "@/features/approvals";
import { ExecutionTimelinePanel } from "@/features/executions";
import { GitHubConnectionPanel } from "@/features/integrations";
import { CapabilityReadinessPanel } from "@/features/mcp";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">
            Founder AI Operating System
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Run your startup tools from one command.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Tell FAIOS what you want done. It will prepare the plan, identify the right
            capabilities, and wait before any sensitive action is executed.
          </p>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
            <div className="border-l-2 border-primary pl-3">
              <p className="font-semibold text-foreground">Voice-first</p>
              <p className="mt-1 text-muted">Built for fast founder intent.</p>
            </div>
            <div className="border-l-2 border-accent pl-3">
              <p className="font-semibold text-foreground">MCP-native</p>
              <p className="mt-1 text-muted">Plans across connected apps.</p>
            </div>
            <div className="border-l-2 border-foreground pl-3">
              <p className="font-semibold text-foreground">Approval-safe</p>
              <p className="mt-1 text-muted">Stops before sensitive actions.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <GitHubConnectionPanel />
          <CapabilityReadinessPanel />
          <CommandComposer />
          <ApprovalPanel />
          <ExecutionTimelinePanel />
        </div>
      </section>
    </main>
  );
}
