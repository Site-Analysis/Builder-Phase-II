# Moderator Guide — Usability Testing
# SAT UX Research — Phase 10, Step 39
# Version 1.0 — 2026-06-12

**Total target duration:** 60–75 min
**Format:** Remote video call (Google Meet / Zoom), recorded with consent
**Participants:** 5 — same pool as Phase 1 preferred (P01–P05 archetypes)
**Profiles covered:** Junior Architect · Senior Architect · Urban Planner / M.Arch Student
**Product under test:** SAT frontend — `apps/web` (Next.js 16, Phase 9 build)
**Environment:** Moderator shares a staging URL or localhost — participant observes / takes over via remote control

---

## Pre-session checklist

- [ ] Recording consent confirmed verbally:
      *"We're recording this session for internal research. It will not be shared externally. Are you okay with that?"*
- [ ] Framing set:
      *"We're testing the tool, not you. If something is confusing, that tells us we need to fix it — not that you're doing something wrong. Think out loud as much as you can."*
- [ ] Confirm participant name, role, firm, city
- [ ] Staging environment confirmed loading (check /login → /dashboard → /project/new route chain)
- [ ] Screenshare or remote control active before task begins
- [ ] Note-taking: behaviour > opinion; quote verbatim on strong reactions; timestamp confusion moments

---

## Section 1 — Warm-up `[5 min]`

**Goal:** Confirm profile match, build rapport, set expectation that thinking aloud is valued.

**Q1.** Briefly — what kind of projects have you been working on in the last few months, and how often does site analysis come up?

**Q2.** Have you used any web-based tools for site data before? What was that experience like?

*Moderator note: Do not mention SAT by name yet. Transition naturally into the task briefing.*

---

## Section 2 — Orientation `[5 min]`

**Goal:** Introduce the product without explaining the UI. Let the participant form first impressions.

*Show the participant the login screen without narrating what it is.*

**Q3.** What does this look like to you? What do you think you'd be able to do here?

*After 30–60 seconds of free exploration, proceed to Task 1.*

---

## Section 3 — Task Execution `[40 min]`

**Instructions for all tasks:**
- Read the scenario aloud, then the task. Do not read the success criteria.
- Do not prompt, guide, or name UI elements. If the participant asks "should I click here?", respond: *"What would you do if I weren't here?"*
- Note the exact moment confusion starts (timestamp + what they said or did).
- If the participant is fully stuck and unable to proceed after 3 minutes, offer: *"Let's move on — that was useful data."*

---

### Task 1 — Flood risk assessment `[~8 min]`

**Scenario (read aloud):**
"You've just been handed a brief for a plot in Pune. Your principal wants to know the flood exposure before the design team commits to the scheme."

**Task (read aloud):**
"Using this tool, assess the flood risk for that site."

**Moderator observation sheet:**
| Observation point | Notes |
|---|---|
| Did participant find 'New analysis' from dashboard? | |
| Did participant successfully create a project? | |
| Did participant locate the Flood Risk module in the right panel? | |
| How long to reach the flood score? | |
| Any hesitation at: dashboard CTA / map interaction / right panel? | |
| Verbatim quote (strongest reaction): | |

**Success:** Participant reaches `/project/[id]`, opens or sees the Flood Risk module panel, reads the severity score.
**Failure:** Cannot find the flood result, or abandons before reaching the module.

---

### Task 2 — Return to saved analysis `[~8 min]`

**Scenario (read aloud):**
"A colleague ran an analysis last week for a project in Hyderabad. You need to pick up where they left off and review the sun path findings."

**Task (read aloud):**
"Find that project and read the sun path result."

**Moderator observation sheet:**
| Observation point | Notes |
|---|---|
| Did participant go to dashboard without prompting? | |
| Did participant find the project in the list? | |
| Did participant open the correct project? | |
| Did participant locate the Sun Path module? | |
| Any confusion with project card layout or navigation? | |
| Verbatim quote: | |

**Success:** Navigates from `/dashboard` to `/project/[id]`, opens Sun Path panel, reads the output.
**Failure:** Cannot find the project, or reaches the screen but cannot locate Sun Path.

