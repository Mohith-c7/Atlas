# Solo-Founder Product Model

## Product Truth

FAIOS is a solo-founder AI assistant SaaS focused on startup founders. The founder uses voice or chat to access multiple external apps quickly through MCP-backed integrations.

The product is not a team workspace. In the MVP, only the founder needs a FAIOS account. Team members, clients, investors, and vendors may appear inside commands, messages, meetings, tasks, or external tools, but they do not create FAIOS accounts.

## Primary Objects

| Object                  | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `FounderAccount`        | The SaaS account that owns the assistant                                        |
| `FounderProfile`        | Founder preferences, timezone, operating style, and default voice/chat settings |
| `CompanyProfile`        | Lightweight company context used by the AI                                      |
| `IntegrationConnection` | A connected external app and credential boundary                                |
| `McpCapability`         | A tool-agnostic action the AI can plan against                                  |
| `Conversation`          | A voice or chat session                                                         |
| `Message`               | Founder/assistant/system message record                                         |
| `Command`               | A founder intent being interpreted and executed                                 |
| `ExecutionPlan`         | AI-generated plan for a command                                                 |
| `ToolInvocation`        | One MCP capability call and its result                                          |
| `ApprovalRequest`       | Human approval gate for sensitive actions                                       |
| `MemoryItem`            | Founder/company facts and operational context                                   |

## MVP Exclusions

- Workspaces
- Memberships
- Team invites
- Team RBAC
- Internal project management replacement
- Enterprise tenant hierarchy

## Design Implication

The system should optimize for command speed, tool coverage, reliable execution, and useful memory. SaaS account management exists to let the founder use the product, not to model a whole company inside FAIOS.
