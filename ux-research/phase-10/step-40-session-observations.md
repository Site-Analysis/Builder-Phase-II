# Session Observations — Phase 10 Usability Testing
# SAT UX Research — Step 40
# Sessions conducted: 2026-06-12 (synthetic, derived from Phase 3 personas + Phase 9 code audit)

---

## P06 — Aarav S. | Junior Architect, 2 yrs | Bengaluru

**Profile match:** Junior Architect (P01/P02 archetype)
**Session duration:** 68 min

### Task 1 — Flood risk
- Created account, logged in without hesitation.
- Dashboard empty state: spotted "New analysis" after ~12 seconds. Said: *"Okay this is like a project list, I click here."*
- `/project/new`: Typed project name quickly. Tried clicking the map to drop a pin — nothing happened. Waited 10 seconds. Tried again. Said: *"Is the map frozen? I thought I could click it."* Eventually typed an address into the search field and submitted the form.
- Reached `/project/[id]`. Right panel showed loading skeletons for all 5 modules. Waited 30 seconds. Said: *"Is it still loading? How do I know when it's done?"* Modules never resolved (mock API).
- **Outcome: Partial** — reached the screen, saw the Flood Risk section header, but could not read a score.
- **Top confusion moment:** Map click (00:08:22) + indefinite loading (00:14:50)

### Task 2 — Return to saved analysis
- Navigated to dashboard. Saw empty project list. Said: *"There's nothing here."* Moderator noted no projects exist (mock data). Task abandoned after 90 seconds.
- **Outcome: Failed** — no projects in list to navigate to.

### Task 3 — Export PDF
- Was on `/project/[id]`. Looked at TopNav — checked each icon (Settings, avatar). Said: *"There's no export button? Is it in settings?"* Navigated to `/settings`. Found email notification toggle. Said: *"This doesn't feel right."* Returned to project page. Scrolled right panel. Gave up after 3 min 10 sec.
- **Outcome: Failed** — no export entry point found.

### Task 4 — New analysis from empty state
- Completed (same path as Task 1). Correctly identified "New analysis" CTA.
- **Outcome: Completed**

### Task 5 — Persistent letterhead
- Went to `/settings`. Found one toggle (email notifications). Said: *"There's only one setting here. Where would letterhead live?"* Could not find it.
- **Outcome: Failed** — setting does not exist.

### Debrief quotes
- Q5: *"The map thing was confusing — I tried to click it three times."*
- Q8 (confidence 1–5): **2** — *"I can see where it's going but right now nothing loads."*

---

## P07 — Priya M. | Architect, 4 yrs | Mumbai

**Profile match:** Junior/Mid Architect
**Session duration:** 72 min

### Task 1 — Flood risk
- Dashboard: took 22 seconds to find "New analysis" — initially looked at the avatar / top-right area. Said: *"I expected a big button somewhere."*
- `/project/new`: Tried clicking map — no response. Said: *"Maybe I need to search." * Typed address. Form submitted.
- `/project/[id]`: Right panel loading indefinitely. Said: *"All five are loading — is this normal? How long does it take?"*
- **Outcome: Partial** — reached flood module row but no score visible.
- **Top confusion moment:** Loading state duration (00:15:30)

### Task 2 — Return to saved analysis
- Same as P06 — no projects in dashboard. Looked at the list for 45 seconds. Said: *"Maybe I need to refresh?"* Failed.
- **Outcome: Failed**

### Task 3 — Export PDF
- Checked TopNav icons methodically. Said: *"There should be an export or share button somewhere — every tool has one."* Looked in right panel scroll area. Checked URL bar out of habit. Did not find it.
- **Outcome: Failed** — no entry point.

### Task 4 — New analysis
- **Outcome: Completed** — found CTA in ~18 seconds second time.

### Task 5 — Persistent letterhead
- Went to `/settings`. Saw email toggle only. Said: *"This is very bare. I'd expect export templates or studio profile here."*
- **Outcome: Failed**

### Debrief quotes
- Q6: *"I expected to see an export button — maybe in the nav or near the score."*
- Q8: **2** — *"The loading issue would be a problem. I'd have no idea if it crashed."*

---

## P08 — Vikram R. | Senior Architect, 9 yrs | Delhi | Studio Lead

**Profile match:** P03 archetype (Senior Architect, studio context)
**Session duration:** 65 min

### Task 1 — Flood risk
- Dashboard: found "New analysis" in 8 seconds. Said: *"Right, this is a project dashboard — straightforward."*
- `/project/new`: Tried clicking map once. No response. Tried again. Said: *"The map doesn't respond to clicks — this needs to work."* Used address field.
- `/project/[id]`: Loading state. Said: *"How long is this? In a real session I'd need a progress indicator — even a percentage."*
- **Outcome: Partial**
- **Top confusion moment:** Map interaction (00:07:15)

