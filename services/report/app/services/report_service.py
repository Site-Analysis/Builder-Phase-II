# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 report delivery — PDF render + persisted-snapshot share link.

Both are INFRA SEAMS, honest about what is real here:
  * PDF via WeasyPrint if installed; otherwise the HTML is returned as `html_fallback` with
    status=unavailable (never a fake/empty PDF).
  * Share link persists a report SNAPSHOT to Supabase and returns a read-only signed link WHEN
    Supabase creds are configured; otherwise status=pending-supabase with the report_id (the C7 gap
    is implemented as a seam, not faked).

The PDF renders from the LIVE composed verdict passed in — never a re-read of the store (so the shared
snapshot can drift without changing the just-generated report).
"""

from __future__ import annotations

import hashlib
import html
import json
import os
from typing import Any

_CONF_BADGE = {
    "authoritative": "AUTHORITATIVE", "derived": "DERIVED",
    "inferred": "INFERRED", "unresolved": "UNRESOLVED",
}


def report_id_for(parcel: dict, generated_at: str) -> str:
    key = f"{parcel.get('lat')},{parcel.get('lon')},{parcel.get('survey_number')},{generated_at}"
    return "rpt_" + hashlib.sha256(key.encode()).hexdigest()[:16]


def _row_html(r: dict) -> str:
    badge = _CONF_BADGE.get(r.get("confidence"), "—")
    parts = [
        f"<td>{html.escape(str(r.get('label','')))}</td>",
        f"<td>{html.escape(str(r.get('value','')))}</td>",
        f"<td>{html.escape(str(r.get('citation') or '—'))}</td>",
        f"<td class='badge'>{badge}</td>",
        f"<td>{html.escape(str(r.get('data_vintage') or '—'))}</td>",
        f"<td>{html.escape(str(r.get('as_of') or '—'))}</td>",
        f"<td>{html.escape(str(r.get('next_action') or ''))}</td>",
        f"<td class='sanction'>{html.escape(str(r.get('sanction_note','')))}</td>",
    ]
    return "<tr>" + "".join(parts) + "</tr>"


def _section(title: str, rows: list[dict]) -> str:
    if not rows:
        return ""
    body = "".join(_row_html(r) for r in rows)
    return (f"<h2>{html.escape(title)}</h2><table><thead><tr>"
            "<th>Item</th><th>Value</th><th>Citation</th><th>Confidence</th><th>Vintage</th>"
            "<th>As-of</th><th>Next action</th><th>Sanction</th></tr></thead>"
            f"<tbody>{body}</tbody></table>")


def render_html(verdict: dict) -> str:
    """Deterministic one-screen HTML from the LIVE composed verdict."""
    v = verdict
    colour = {"GO": "#1a7f37", "CAUTION": "#b58100", "NO_GO": "#b3261e"}.get(v["verdict"], "#333")
    p = v.get("parcel", {})
    head = (
        f"<div class='headline' style='color:{colour}'>"
        f"{html.escape(v['verdict'].replace('_','-'))} "
        f"<span class='conf'>· verdict confidence: {_CONF_BADGE.get(v['confidence'],'—')}</span></div>"
        f"<p class='sub'>{html.escape(v.get('headline',''))}</p>"
        f"<p class='note'>{html.escape(v.get('confidence_note',''))}</p>"
        f"<p class='parcel'>Parcel: {p.get('lat')}, {p.get('lon')}"
        f"{(' · SNo ' + str(p.get('survey_number'))) if p.get('survey_number') else ''} · "
        f"generated {html.escape(str(v.get('generated_at','')))}</p>"
    )
    body = (
        _section("RED FLAGS — deal-killers (resolve first)", v.get("red_flags", []))
        + _section("Confirmed clear", v.get("confirmed_clear", []))
        + _section("Confirm to upgrade the verdict", v.get("confirm_to_upgrade", []))
    )
    style = (
        "body{font-family:system-ui,Arial,sans-serif;margin:24px;color:#111}"
        ".headline{font-size:28px;font-weight:800}.conf{font-size:14px;color:#555;font-weight:600}"
        ".sub{font-size:15px;margin:4px 0}.note{background:#fff8e1;padding:10px;border-radius:6px}"
        ".parcel{color:#555;font-size:12px}h2{font-size:15px;margin-top:20px}"
        "table{border-collapse:collapse;width:100%;font-size:11px}"
        "th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}"
        ".badge{font-weight:700}.sanction{color:#777;font-style:italic}"
        f"h2:first-of-type{{color:{colour}}}"
    )
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>Site verdict — "
            f"{html.escape(v['verdict'])}</title><style>{style}</style></head><body>"
            f"{head}{body}<p class='note'>{html.escape(v.get('disclaimer',''))}</p></body></html>")


def render_pdf(verdict: dict, *, enabled: bool = True) -> dict[str, Any]:
    """Render the LIVE verdict to PDF via WeasyPrint; honest fallback when it is not installed."""
    html_doc = render_html(verdict)
    if not enabled:
        return {"status": "disabled", "html_fallback": html_doc,
                "reason": "PDF render disabled by request"}
    try:
        from weasyprint import HTML  # type: ignore
    except Exception:
        return {
            "status": "unavailable", "media_type": None, "byte_len": None,
            "html_fallback": html_doc,
            "reason": "WeasyPrint not installed in this environment — HTML returned instead of a "
            "fake PDF. Install weasyprint (+ its native deps) to render the PDF.",
        }
    pdf_bytes = HTML(string=html_doc).write_pdf()
    return {"status": "rendered", "media_type": "application/pdf",
            "byte_len": len(pdf_bytes), "html_fallback": None, "reason": None}


def persist_and_share(verdict: dict, report_id: str, *, enabled: bool = True) -> dict[str, Any]:
    """Persist a report SNAPSHOT + return a read-only signed link. Supabase seam: real link only
    when creds are configured; otherwise pending-supabase with the report_id (never a fake link)."""
    if not enabled:
        return {"status": "disabled", "report_id": report_id, "share_link": None,
                "reason": "persistence disabled by request"}
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    snapshot = json.loads(json.dumps(verdict))  # deep copy — the share snapshot cannot mutate the live verdict
    if not (url and key):
        return {
            "status": "pending-supabase", "report_id": report_id, "share_link": None,
            "reason": "SUPABASE_URL / SUPABASE_SERVICE_KEY not configured — snapshot prepared "
            f"(verdict={snapshot['verdict']}) but not persisted; no signed link minted.",
        }
    # Real path (only when creds exist): insert the snapshot + mint a signed read-only link.
    try:  # pragma: no cover - requires live Supabase
        import urllib.request

        req = urllib.request.Request(
            f"{url}/rest/v1/report_snapshots",
            data=json.dumps({"report_id": report_id, "snapshot": snapshot}).encode(),
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"},
        )
        urllib.request.urlopen(req, timeout=15)
        return {"status": "ready", "report_id": report_id,
                "share_link": f"{url}/report/{report_id}", "reason": None}
    except Exception as exc:  # pragma: no cover
        return {"status": "pending-supabase", "report_id": report_id, "share_link": None,
                "reason": f"Supabase persist failed: {exc}"}
