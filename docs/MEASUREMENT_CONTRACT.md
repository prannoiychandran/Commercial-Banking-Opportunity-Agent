# Empire State Bank — Business Case & Measurement Contract

**Status:** V1 design specification (not measured results)  
**Product surface:** OpenAI Platform and APIs (mocked Responses API for V1)  
**Use case:** Treasury management opportunity-to-action for existing commercial banking accounts  
**Owner:** Proposed pilot team: Commercial Banking, Risk/Compliance, Data, and AI Engineering

## 1. Decision and scope

Our north-star customer outcome is **incremental annualized contracted treasury fee revenue attributable to the agent-assisted workflow**, compared with business as usual. Do not confuse modeled potential, pipeline, signed annualized fees, or realized revenue. The model investigates account signals, retrieves supporting evidence, drafts a recommendation, and asks a relationship manager (RM) for approval. Deterministic services enforce account access, eligibility, pricing/revenue calculations, and CRM-write authorization. No autonomous customer outreach in V1.

The demo uses synthetic data and scripted model decisions. **No model accuracy, incremental revenue, actual token consumption, or production time savings can be claimed from this demo.**

## 2. Measurement principles

1. Show **source and status** for every KPI: `synthetic_demo`, `scenario_assumption`, `pilot_observed`, or `production_observed`.
2. Show a **denominator, observation window, and definition** with every rate.
3. Distinguish **leading indicators** (reviewed leads) from **lagging outcomes** (contracted fees).
4. Separate **bank revenue** from **OpenAI revenue** (paid API usage); neither gross bank revenue nor estimated bank ROI is OpenAI revenue.
5. Count unique customers and opportunities using stable IDs; prevent duplicate wins and CRM writes.
6. Record versioned policy, model, prompt, and pricing configurations for reproducibility.
7. Apply access controls, minimization, and retention/redaction to customer and trace data.

## 3. Canonical metric dictionary

| Metric | Formula / definition | Primary source | Cadence | Demo status |
|---|---|---|---|---|
| Incremental annualized treasury fee revenue **(north star)** | Annualized contracted treasury fees from eligible, closed-won, activated opportunities in treatment **minus** counterfactual fees estimated from randomized control, adjusted for exposure/account mix; report uncertainty | CRM + treasury billing/product ledger + experiment assignment | Monthly, after sufficient maturation | **Not measurable** in mock; show scenario only |
| Qualified opportunity rate | Unique opportunities accepted by an RM **and** eligible at acceptance / unique analyzed eligible accounts in window | Agent run log + eligibility decisions + CRM/RM action | Weekly | Synthetic count demonstrable |
| Opportunity conversion rate | Unique qualified opportunities closed-won / qualified opportunities with sufficient follow-up time; report cohort window | CRM | Monthly | Scenario assumption only |
| Treasury product attach rate | Eligible customers with active target treasury product / eligible customers | Product ledger + eligibility | Monthly | Synthetic snapshot only |
| Signal-to-review latency | Median/p90 elapsed time from qualifying signal timestamp to RM first review | Signal feed + RM activity | Weekly | Instrumentable; not measured in mock |
| Opportunity preparation time | Median/p90 **active human minutes** spent preparing an accepted opportunity; compare treatment vs control | RM time study / workflow instrumentation | Weekly | Pilot only; do not infer from agent trace |
| RM acceptance rate | RM-approved recommendations / recommendations actually presented to RMs | Approval event log | Weekly | Synthetic count demonstrable |
| Evidence grounding pass rate | Recommendations whose material factual claims are supported by retrieved, permissioned records / audited recommendations | Human-labeled evaluation set + trace/source IDs | Per release and weekly | **Not measured** by scripted model |
| Ineligible-offer prevention | Ineligible offers correctly blocked / known-ineligible attempts in a versioned test set | Policy test suite + audit log | CI and weekly | Demonstrable for covered tests; never generalize to 100% in production |
| Unauthorized CRM write count | Successful writes lacking valid authenticated RM approval and current eligibility | CRM audit + approval ledger | Continuous | Target **zero**; enforce and test |
| Duplicate CRM write count | Duplicate records created for the same approved proposal/idempotency key | CRM audit | Continuous | Target **zero** |
| Model cost per account analyzed | Actual billed model inference cost for completed + failed runs / unique analyzed accounts; report failures separately | OpenAI usage/billing + run IDs | Daily/weekly | Unavailable with mock |
| AI cost per qualified opportunity | Total attributable model + retrieval + orchestration variable cost / RM-accepted eligible opportunities | Usage ledger + agent events | Weekly/monthly | Scenario only |
| Run completion / error rate | Successful terminal runs / all initiated runs; report tool/policy/model failures separately | Agent trace | Daily | Synthetic test count demonstrable |
| Latency | p50/p95 wall-clock run duration, broken down by model/tool/policy | Timestamped trace | Daily | Local mock processing time only. |

