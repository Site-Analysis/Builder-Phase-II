---
name: phase-3-personas
description: Approved UX personas for SAT — 3 personas, SME-confirmed, Phase 3 Step 11
metadata:
  type: project
---

# SAT UX Personas — Phase 3, Step 11
**Status:** APPROVED | SME: Ranjitha, 2026-06-10
**Gate:** APPROVE STEP 11 + SME APPROVED

---

## Persona 1 — Architecture Student / Thesis Researcher

Research basis: Clusters 1, 3, 4, 6, 8

| Attribute        | Value                                                                 | Source         |
|------------------|-----------------------------------------------------------------------|----------------|
| Experience level | 3rd–5th year undergraduate or postgraduate thesis                    | P01 transcript |
| Primary goal     | Complete site analysis for academic submission, solo, fixed deadline  | OBS-21, OBS-22 |
| Current tools    | Google Earth, Revit, GIS, Ventrysky, Shadow Map, AcuWeather, IMD, KSRSAC, Bhuvan | OBS-13, OBS-17, OBS-19 |
| Key frustration  | Data scattered across 10+ sources with unknown recency               | Cluster 1      |

Behaviours (research-backed):
- Visits site first, then does online research to fill gaps — OBS-01, OBS-02
- Attempts to procure government documents (drainage, electricity) from offices in person — OBS-03
- Manually layers sun path, wind, topography from separate tools — OBS-08, OBS-09, OBS-15
- Produces graphical representation as a completely separate step after analysis — OBS-07, OBS-21, OBS-23
- Shares a single peer-generated contour file across the cohort rather than re-verifying — OBS-50
- Accesses Bhuvan and GSI through professor credentials — no direct student access — OBS-19

Pain points (research-backed):
- No one-stop data source; must search 10+ websites per analysis — Cluster 1
- India's digital topography is unreliable; manual site measurement trusted more — Cluster 3, OBS-27
- Each data type lives in a separate tool; layering is manual — Cluster 4
- Representation requires a second full manual pass in different software — Cluster 6

"Proper collection of data, segregation of data, and then the representation of it" — P01, 01:00:10

Fabrication flag: The 6–7 week time estimate is from P02 (OBS-35), not P01's own statement. All other attributes directly observed from P01 transcript.

---

## Persona 2 — Junior to Mid-Career Architect at a Practice

Research basis: Clusters 1, 2, 4, 5, 6, 7, 9

| Attribute        | Value                                                                         | Source         |
|------------------|-------------------------------------------------------------------------------|----------------|
| Experience level | 2–7 years post-graduation; working at a design firm                           | P02 transcript |
| Primary goal     | Deliver site analysis as one parallel stream within a firm workflow           | OBS-35, OBS-36 |
| Current tools    | SketchUp 2026 (paid), Rhino + Grasshopper, QGIS, Ventrysky, Climate Consultant, Andrew Marsh, Google Earth Pro | OBS-37, OBS-38, OBS-39, OBS-40 |
| Key frustration  | No authoritative source for rainfall, wind, flood, or regulation data         | Cluster 1, 5   |

Behaviours (research-backed):
- Conducts pre-study before site visit: zoning, dimensions, easements, height restrictions, ownership, circulation — OBS-31
- Cross-checks all pre-study data against observed reality at site — OBS-32
- Visits site multiple times (up to 9) to cover morning, afternoon, evening windows — OBS-33, OBS-34
- Uses AI-generated Python code in Grasshopper for parametric environmental analysis — OBS-38
- Sources rainfall and flood data from top Google search results; reliability unknown — OBS-41
- Material specifications made without integrated climate data → galvanised steel in humid climate → early rusting → double labour cost for client — OBS-45, OBS-46

Pain points (research-backed):
- No single authoritative source for wind, rainfall, or bylaw data — Clusters 1, 5
- Data recency cannot be verified at time of use — Cluster 2, OBS-43
- Analysis tools are siloed; outputs must be manually integrated — Cluster 4
- Missing climate-material risk analysis creates liability that shifts cost to the client — Cluster 7
- Firm-level speed comes from parallel human streams, not better tools — Cluster 9, OBS-35

"The main problem is that we don't get any site analysis data in a one-stop." — P02, 01:02:06
"Me interacting with the website would be much better." — P02, 01:46:23

Fabrication flag: The firm-level parallelism context is confirmed by P02. The distinction between intern-stage and mid-career-firm-stage is inferred from the trajectory implied in P02's transcript — not two separate participants.

---

## Persona 3 — Senior Architect / Business and Product Mentor

Research basis: Clusters 1, 2, 5, 7, 9, 10
Primary source: SME-synthesised profiles P03*, P04* — confirmed by SME Ranjitha, 2026-06-10

| Attribute        | Value                                                                             | Source                  |
|------------------|-----------------------------------------------------------------------------------|-------------------------|
| Experience level | 10–20+ years; leads projects, shapes product and business direction               | SME-confirmed           |
| Primary goal     | Personally understand the site through direct observation; ensure data credibility holds up to client and regulatory scrutiny | SME-confirmed, OBS-56 CORRECTED |
| Current tools    | Revit (primary BIM), SketchUp (firm licence), firm's historical project data for institutional shortcuts | SME-confirmed           |
| Key frustration  | No digital tool supports or extends the depth of site understanding built through personal observation | SME-confirmed, Ranjitha 2026-06-10 |

Behaviours (source noted for each):
- Visits site personally, multiple times — observes sun path, wind, drainage, vegetation, surrounding activity across different times of day — SME-CONFIRMED (OBS-56 CORRECTED, Ranjitha 2026-06-10)
- Physical site presence is core to practice, not delegated — the design is expected to emerge from the site's natural conditions — SME-CONFIRMED
- Historical precedent cited by SME: architects once spent up to a year observing a site before beginning design (Glenn Murcutt methodology). Today the timeline is compressed; the instinct remains — Ranjitha, 2026-06-10
- Uses institutional knowledge from historical firm projects in the same geography as shortcuts — SME-confirmed (OBS-57)
- Legal and regulatory data arrives via the firm's government contacts, not digital portals — TRANSCRIPT-confirmed (OBS-49, P02)
- Frames product questions in terms of client and builder risk: land acquisition notifications, buffer zones, construction risk scores — SME review transcripts

Pain points (source noted for each):
- No digital tool supports what the senior architect already does in person — instruments cannot match multi-sensory site observation — SME-confirmed
- Material specification decisions made without real-time climate data lead to rework costs borne by client — SME-confirmed (Cluster 7, confirmed P02 real transcript)
- No tool aggregates climate, soil, topography, and regulations at firm level — SME-confirmed (Cluster 1)
- Data credibility is an adoption blocker — must be able to cite authoritative sources to clients and regulatory bodies — SME-confirmed (Cluster 2)

"The design should emerge from the site's natural conditions." — SME reference to Glenn Murcutt methodology, Ranjitha 2026-06-10

Adoption blockers (SME-confirmed):
- Must integrate with existing Revit and SketchUp workflows
- Must export IFC or DWG format
- Must be operable by junior team members without senior oversight

Fabrication flag:
OBS-56 was originally [SYNTHETIC] and stated senior architects "delegate physical site analysis." SME Ranjitha explicitly corrected this on 2026-06-10: senior architects visit site personally, multiple times — delegation is not the pattern. All other [SYNTHETIC] attributes (OBS-57 through OBS-65) confirmed correct by SME. The regulatory access via relationships (OBS-49) and the 1-week vs. 6–7-week comparison (OBS-35) are from P02's real transcript.