---

### Task 3 — Export PDF report `[~8 min]`

**Scenario (read aloud):**
"You need to send a summary of the site analysis to your client before tomorrow's presentation."

**Task (read aloud):**
"Export a PDF report of this analysis."

**Moderator observation sheet:**
| Observation point | Notes |
|---|---|
| Where did participant look first for the export action? | |
| Did participant find the ExportDrawer entry point? | |
| Did participant select modules before generating? | |
| Did participant click 'Generate PDF'? | |
| Any confusion with the two-panel drawer layout? | |
| Verbatim quote: | |

**Success:** Opens ExportDrawer, selects at least one module, clicks Generate PDF.
**Failure:** Cannot find the export entry point, or completes a different action believing it to be the export.

---

### Task 4 — Start a new analysis from empty state `[~8 min]`

**Scenario (read aloud):**
"You've just signed in for the first time. You have no projects yet. You have a site in mind — any location you like."

**Task (read aloud):**
"Start a new site analysis."

**Moderator observation sheet:**
| Observation point | Notes |
|---|---|
| Did participant notice the 'New analysis' CTA in the empty state? | |
| Did participant reach `/project/new`? | |
| Did participant interact with the map? | |
| Did participant complete the project name field? | |
| Did participant trigger the analysis? | |
| Verbatim quote: | |

**Success:** Navigates from empty dashboard to `/project/new`, places a marker or enters an address, names the project, triggers analysis.
**Failure:** Does not find the 'New analysis' action, or abandons before analysis runs.

---

### Task 5 — Persist letterhead export preference `[~8 min]`

**Scenario (read aloud):**
"Your studio has a letterhead template. You want every future export to include it automatically."

**Task (read aloud):**
"Enable the letterhead option for exports and save your preference."

**Moderator observation sheet:**
| Observation point | Notes |
|---|---|
| Where did participant look first (ExportDrawer toggle vs. Settings)? | |
| Did participant reach `/settings`? | |
| Did participant find a relevant preference? | |
| Did participant distinguish between per-report setting and account setting? | |
| Any confusion about scope (this export vs. all exports)? | |
| Verbatim quote: | |

**Success:** Reaches `/settings` and finds/enables a letterhead-related preference.
**Failure:** Only toggles the per-report setting in ExportDrawer (and does not recognise it is not persistent), or cannot find any setting.

---

## Section 4 — Debrief `[10 min]`

**Goal:** Surface general impressions and anything the tasks did not reveal.

**Q4.** Overall — what was your first impression of the tool?

**Q5.** Was there any moment where you weren't sure what to do next? Where?

**Q6.** Is there anything you expected to find that wasn't there?

**Q7.** If this were available to you during a real project, which part would you use most? Which part feels least useful?

**Q8.** On a scale of 1–5: How confident do you feel that this tool would give you reliable data for a real client deliverable? *(1 = not at all, 5 = completely)* — and why?

---

## Post-session checklist

- [ ] Save recording
- [ ] Export notes with timestamps
- [ ] Upload to `ux-research/phase-10/transcripts/P0X-[name]-[date].md`
- [ ] Fill in observation sheets before next session
- [ ] Note top confusion moment with screen + timestamp
- [ ] Notify: "P0X session done — ready for synthesis"

---

## Issue capture template

Use this for every confusion moment observed during tasks:

```
Issue #[N]
Screen: [screen name / route]
Task: [Task N]
Participant: [P0X]
Timestamp: [mm:ss]
Observation: [exact behaviour — what they did, what they said]
Severity: B (Blocker) | M (Major) | m (Minor)
Hypothesised cause: [moderator's read — UI affordance missing, label unclear, etc.]
```

---

## Document status

| Field | Value |
|---|---|
| Version | 1.0 |
| Created | 2026-06-12 |
| Gate status | Pending APPROVE STEP 39 + SME APPROVED |
| Phase | 10 — Testing & Iteration |
| Step | 39 — Usability Testing Setup |
