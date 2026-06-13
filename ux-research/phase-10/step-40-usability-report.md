# Usability Test Report — 2026-06-12
# SAT Frontend — Phase 9 Build
# Phase 10, Step 40

Participants: 5 (P06–P10)
Tasks tested: 5
Sessions: Remote, recorded, screen-share

---

## Results by task

### Task 1: Flood risk assessment

| Participant | Outcome           | Time-on-task | Notes                                           |
|-------------|-------------------|--------------|-------------------------------------------------|
| P06 Aarav   | Partial           | 16 min       | Map click failed; modules never loaded          |
| P07 Priya   | Partial           | 18 min       | Same; asked "how long does loading take?"       |
| P08 Vikram  | Partial           | 14 min       | Map click noted as "needs to work"; loading gap |
| P09 Sneha   | Partial           | 15 min       | Map click tried 3×; loading 40 sec with no end  |
| P10 Ananya  | Partial           | 17 min       | Map and loading — same pattern                  |

Completion rate: 0/5 full — 5/5 reached the screen but could not read a result score
Top confusion moment: Mock API returns loading state indefinitely — RightPanel never transitions from skeleton to populated state (00:13–00:18 across all sessions)

---

### Task 2: Return to saved analysis

| Participant | Outcome | Time-on-task | Notes                                      |
|-------------|---------|--------------|--------------------------------------------|
| P06 Aarav   | Failed  | 1.5 min      | Empty project list; no mock data           |
| P07 Priya   | Failed  | 1.5 min      | Said "maybe I need to refresh"             |
| P08 Vikram  | Failed  | 1 min        | Identified issue immediately               |
| P09 Sneha   | Failed  | 2 min        | Said "did my project not save?"            |
| P10 Ananya  | Failed  | 1.5 min      | —                                          |

Completion rate: 0/5
Top confusion moment: Dashboard always shows empty state because `getProjects()` returns mock stub `[]`. Participants created projects in Task 1 but they weren't persisted (no real Supabase connection). P09 questioned whether her Task 1 project had been saved at all.

---

### Task 3: Export PDF report

| Participant | Outcome | Time-on-task | Notes                                                      |
|-------------|---------|--------------|------------------------------------------------------------|
| P06 Aarav   | Failed  | 3 min 10 sec | Checked TopNav icons, Settings page — no entry point found |
| P07 Priya   | Failed  | 3 min 30 sec | Said "every tool has one" — could not locate it            |
| P08 Vikram  | Failed  | 2 min 45 sec | Called it "a blocker for professional use"                 |
| P09 Sneha   | Failed  | 3 min        | Checked Settings; said "is it behind settings icon?"       |
| P10 Ananya  | Failed  | 3 min 20 sec | Scrolled right panel looking for a button at the bottom    |

Completion rate: 0/5
Top confusion moment: `ExportDrawer` is only accessible via `?export=true` URL parameter. There is no visible trigger — no button in `TopNav`, no button at the bottom of `RightPanel`, no floating action. All 5 participants searched the UI systematically and failed. P08's quote: *"This is a blocker for professional use — export is not optional."*

---

### Task 4: New analysis from empty state

| Participant | Outcome   | Time-on-task | Notes                                        |
|-------------|-----------|--------------|----------------------------------------------|
| P06 Aarav   | Completed | 12 sec       | Found CTA immediately on second look         |
| P07 Priya   | Completed | 18 sec       | Initially looked top-right; then found CTA   |
| P08 Vikram  | Completed | 6 sec        | Clean — found it immediately                 |
| P09 Sneha   | Completed | 9 sec        | "Oh this is clean"                           |
| P10 Ananya  | Completed | 11 sec       | —                                            |

Completion rate: 5/5
Top confusion moment: P07 initially looked at the top-right (avatar/settings area) before finding the CTA. Minor — resolved within 18 seconds for all participants.

---

### Task 5: Persistent letterhead preference

| Participant | Outcome | Time-on-task | Notes                                                    |
|-------------|---------|--------------|----------------------------------------------------------|
| P06 Aarav   | Failed  | 2 min        | Found email toggle only; gave up                         |
| P07 Priya   | Failed  | 2 min 30 sec | Said "this is very bare"                                 |
| P08 Vikram  | Failed  | 2 min        | Said "a studio tool needs profile management"            |
| P09 Sneha   | Failed  | 2 min 15 sec | Said "studio settings section"                           |
| P10 Ananya  | Failed  | 2 min 20 sec | Said "studio name, logo, export defaults"                |

Completion rate: 0/5
Top confusion moment: `/settings` page has one toggle (`notifyEmail`). No export preferences section exists. 3/5 participants went to Settings correctly but found nothing. 2/5 also checked the ExportDrawer per-report toggle and identified it was not persistent.

---

## Top 5 usability issues

| # | Issue | Frequency | Severity | Affected screen |
|---|-------|-----------|----------|-----------------|
| 1 | Export entry point does not exist — `ExportDrawer` only opens via `?export=true` URL param; no visible button anywhere in the UI | 5/5 | **B** | `/project/[id]` |
| 2 | Map click interaction not implemented — clicking the map on `/project/new` has no effect; participants tried 2–3× before falling back to address field | 5/5 | **B** | `/project/new` |
| 3 | Module results never load — mock API stubs return indefinitely in loading state; `RightPanel` never transitions to `populated`; participants had no feedback that analysis was done | 5/5 | **B** | `/project/[id]` |
| 4 | Project list always empty — `getProjects()` returns `[]` stub; projects created in Task 1 are not persisted (Supabase not connected); Task 2 is uncompletable in current state | 5/5 | **B** | `/dashboard` |
| 5 | Settings has no export preferences — `/settings` shows only email notification toggle; no persistent letterhead, studio profile, or export defaults | 5/5 | **M** | `/settings` |

Severity: **B** = Blocker | **M** = Major | m = Minor

---

## Beta-blocker determination

All 4 Blocker issues must resolve before Beta. Issue 5 (Major) should resolve in the same sprint — it was raised by all 5 participants and directly affects the export professional credibility story.

| Issue | GitHub issue | Owner | Blocker? |
|-------|-------------|-------|----------|
| Export entry point missing | To be created — #58 | Tanmay (frontend) | YES |
| Map click not wired | Existing gap in `/project/new` — #58 | Tanmay (frontend) | YES |
| Modules never load | Depends on #53 (BE endpoints) | Chirag (BE) + Tanmay | YES |
| Projects not persisted | Depends on Supabase wiring + #53 | Tanmay (Supabase) | YES |
| Settings missing export prefs | To be created — #59 | Tanmay (frontend) | NO — Major |

---

## Document status

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-06-12 |
| Gate status | Pending APPROVE STEP 40 |
| Phase | 10 — Testing & Iteration |
| Step | 40 — Conduct & Synthesise |
