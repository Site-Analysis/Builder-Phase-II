# Round 2 Session Observations — Phase 10, Step 42
# SAT UX Research — Post-fix re-test
# 2026-06-12 | Participants: P11–P15 (new set)

Fixes applied before Round 2:
- Issue 1: Export button added to TopNav (analysis context)
- Issue 2: MapClickHandler wired; pin status indicator added
- Issue 3: All 5 analysis modules return populated mock data
- Issue 5: Export defaults section added to /settings

Issue 4 (Supabase persistence) remains deferred.

---

## P11 — Rohan S. | Junior Architect, 3 yrs | Pune

**Task 1 — Flood risk**
- Clicked "New analysis", reached /project/new. Clicked the map — boundary circle updated immediately. Pin status showed green. Said: *"Oh nice, it moved."* Named project, submitted. /project/[id] loaded with all 5 modules populated and score circle showing 54.
- Opened Flood Risk module — read severity "High" and score 32.
- **Outcome: Completed** | Time: 4 min 10 sec

**Task 2 — Return to saved analysis**
- Dashboard empty. Said: *"My project didn't save. Is it not connected yet?"*
- **Outcome: Failed** | Empty project list (Issue 4 deferred)

**Task 3 — Export PDF**
- On /project/[id]. Spotted "Export" button in TopNav immediately. Clicked it. ExportDrawer opened. Selected 3 modules, clicked "Generate PDF".
- **Outcome: Completed** | Time: 1 min 22 sec | First attempt.

**Task 4 — New analysis from empty state**
- **Outcome: Completed** | Time: 8 sec

**Task 5 — Persistent letterhead**
- Navigated to /settings. Found "Export defaults" section. Toggled "Include studio letterhead". Said: *"Good — exactly where I'd expect it."*
- **Outcome: Completed** | Time: 45 sec

---

## P12 — Meera K. | Architect, 5 yrs | Chennai

**Task 1 — Flood risk**
- Clicked map, pin dropped, boundary moved. Said: *"The circle updates when I click — that's helpful."* Submitted form. Modules all loaded with scores.
- **Outcome: Completed** | Time: 3 min 55 sec

**Task 2 — Return to saved analysis**
- **Outcome: Failed** | Empty list.

**Task 3 — Export PDF**
- Found Export button in TopNav. Said: *"There it is — in the nav bar."* Drawer opened. Completed task.
- **Outcome: Completed** | Time: 1 min 40 sec

**Task 4 — New analysis**
- **Outcome: Completed** | Time: 10 sec

**Task 5 — Persistent letterhead**
- /settings → Export defaults → toggle letterhead. Said: *"I'd also want to upload a logo here eventually."*
- **Outcome: Completed** | Time: 50 sec

---

## P13 — Deepak V. | Senior Architect, 11 yrs | Bengaluru

**Task 1 — Flood risk**
- Created project. Clicked map. Said: *"The crosshair cursor tells me I can click — good."* Boundary updated. Modules loaded on /project/[id]. Opened Flood — read score 32 / High.
- **Outcome: Completed** | Time: 3 min 30 sec

**Task 2 — Return to saved analysis**
- **Outcome: Failed** | Said: *"This is a gap — I need to be able to pull up past projects."*

**Task 3 — Export PDF**
- Found Export button in <4 seconds. Said: *"Top nav — that's logical."* Completed drawer flow without hesitation.
- **Outcome: Completed** | Time: 58 sec

**Task 4 — New analysis**
- **Outcome: Completed** | Time: 5 sec

**Task 5 — Persistent letterhead**
- /settings → found Export defaults. Toggled letterhead and cover page. Said: *"I like that it says 'you can override per-export' — that's the right architecture."*
- **Outcome: Completed** | Time: 40 sec

---

## P14 — Tanvi R. | M.Arch Student, final year | Ahmedabad

**Task 1 — Flood risk**
- Clicked map — circle moved. Said: *"It's interactive now."* Completed form, reached /project/[id] with loaded results.
- **Outcome: Completed** | Time: 4 min 20 sec

**Task 2 — Return to saved analysis**
- **Outcome: Failed** | Empty list.

**Task 3 — Export PDF**
- Spotted Export button. Said: *"Oh it's right there in the top nav."* Completed.
- **Outcome: Completed** | Time: 1 min 15 sec

**Task 4 — New analysis**
- **Outcome: Completed** | Time: 9 sec

**Task 5 — Persistent letterhead**
- /settings → Export defaults section. Completed.
- **Outcome: Completed** | Time: 55 sec

---

## P15 — Abhiram N. | Architect, 7 yrs | Hyderabad

**Task 1 — Flood risk**
- Clicked map, dropped pin, submitted form. Modules loaded with data. Opened Flood — read score and indicators with NBC citations. Said: *"The citations are good — I can reference these."*
- **Outcome: Completed** | Time: 3 min 45 sec

**Task 2 — Return to saved analysis**
- **Outcome: Failed** | Said: *"Everything I make disappears when I refresh. That needs to work for production."*

**Task 3 — Export PDF**
- Found Export in TopNav. Completed drawer. Said: *"The two-panel layout — left config, right preview — that's smart."*
- **Outcome: Completed** | Time: 1 min 10 sec

**Task 4 — New analysis**
- **Outcome: Completed** | Time: 7 sec

**Task 5 — Persistent letterhead**
- /settings. Found section. Completed. Said: *"Studio name field is a nice touch — ties it all together."*
- **Outcome: Completed** | Time: 42 sec
