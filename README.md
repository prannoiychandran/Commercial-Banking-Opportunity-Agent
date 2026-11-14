# Empire State Bank Revenue Agent — Mock API PoC

Zero external runtime dependencies. Node.js 20+ and TypeScript compiler required for source builds.

## Run

```bash
npm ci
npm run build
npm test
npm run demo
npm start
```

Open http://127.0.0.1:3000. Use **Analyze** on Brooklyn Distribution for the eligible path, Manhattan Imports for the blocked path, and Bronx Manufacturing for incomplete-data review. **Approve** creates a simulated CRM opportunity; **Reset** clears demo state.

## What is real vs mocked

- Real TypeScript orchestration loop, tool dispatch, server-side policy enforcement, approval action, audit events, and test assertions.
- Synthetic in-memory banking and CRM data; mocked Responses API-style model outputs. Model decisions are scripted, **not evidence of real LLM reasoning**.
- The dashboard streams execution events from the local server. Durations measure local processing of the mock workflow. No network calls to OpenAI.
- Demo-only fixed RM identity (`rm_001`); replace with authenticated sessions, durable storage, concurrency controls, and audit retention before any production use.

## Architecture decisions

- **ADR-001**: Custom deterministic orchestrator for V1; evaluate optional Agents SDK if standardizing agent coding, tool use, handoffs, guardrails, and tracing across teams becomes valuable.
- **ADR-002**: Mock Responses API adapter for offline demos; later introduce a live API adapter and eval suite.
- **ADR-003**: Eligibility, access, and approval enforced by application code rather than model instructions.
- **ADR-004**: Structured in-memory traces for demo; evaluate OpenTelemetry and redaction/retention policies for production.
- **ADR-005**: RM approves before CRM write; customer outreach excluded from V1.
- **ADR-006**: Limited autonomy; expand only after measured quality and policy compliance.
- **ADR-007**: Local workflow state in V1; evaluate Responses API state patterns and data retention before live deployment.

## Production gaps

Mock adapter does not currently use returned tool outputs to make decisions; instead it follows fixture-driven branches. Future live adapter should consume outputs and emit recommendations through a validated structured schema. Authentication, encrypted persistence, trace redaction, idempotent transactional writes, API timeout handling, policy versioning, and real revenue attribution remain out of scope.

## Business case and measurement contract

See [`docs/MEASUREMENT_CONTRACT.md`](docs/MEASUREMENT_CONTRACT.md) for the canonical KPI dictionary, event schema, synthetic business case, 90-day pilot plan, dashboard requirements, and architecture trade-offs (ADR-008–012). **All current dashboard metrics are synthetic or illustrative; no measured customer revenue lift or model quality is claimed.**

## Instrumented business case (V1)

The app now exposes `GET /api/events` (synthetic event ledger) and `GET /api/metrics` (demo funnel, safety/evaluation disclosures, and the separately labeled business-case scenario). The dashboard renders the opportunity funnel, policy blocks, scenario economics, and event ledger. The ledger is in-memory and resets with `POST /api/reset`; it is **not** a durable compliance audit system. The mock has no real model usage, measured grounding accuracy, realized revenue, or experimentally demonstrated incrementality. Refer to `docs/MEASUREMENT_CONTRACT.md` for definitions and the pilot attribution plan.