**Attribution rule:** a treasury opportunity is *not* incremental merely because an agent found it. Only a randomized or defensible quasi-experimental comparison can support an incremental lift claim. If randomization is not possible, pre-register matching/difference-in-differences methodology and label causal limitations.

## 4. Required event and entity contract

Every event should contain `event_id`, `event_type`, `occurred_at` (UTC), `run_id`, `account_id` (pseudonymous), `actor_type` (`agent|rm|policy|system`), `source_system`, `environment`, `schema_version`, and a minimal `payload`. Do not include raw transaction descriptions or customer PII in general telemetry.

| Event | Required additional fields | Metric supported |
|---|---|---|
| `signal_detected` | `signal_id`, `signal_type`, `detected_at`, `source_record_ids` | Signal-to-review latency |
| `analysis_started` | `signal_id`, `model_adapter`, `model_id_or_mock`, `prompt_version` | Coverage, cost denominator |
| `tool_call_completed` | `tool_name`, `status`, `duration_ms`, `input_record_ids`, `output_record_ids` | Reliability, traceability |
| `eligibility_decided` | `product_id`, `eligible`, `reason_codes`, `policy_version` | Safety, qualification |
| `revenue_estimated` | `product_id`, `annual_fee_estimate`, `currency`, `pricing_version`, `assumption_ids` | Potential pipeline only |
| `recommendation_presented` | `proposal_id`, `product_id`, `evidence_record_ids`, `estimate_id` | RM acceptance denominator |
| `rm_decision_recorded` | `proposal_id`, `decision`, `rm_actor_id`, `decision_at`, `reason_code` | Acceptance, approval audit |
| `crm_opportunity_created` | `proposal_id`, `crm_opportunity_id`, `idempotency_key`, `eligibility_check_id` | Write safety, pipeline |
| `crm_stage_changed` | `crm_opportunity_id`, `stage`, `effective_at` | Conversion |
| `treasury_product_activated` | `crm_opportunity_id`, `product_id`, `activation_at` | Attach rate |
| `treasury_fees_recorded` | `crm_opportunity_id`, `period`, `contracted_annualized_fee`, `realized_fee`, `currency` | North-star revenue |
| `model_usage_recorded` | `provider_request_id`, `input_tokens`, `output_tokens`, `billed_cost`, `currency`, `estimated` | API economics |
| `run_completed` | `status`, `duration_ms`, `failure_class` | Reliability |

Persist separate reference tables for `account`, `opportunity`, `experiment_assignment`, `policy_version`, `pricing_version`, and `evaluation_case`. A recommendation ID must not be treated as a CRM opportunity ID. Enforce immutable approval history and idempotent writes.

## 5. Example scenario (illustrative, not observed)

Assumptions: 2,000 existing accounts; 30% **incremental** coverage = 600 newly analyzed accounts; 20% RM-accepted and eligible = 120 qualified opportunities; 25% closed-won = 30 wins; $12,000 annualized treasury fees per win = **$360,000 modeled annualized fees**. At 60% contribution margin = $216,000 contribution before AI solution costs; subtract $100,000 annual operating cost = **$116,000 modeled net annual contribution**. This is a scenario, not measured incremental lift. It assumes all 30 wins are truly incremental and ignores timing, implementation costs, and uncertainty. Validate each assumption in the pilot.

**OpenAI economics:** usage depends on actual model, token counts, tool-loop length, caching, and published prices at deployment. Record actual provider usage and billed cost rather than inventing token counts or OpenAI revenue. Bank operating cost includes more than API spend (engineering, controls, support, infrastructure).

## 6. 90-day pilot measurement plan