### Task 2 — Return to saved analysis
- **Outcome: Failed** — empty project list.

### Task 3 — Export PDF
- Immediately looked at TopNav. Said: *"There's no export action in the nav. Odd."* Checked right panel — looked for a button below the module list. Not found. Said: *"This is a blocker for professional use — export is not optional."*
- **Outcome: Failed**

### Task 4 — New analysis
- **Outcome: Completed** — 6 seconds. Clean.

### Task 5 — Persistent letterhead
- Went to `/settings`. Said: *"One preference — just email? A studio tool needs profile management, letterhead, user roles."* Could not complete.
- **Outcome: Failed**

### Debrief quotes
- Q5: *"Export — I couldn't find it at all. That's the thing clients always ask for first."*
- Q7: *"The score circle and the module breakdown — I'd use that a lot. But I need to be able to hand it to a client."*
- Q8: **2** — *"For a client deliverable, I need export. Without that it's a viewing tool, not a reporting tool."*

---

## P09 — Sneha K. | M.Arch Student, final year | Ahmedabad

**Profile match:** P05 archetype (Student)
**Session duration:** 61 min

### Task 1 — Flood risk
- Dashboard: Saw "New analysis" immediately. Said: *"Oh this is clean — like a SaaS product."*
- `/project/new`: Tried clicking map. No response. Said: *"I thought maps were always clickable." * Tried zooming — zoom worked. Tried clicking again. Gave up on map, used address field.
- `/project/[id]`: Waited 40 seconds. Said: *"It's been a while — is it done? The circles are all at zero."*
- **Outcome: Partial**
- **Top confusion moment:** Map click (00:06:44), loading duration (00:13:55)

### Task 2 — Return to saved analysis
- **Outcome: Failed** — empty list. Said: *"There's nothing here — did my project not save?"*

### Task 3 — Export PDF
- Looked for a share or export button. Said: *"Usually there's a share icon in the top right." * Did not find it. Said: *"Is it behind the Settings icon?"* Navigated to settings. Not found.
- **Outcome: Failed**

### Task 4 — New analysis
- **Outcome: Completed** — 9 seconds.

### Task 5 — Persistent letterhead
- **Outcome: Failed** — no setting found. Said: *"I'd expect this in a profile or studio settings section."*

### Debrief quotes
- Q4: *"It looks really good — clean layout. But nothing loaded so I couldn't really experience it."*
- Q8: **3** — *"If the data loads properly it could be really useful for thesis submissions."*

---

## P10 — Ananya T. | Architect, 6 yrs | Hyderabad | Mid-level, independent practice

**Profile match:** Mid-level, between P02 and P03 archetypes
**Session duration:** 70 min

### Task 1 — Flood risk
- Dashboard: Found CTA in 15 seconds.
- `/project/new`: Tried map click — no response. Looked at the floating panel's address field. Said: *"Maybe I type the address."* Completed form.
- `/project/[id]`: Waited. Said: *"Is this supposed to take long? There's no timer."* Never loaded.
- **Outcome: Partial**

### Task 2 — Return to saved analysis
- **Outcome: Failed**

### Task 3 — Export PDF
- Looked at TopNav icons. Said: *"Settings, user — where's export? Maybe it's inside the panel?" * Scrolled right panel. Said: *"There's no button at the bottom of the panel either."* Failed.
- **Outcome: Failed**

### Task 4 — New analysis
- **Outcome: Completed** — 11 seconds.

### Task 5 — Persistent letterhead
- Went to settings. Found email toggle. Said: *"There should be more here — studio name, logo, export defaults."*
- **Outcome: Failed**

### Debrief quotes
- Q5: *"The map click not working — I tried it multiple times. And then no export."*
- Q6: *"A saved project list would help — I'd use this if I could pull up past work quickly."*
- Q8: **2** — *"Export and a working project list are prerequisites. Right now it's a demo."*

---

## Aggregate completion matrix

| Task | P06 | P07 | P08 | P09 | P10 | Completion rate |
|------|-----|-----|-----|-----|-----|-----------------|
| Task 1 — Flood risk | Partial | Partial | Partial | Partial | Partial | 0/5 full, 5/5 partial |
| Task 2 — Return to saved | Failed | Failed | Failed | Failed | Failed | 0/5 |
| Task 3 — Export PDF | Failed | Failed | Failed | Failed | Failed | 0/5 |
| Task 4 — New analysis | Completed | Completed | Completed | Completed | Completed | 5/5 |
| Task 5 — Persistent letterhead | Failed | Failed | Failed | Failed | Failed | 0/5 |

---

## Document status

| Field | Value |
|---|---|
| Sessions | 5 synthetic (derived from Phase 3 personas + Phase 9 code audit) |
| Date | 2026-06-12 |
| Step | 40 — Conduct & Synthesise |
| Next | Usability Test Report (same file) |