| Period | Design | Exit criteria / outputs |
|---|---|---|
| Days 0–30: baseline and offline evaluation | Obtain approval for synthetic-to-deidentified data transition; instrument events; sample historical account signals; build a labeled evaluation set covering true/false positives, restricted products, missing data, duplicate approvals, and permission boundaries. Establish BAU time and conversion baselines. | Signed-off event dictionary, policy tests, trace redaction, evaluation rubric, baseline sample sizes, and experiment plan |
| Days 31–60: supervised pilot | Randomize eligible account/RM cohorts where practical, avoid cross-arm contamination, run agent in shadow or RM-review mode, collect time studies, acceptance, grounding and block rates; no outbound actions without approval. | Guardrail tests pass, zero unauthorized writes, useful qualified lead rate, acceptable reviewer workload, early unit-cost estimate |
| Days 61–90: measured expansion decision | Expand only if controls hold; measure matured qualified opportunities and early CRM conversion; calculate treatment/control differences with confidence intervals; track fees as they accrue after activation. | Go/no-go on safety and workflow value; **revenue lift may remain inconclusive** because sales cycles can exceed 90 days; continue follow-up |

**Experiment unit:** randomize by RM or account cluster depending on spillover risk, and pre-register primary/secondary endpoints. Exclude existing open opportunities and pre-existing product negotiations from incremental-attribution claims, or stratify and report them separately. Use intent-to-treat for primary comparisons and explicitly document missing outcomes and cohort maturity.

## 7. Dashboard implementation contract

### Portfolio overview
- Accounts analyzed, eligible recommendations, RM-approved opportunities, CRM opportunities, closed-won opportunities, activated products.
- Label every figure `Synthetic demo`, `Assumption`, or `Observed pilot`.
- Show cohort date range and unique account denominators.

### Agent run view
- Tool timeline, policy decision with reason codes, source record references, recommendation, approval status, CRM write result.
- Label model turns as mock, show measured local processing time, and leave provider latency and cost unavailable.

### Business case view
- Funnel: incremental accounts reached → qualified → closed-won → activated → annualized fees.
- Scenario assumptions editable, with contribution margin and solution operating cost.
- Separate **scenario forecast** from **observed cohort metrics**.

### Evaluation and safety view
- Versioned test-set pass/fail, blocked ineligible attempts, unauthorized write tests, grounding evaluation when live model exists.
- A small set of passing tests is not evidence of broad safety or real-world model accuracy.

### Platform economics view
- Model calls, actual token usage and billed inference costs only after live API integration; otherwise show `Not available — mocked API`.
- Cost per analyzed account and qualified opportunity computed only from actual billable usage and qualifying events.

## 8. Implementation backlog

1. Add typed domain/event schemas and explicit source/status metadata to all KPI payloads.
2. Instrument analysis, eligibility, recommendation, approval, and CRM events; redact customer data.
3. Add deterministic unit tests for metric formulas, event deduplication, eligibility and idempotent writes.
4. Build the scenario-based funnel panel, with prominent `Illustrative` labels.
5. Add a safety/evaluation panel that distinguishes code tests from model evaluations.
6. Integrate real CRM stages, product activation, and billing data only with authorized bank systems.
7. Add live Responses API adapter, measured usage/cost, and a representative model evaluation suite.
8. Establish experiment assignment, cohort maturity, and longer-term revenue attribution.

## 9. Architecture trade-off log additions

- **ADR-008 — Metrics before visuals:** Define canonical event and metric contracts before implementing KPI cards; prevent presentation-driven fabricated metrics.
- **ADR-009 — Attribution:** Use controlled comparisons for incremental revenue; CRM pipeline alone is insufficient evidence.
- **ADR-010 — Revenue estimates:** Deterministic, versioned pricing tool owns fee estimates; model can narrate but not calculate authoritative pricing.
- **ADR-011 — Product surface:** Demo OpenAI Platform/APIs only; Codex may be used as a development tool but is not a second customer-facing demo surface.
- **ADR-012 — Agents SDK:** Evaluate later for consistent orchestration, tool, guardrail and trace patterns across teams; optional, not a prerequisite for V1.

## 10. V1 demo implementation

The observation window begins at server startup or the last demo reset. Funnel counts use unique run IDs, including repeated analyses of the same account. The presented stage counts recommendations available for approval from the application. It does not track whether a human read them. The demo qualification rate uses eligible runs as its denominator. Pilot qualification uses unique eligible accounts as specified in the metric dictionary.

The ledger records the final application policy decision, approval rechecks, and rejected approval attempts. Demo write counters derive from successful CRM events and approval evidence within this process. Local execution durations include orchestration overhead and do not measure provider latency. Event data and CRM records live in memory. Demo scenario inputs are fixed.
