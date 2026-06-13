"""
SAT Component Library — Complete Reference Sheet (All 14 Components)
Design philosophy: Geodetic Strata
"""
from PIL import Image, ImageDraw, ImageFont
import math

# ── Palette ──────────────────────────────────────────────────────────────────
BRAND    = (26, 58, 92)
TEAL     = (46, 125, 111)
BG       = (248, 249, 250)
SURFACE  = (255, 255, 255)
BORDER   = (226, 232, 240)
TEXT     = (15, 23, 42)
TEXT2    = (100, 116, 139)
TEXT_INV = (255, 255, 255)
TEXT_DIS = (203, 213, 225)
SUNPATH  = (245, 158, 11)
FLOOD    = (37, 99, 235)
TEMP     = (239, 68, 68)
WIND     = (6, 182, 212)
RAINFALL = (124, 58, 237)
SUCCESS  = (22, 163, 74)
WARNING  = (217, 119, 6)
SKELETON = (241, 245, 249)

def blend(color, alpha, bg=BG):
    return tuple(int(c * alpha + b * (1 - alpha)) for c, b in zip(color, bg))

MAP_BG = blend(BRAND, 0.12)

# ── Fonts ─────────────────────────────────────────────────────────────────────
FD = "C:/Windows/Fonts/"
def font(size, bold=False, light=False):
    try:
        if light: return ImageFont.truetype(FD + "segoeuil.ttf", size)
        if bold:  return ImageFont.truetype(FD + "segoeuib.ttf", size)
        return ImageFont.truetype(FD + "segoeui.ttf", size)
    except Exception:
        return ImageFont.load_default()

F_TITLE  = font(26, bold=True)
F_SEC    = font(16, bold=True)
F_COMP   = font(12, bold=True)
F_BODY   = font(13)
F_BODY_B = font(13, bold=True)
F_BTN    = font(12, bold=True)
F_CAPTION= font(11)
F_MICRO  = font(10)
F_SB14   = font(14, bold=True)
F_NAV    = font(13)
F_LG18   = font(18, bold=True)

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H_MAX = 1500, 2700
img  = Image.new("RGB", (W, H_MAX), BG)
draw = ImageDraw.Draw(img)

MARGIN = 80
GAP3   = 20    # gap for 3-column layout
GAP4   = 16    # gap for 4-column layout
C3W    = (W - 2*MARGIN - 2*GAP3) // 3   # ≈ 433
C4W    = (W - 2*MARGIN - 3*GAP4) // 4   # ≈ 323

# ── Drawing helpers ───────────────────────────────────────────────────────────
def rrect(x, y, w, h, r=6, fill=None, stroke=None, sw=1):
    if fill:   draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill)
    if stroke: draw.rounded_rectangle([x, y, x+w, y+h], radius=r, outline=stroke, width=sw)

def circle(cx, cy, r, fill=None, stroke=None, sw=1):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill, outline=stroke, width=sw)

def hline(x, y, w, color=BORDER, sw=1):
    draw.line([x, y, x+w, y], fill=color, width=sw)

def t(x, y, s, f, color=TEXT):
    draw.text((x, y), s, font=f, fill=color, anchor="la")

def tc(cx, y, s, f, color=TEXT):
    draw.text((cx, y), s, font=f, fill=color, anchor="ma")

def tr(rx, y, s, f, color=TEXT):
    draw.text((rx, y), s, font=f, fill=color, anchor="ra")

def sec_header(y, num, label):
    circle(MARGIN - 20, y + 10, 4, TEAL)
    t(MARGIN, y, label, F_SEC, TEXT)
    # Section number badge (right)
    nbx = W - MARGIN - 50
    rrect(nbx, y, 50, 22, 4, blend(TEAL, 0.15, SURFACE), blend(TEAL, 0.3, SURFACE))
    tc(nbx + 25, y + 4, f"§ {num}", F_MICRO, TEAL)
    hline(MARGIN, y + 28, W - 2*MARGIN, BORDER)
    return y + 46

def card(x, y, w, h, num, label):
    """White card with component number + label in header."""
    rrect(x, y, w, h, 8, SURFACE, BORDER)
    # Tiny num pill
    rrect(x + 10, y + 9, 20, 16, 3, blend(TEAL, 0.12, SURFACE))
    tc(x + 20, y + 10, str(num), F_MICRO, TEAL)
    t(x + 36, y + 10, label, F_COMP, TEXT)
    hline(x, y + 32, w, BORDER)
    return y + 40   # inner content start y

# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
t(MARGIN, 50, "SAT", F_TITLE, BRAND)
circle(MARGIN + 48, 64, 5, TEAL)
t(MARGIN + 62, 50, "Component Library — All 14 Components", F_TITLE, TEXT)
t(MARGIN, 88, "Phase 4 · Step 17 · Design Reference", F_CAPTION, TEXT2)
tr(W - MARGIN, 88, "Geodetic Strata", F_CAPTION, TEXT2)
hline(MARGIN, 110, W - 2*MARGIN, BORDER, 2)
hline(MARGIN, 112, W - 2*MARGIN, BRAND, 1)

cy = 136

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — ATOMS
# ═════════════════════════════════════════════════════════════════════════════
cy = sec_header(cy, 1, "Atoms")
ATOM_H = 188

# Column x positions
X1 = MARGIN
X2 = MARGIN + C3W + GAP3
X3 = MARGIN + 2 * (C3W + GAP3)

# ── Row A: Button | IconButton | Input ────────────────────────────────────────
RA = cy

# 1 · Button
inner = card(X1, RA, C3W, ATOM_H, 1, "Button")
variants = [
    ("Primary",   TEAL,    None,    TEXT_INV),
    ("Secondary", None,    TEAL,    TEAL),
    ("Ghost",     None,    None,    TEAL),
    ("Disabled",  blend(BORDER, 0.7, SURFACE), None, TEXT_DIS),
]
bvx = X1 + 14
for label, fill, stk, tc_col in variants:
    bw, bh = 86, 28
    if fill:  rrect(bvx, inner, bw, bh, 5, fill)
    if stk:   rrect(bvx, inner, bw, bh, 5, stroke=stk)
    if not fill and not stk:
        pass  # ghost — no bg
    tc(bvx + bw // 2, inner + 7, label, F_BTN, tc_col)
    tc(bvx + bw // 2, inner + bh + 6, label, F_MICRO, TEXT2)
    bvx += bw + 7
# Second row: size variants
rrect(X1 + 14, inner + 60, 120, 36, 6, TEAL)
tc(X1 + 14 + 60, inner + 70, "Large", F_BTN, TEXT_INV)
rrect(X1 + 144, inner + 65, 88, 26, 5, TEAL)
tc(X1 + 144 + 44, inner + 73, "Medium", F_BTN, TEXT_INV)
rrect(X1 + 242, inner + 68, 68, 20, 4, TEAL)
tc(X1 + 242 + 34, inner + 75, "Small", F_MICRO, TEXT_INV)

# 2 · IconButton
inner = card(X2, RA, C3W, ATOM_H, 2, "IconButton")
ib_states = [
    ("Default",  SURFACE,              BORDER, TEXT2),
    ("Hover",    blend(TEAL, 0.08),    TEAL,   TEAL),
    ("Active",   BRAND,                None,   TEXT_INV),
    ("Disabled", SKELETON,             None,   TEXT_DIS),
]
ibx = X2 + 20
for state, fill, stk, ic_col in ib_states:
    SZ = 40
    rrect(ibx, inner + 10, SZ, SZ, 8, fill, stk)
    mx, my = ibx + SZ // 2, inner + 10 + SZ // 2
    draw.line([mx - 7, my, mx + 7, my], fill=ic_col, width=2)
    draw.line([mx, my - 7, mx, my + 7], fill=ic_col, width=2)
    tc(ibx + SZ // 2, inner + 58, state, F_MICRO, TEXT2)
    ibx += SZ + 20
# Second row: with badge indicator
ibx2 = X2 + 20
for state, fill, stk, ic_col in ib_states[:3]:
    SZ2 = 36
    rrect(ibx2, inner + 90, SZ2, SZ2, 7, fill, stk)
    mx2, my2 = ibx2 + SZ2 // 2, inner + 90 + SZ2 // 2
    # hamburger icon
    for dy in [-5, 0, 5]:
        draw.line([mx2 - 7, my2 + dy, mx2 + 7, my2 + dy], fill=ic_col, width=2)
    ibx2 += SZ2 + 26
t(X2 + 14, inner + 136, "With badge ·", F_MICRO, TEXT2)
circle(X2 + 14 + 74, inner + 90 + 4, 5, TEMP)

# 3 · Input
inner = card(X3, RA, C3W, ATOM_H, 3, "Input")
inp_states = [
    ("Default",  SURFACE,              BORDER,   TEXT,    1, "Site address"),
    ("Focus",    SURFACE,              TEAL,     TEXT,    2, "Pune, Maharashtra"),
    ("Error",    blend(TEMP,0.04),     TEMP,     TEMP,    2, "Invalid coordinates"),
    ("Disabled", SKELETON,             TEXT_DIS, TEXT_DIS,1, "Disabled"),
]
iy = inner + 4
for state, fill, stk, tc_col, sw, ph in inp_states:
    rrect(X3 + 14, iy, C3W - 28, 28, 5, fill, stk, sw)
    t(X3 + 22, iy + 8, ph, F_CAPTION, tc_col)
    tr(X3 + C3W - 18, iy + 8, state, F_MICRO, TEXT2 if state != "Error" else TEMP)
    if state == "Focus":
        # cursor blink indicator
        draw.line([X3 + 22 + int(draw.textlength(ph, F_CAPTION)) + 2, iy + 6,
                   X3 + 22 + int(draw.textlength(ph, F_CAPTION)) + 2, iy + 22],
                  fill=TEAL, width=1)
    if state == "Error":
        t(X3 + 14, iy + 32, "↑ Required field", F_MICRO, TEMP)
        iy += 12
    iy += 36

cy = RA + ATOM_H + 20

# ── Row B: Badge | Tooltip | Spinner ─────────────────────────────────────────
RB = cy

# 4 · Badge
inner = card(X1, RB, C3W, ATOM_H, 4, "Badge")
analysis_badges = [
    ("Flood Risk",  FLOOD,    blend(FLOOD,   0.10, SURFACE)),
    ("Sun Path",    SUNPATH,  blend(SUNPATH, 0.10, SURFACE)),
    ("Temperature", TEMP,     blend(TEMP,    0.10, SURFACE)),
    ("Wind",        WIND,     blend(WIND,    0.10, SURFACE)),
    ("Rainfall",    RAINFALL, blend(RAINFALL,0.10, SURFACE)),
]
bx_cur = X1 + 14
by_cur = inner + 4
row_count = 0
for i, (label, fg, bg_col) in enumerate(analysis_badges):
    bw = int(draw.textlength(label, F_CAPTION)) + 20
    if bx_cur + bw > X1 + C3W - 14:
        bx_cur = X1 + 14
        by_cur += 28
        row_count += 1
    rrect(bx_cur, by_cur, bw, 20, 10, bg_col)
    tc(bx_cur + bw // 2, by_cur + 4, label, F_CAPTION, fg)
    bx_cur += bw + 8

# System status row
sys_y = by_cur + 32
sys_labels = [("Low", SUCCESS, blend(SUCCESS, 0.1, SURFACE)),
              ("Medium", WARNING, blend(WARNING, 0.1, SURFACE)),
              ("High", TEMP, blend(TEMP, 0.1, SURFACE))]
sys_x = X1 + 14
for lbl, fg, bg_col in sys_labels:
    bw = int(draw.textlength(lbl, F_CAPTION)) + 20
    rrect(sys_x, sys_y, bw, 20, 10, bg_col)
    tc(sys_x + bw // 2, sys_y + 4, lbl, F_CAPTION, fg)
    sys_x += bw + 8
t(sys_x + 4, sys_y + 4, "System status", F_MICRO, TEXT2)

# Dot badge (notification style)
dot_y = sys_y + 32
t(X1 + 14, dot_y + 4, "Notification dots:", F_MICRO, TEXT2)
for i, (_, color, _) in enumerate(analysis_badges[:4]):
    circle(X1 + 124 + i * 22, dot_y + 10, 6, color)

# 5 · Tooltip
inner = card(X2, RB, C3W, ATOM_H, 5, "Tooltip")
tt_cx2 = X2 + C3W // 2
tt_base_y = RB + ATOM_H // 2 + 14

# Target
rrect(tt_cx2 - 32, tt_base_y - 12, 64, 24, 4, blend(BORDER, 0.5), BORDER)
tc(tt_cx2, tt_base_y - 2, "target", F_MICRO, TEXT2)

# Top tooltip
ttw, tth = 100, 24
rrect(tt_cx2 - ttw // 2, inner + 8, ttw, tth, 4, TEXT)
tc(tt_cx2, inner + 14, "Sun angle: 45°", F_MICRO, TEXT_INV)
draw.polygon([tt_cx2 - 5, inner + tth + 8, tt_cx2 + 5, inner + tth + 8,
              tt_cx2, inner + tth + 15], fill=TEXT)
t(tt_cx2 - ttw // 2 - 26, inner + 14, "top", F_MICRO, TEXT2)

# Right tooltip (at target level)
rtt_x = tt_cx2 + 40
rrect(rtt_x, tt_base_y - tth // 2, ttw, tth, 4, TEXT)
tc(rtt_x + ttw // 2, tt_base_y - 4, "Flood zone B", F_MICRO, TEXT_INV)
draw.polygon([rtt_x - 7, tt_base_y - 5, rtt_x - 7, tt_base_y + 5,
              rtt_x, tt_base_y], fill=TEXT)
t(rtt_x + ttw + 4, tt_base_y - 4, "right", F_MICRO, TEXT2)

# Bottom tooltip
btt_y = tt_base_y + 24
rrect(tt_cx2 - ttw // 2, btt_y, ttw, tth, 4, TEXT)
draw.polygon([tt_cx2 - 5, btt_y - 7, tt_cx2 + 5, btt_y - 7,
              tt_cx2, btt_y], fill=TEXT)
tc(tt_cx2, btt_y + 6, "Wind: 14 km/h", F_MICRO, TEXT_INV)
t(tt_cx2 - ttw // 2 - 34, btt_y + 6, "bottom", F_MICRO, TEXT2)

# 6 · Spinner
inner = card(X3, RB, C3W, ATOM_H, 6, "Spinner")
spin_data = [(16, "sm"), (26, "md"), (40, "lg")]
sp_y = RB + ATOM_H // 2 + 12
sp_xs = [X3 + 50, X3 + 130, X3 + 240]
for (r, label), sp_x in zip(spin_data, sp_xs):
    circle(sp_x, sp_y, r, stroke=BORDER, sw=3)
    bbox = [sp_x - r, sp_y - r, sp_x + r, sp_y + r]
    draw.arc(bbox, start=-90, end=180, fill=TEAL, width=3)
    tc(sp_x, sp_y + r + 14, label, F_MICRO, TEXT2)

# Indeterminate label row
t(X3 + 14, RB + ATOM_H - 26, "All states: indeterminate progress", F_MICRO, TEXT2)

cy = RB + ATOM_H + 28

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2 — MAP-SPECIFIC
# ═════════════════════════════════════════════════════════════════════════════
cy = sec_header(cy, 2, "Map-Specific Components")
MAP_H2 = 210

XA = MARGIN
XB = MARGIN + C4W + GAP4
XC = MARGIN + 2 * (C4W + GAP4)
XD = MARGIN + 3 * (C4W + GAP4)

# 7 · MapPin
inner = card(XA, cy, C4W, MAP_H2, 7, "MapPin")
pin_data = [
    ("Active",   TEAL,  TEXT_INV, None),
    ("Inactive", TEXT2, TEXT_INV, None),
    ("Cluster",  BRAND, TEXT_INV, "3"),
]
pin_cx = XA + 38
pin_top = cy + MAP_H2 // 2
for label, fill, lc, num in pin_data:
    r = 14
    # Teardrop: half-circle top + triangle bottom
    circle(pin_cx, pin_top - r, r, fill)
    draw.polygon([pin_cx - r, pin_top - r,
                  pin_cx + r, pin_top - r,
                  pin_cx,     pin_top + r + 8], fill=fill)
    circle(pin_cx, pin_top - r, r, fill)   # re-fill overlap
    circle(pin_cx, pin_top - r, 5, blend(SURFACE, 0.7, fill) if fill != TEXT2 else blend(BG, 0.5, fill))
    if num:
        tc(pin_cx, pin_top - r - 5, num, F_BTN, lc)
    tc(pin_cx, pin_top + r + 16, label, F_MICRO, TEXT2)
    pin_cx += 68

# 8 · LayerToggle
inner = card(XB, cy, C4W, MAP_H2, 8, "LayerToggle")
lt_rows = [
    ("Flood Risk", FLOOD,   True,  False),
    ("Sun Path",   SUNPATH, True,  False),
    ("Wind",       WIND,    False, False),
    ("Rainfall",   RAINFALL,False, True),
]
lty = inner + 8
for name, color, is_on, disabled in lt_rows:
    dim = TEXT_DIS if disabled else TEXT
    track_col = TEAL if (is_on and not disabled) else (blend(BORDER, 0.5) if disabled else BORDER)
    rrect(XB + 12, lty + 3, 26, 14, 7, track_col)
    thumb_x = XB + 12 + (14 if is_on else 2)
    circle(thumb_x + 5, lty + 10, 5, SURFACE)
    dot_col = color if is_on and not disabled else TEXT_DIS
    circle(XB + 52, lty + 10, 4, dot_col)
    t(XB + 62, lty + 4, name, F_CAPTION, dim)
    if disabled:
        t(XB + C4W - 60, lty + 4, "disabled", F_MICRO, TEXT_DIS)
    lty += 36

# 9 · AnalysisBadge
inner = card(XC, cy, C4W, MAP_H2, 9, "AnalysisBadge")
ab_y = inner + 6
analysis_order = [
    ("Sun Path",    SUNPATH),
    ("Flood Risk",  FLOOD),
    ("Temperature", TEMP),
    ("Wind",        WIND),
    ("Rainfall",    RAINFALL),
]
for name, color in analysis_order:
    bw = C4W - 24
    rrect(XC + 12, ab_y, bw, 22, 5,
          blend(color, 0.08, SURFACE),
          blend(color, 0.35, SURFACE))
    circle(XC + 24, ab_y + 11, 4, color)
    t(XC + 34, ab_y + 6, name, F_CAPTION, color)
    tr(XC + 12 + bw - 8, ab_y + 6, "Active", F_MICRO, blend(color, 0.6, SURFACE))
    ab_y += 30

# 10 · ZoomControl
inner = card(XD, cy, C4W, MAP_H2, 10, "ZoomControl")
ZCW, ZCH = 36, 80
ZCX = XD + (C4W - ZCW) // 2
ZCY = cy + (MAP_H2 - ZCH) // 2 + 8
rrect(ZCX, ZCY, ZCW, ZCH, 6, SURFACE, BORDER)
tc(ZCX + ZCW // 2, ZCY + 8, "+", F_LG18, TEXT)
hline(ZCX + 6, ZCY + ZCH // 2, ZCW - 12, BORDER)
tc(ZCX + ZCW // 2, ZCY + ZCH // 2 + 8, "−", F_LG18, TEXT)
tc(XD + C4W // 2, ZCY + ZCH + 14, "In MapCanvas", F_MICRO, TEXT2)

cy = cy + MAP_H2 + 28

# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — LAYOUT SHELLS
# ═════════════════════════════════════════════════════════════════════════════
cy = sec_header(cy, 3, "Layout Shells")

# 11 · TopNav ──────────────────────────────────────────────────────────────────
t(MARGIN, cy, "11.  TopNav", F_COMP, TEXT)
cy += 18
TN_W = W - 2 * MARGIN
TN_H = 60
rrect(MARGIN, cy, TN_W, TN_H, 0, BRAND)

# Logo
t(MARGIN + 22, cy + 19, "SAT", font(16, bold=True), TEXT_INV)
circle(MARGIN + 56, cy + 30, 4, TEAL)

# Nav
nav_items = ["Dashboard", "Projects", "Analysis", "Reports"]
nx = MARGIN + 78
for item in nav_items:
    t(nx, cy + 21, item, F_NAV, blend(TEXT_INV, 0.65, BRAND))
    nx += int(draw.textlength(item, F_NAV)) + 28

# Active indicator on "Analysis"
# Find "Analysis" position: Dashboard(nx=78) + len + 28, Projects + 28, Analysis
a_start = MARGIN + 78
for item in nav_items[:2]:
    a_start += int(draw.textlength(item, F_NAV)) + 28
t(a_start, cy + 21, "Analysis", F_NAV, TEXT_INV)
hline(a_start, cy + TN_H - 3, int(draw.textlength("Analysis", F_NAV)), TEAL, 2)

# User avatar
circle(MARGIN + TN_W - 36, cy + 30, 16, TEAL)
tc(MARGIN + TN_W - 36, cy + 22, "TC", F_BTN, TEXT_INV)

tc(MARGIN + TN_W // 2, cy + TN_H + 10, "Single variant · 1 340 × 60", F_MICRO, TEXT2)
cy = cy + TN_H + 34

# 12 · SidePanel ───────────────────────────────────────────────────────────────
t(MARGIN, cy, "12.  SidePanel", F_COMP, TEXT)
cy += 18

EXP_X, EXP_Y = MARGIN, cy
EXP_W, EXP_H = 240, 420
rrect(EXP_X, EXP_Y, EXP_W, EXP_H, 8, SURFACE, BORDER)
HDR_H = 52
rrect(EXP_X, EXP_Y, EXP_W, HDR_H, 8, BRAND)
draw.rectangle([EXP_X, EXP_Y + HDR_H // 2, EXP_X + EXP_W, EXP_Y + HDR_H], fill=BRAND)
t(EXP_X + 16, EXP_Y + 17, "Layers", font(14, bold=True), TEXT_INV)
tr(EXP_X + EXP_W - 14, EXP_Y + 17, "‹", font(14, bold=True), TEXT_INV)
hline(EXP_X, EXP_Y + HDR_H, EXP_W, BORDER)
t(EXP_X + 16, EXP_Y + HDR_H + 14, "ANALYSIS LAYERS", F_MICRO, TEXT2)

layers = [("Flood Risk", FLOOD), ("Sun Path", SUNPATH), ("Temperature", TEMP),
          ("Wind", WIND), ("Rainfall", RAINFALL)]
ROW_Y = EXP_Y + HDR_H + 36
for name, color in layers:
    circle(EXP_X + 20, ROW_Y + 12, 4, color)
    t(EXP_X + 30, ROW_Y + 4, name, F_BODY, TEXT)
    circle(EXP_X + EXP_W - 20, ROW_Y + 12, 4, SUCCESS)
    ROW_Y += 30

hline(EXP_X, ROW_Y + 4, EXP_W, BORDER)
t(EXP_X + 16, ROW_Y + 16, "RESULTS", F_MICRO, TEXT2)
t(EXP_X + 16, ROW_Y + 34, "Site Score", F_BODY, TEXT)
tr(EXP_X + EXP_W - 16, ROW_Y + 34, "72 / 100", F_BODY_B, BRAND)
hline(EXP_X, ROW_Y + 56, EXP_W, BORDER)

score_rows = [("Flood", "Low", TEAL), ("Wind", "Medium", WARNING), ("Temp", "High", TEMP)]
sy2 = ROW_Y + 68
for sl, sv, sc in score_rows:
    t(EXP_X + 16, sy2, sl, F_BODY, TEXT2)
    tr(EXP_X + EXP_W - 16, sy2, sv, F_CAPTION, sc)
    sy2 += 22

hline(EXP_X, EXP_Y + EXP_H - 46, EXP_W, BORDER)
t(EXP_X + 16, EXP_Y + EXP_H - 32, "Export Report", F_CAPTION, BRAND)
tr(EXP_X + EXP_W - 16, EXP_Y + EXP_H - 32, "Clear  ×", F_CAPTION, TEXT2)
tc(EXP_X + EXP_W // 2, EXP_Y + EXP_H + 10, "Expanded", F_MICRO, TEXT2)

COL_X, COL_Y = EXP_X + EXP_W + 28, EXP_Y
COL_W, COL_H = 48, 420
rrect(COL_X, COL_Y, COL_W, COL_H, 8, SURFACE, BORDER)
tc(COL_X + COL_W // 2, COL_Y + 16, "›", font(14, bold=True), TEXT2)
for i, color in enumerate([FLOOD, SUNPATH, TEMP]):
    circle(COL_X + COL_W // 2, COL_Y + 72 + i * 28, 5, color)
tc(COL_X + COL_W // 2, COL_Y + COL_H + 10, "Collapsed", F_MICRO, TEXT2)
hline(EXP_X + EXP_W + 2, EXP_Y + EXP_H // 2, 26, TEXT_DIS)

cy = EXP_Y + EXP_H + 38

# 13 · MapCanvas ───────────────────────────────────────────────────────────────
t(MARGIN, cy, "13.  MapCanvas", F_COMP, TEXT)
cy += 18
MAP_X, MAP_Y_POS = MARGIN, cy
MAP_W2, MAP_H2_SHELL = W - 2 * MARGIN, 360

rrect(MAP_X, MAP_Y_POS, MAP_W2, MAP_H2_SHELL, 8, MAP_BG, BORDER)

GRID = 80
for gx in range(MAP_X, MAP_X + MAP_W2, GRID):
    draw.line([gx, MAP_Y_POS, gx, MAP_Y_POS + MAP_H2_SHELL], fill=blend(BRAND, 0.06), width=1)
for gy in range(MAP_Y_POS, MAP_Y_POS + MAP_H2_SHELL, GRID):
    draw.line([MAP_X, gy, MAP_X + MAP_W2, gy], fill=blend(BRAND, 0.06), width=1)

draw.line([MAP_X + 60, MAP_Y_POS + MAP_H2_SHELL // 2 + 20,
           MAP_X + MAP_W2 - 60, MAP_Y_POS + MAP_H2_SHELL // 2 + 20],
          fill=blend((255, 255, 255), 0.5, MAP_BG), width=3)
draw.line([MAP_X + 200, MAP_Y_POS + 70, MAP_X + 500, MAP_Y_POS + MAP_H2_SHELL - 60],
          fill=blend((255, 255, 255), 0.4, MAP_BG), width=2)
draw.line([MAP_X + MAP_W2 // 2 + 80, MAP_Y_POS + 20,
           MAP_X + MAP_W2 // 2 + 80, MAP_Y_POS + MAP_H2_SHELL - 20],
          fill=blend((255, 255, 255), 0.4, MAP_BG), width=2)

scx, scy = MAP_X + MAP_W2 // 2 - 60, MAP_Y_POS + MAP_H2_SHELL // 2 - 20
draw.polygon([scx, scy - 28, scx + 58, scy - 28, scx + 68, scy + 18, scx - 8, scy + 18],
             fill=blend(TEAL, 0.25, MAP_BG), outline=blend(TEAL, 0.6, MAP_BG))

LOC_W3 = 170
rrect(MAP_X + 16, MAP_Y_POS + 16, LOC_W3, 34, 6, SURFACE, BORDER)
circle(MAP_X + 30, MAP_Y_POS + 33, 5, BRAND)
t(MAP_X + 40, MAP_Y_POS + 24, "Pune, Maharashtra", F_BODY, TEXT)

ZCW3, ZCH3 = 36, 76
ZCX3 = MAP_X + MAP_W2 - ZCW3 - 16
ZCY3 = MAP_Y_POS + 16
rrect(ZCX3, ZCY3, ZCW3, ZCH3, 6, SURFACE, BORDER)
tc(ZCX3 + ZCW3 // 2, ZCY3 + 8, "+", F_LG18, TEXT)
hline(ZCX3 + 6, ZCY3 + ZCH3 // 2, ZCW3 - 12, BORDER)
tc(ZCX3 + ZCW3 // 2, ZCY3 + ZCH3 // 2 + 8, "−", F_LG18, TEXT)

ATTR_W3 = 140
rrect(MAP_X + MAP_W2 - ATTR_W3 - 16, MAP_Y_POS + MAP_H2_SHELL - 36, ATTR_W3, 24, 4, SURFACE, BORDER)
t(MAP_X + MAP_W2 - ATTR_W3 - 8, MAP_Y_POS + MAP_H2_SHELL - 28, "© OpenStreetMap", F_MICRO, TEXT2)

tc(MAP_X + MAP_W2 // 2, MAP_Y_POS + MAP_H2_SHELL + 10,
   "Single variant · 1 340 × 360", F_MICRO, TEXT2)
cy = MAP_Y_POS + MAP_H2_SHELL + 36

# 14 · DashboardPanel ──────────────────────────────────────────────────────────
t(MARGIN, cy, "14.  DashboardPanel", F_COMP, TEXT)
cy += 18

CARD_W, CARD_H = 360, 210
CARD_GAP = 40
CARDS_TOT = 3 * CARD_W + 2 * CARD_GAP
CARD_START_X = MARGIN + (W - 2 * MARGIN - CARDS_TOT) // 2
CARD_Y = cy

def dp_base(x, y):
    rrect(x, y, CARD_W, CARD_H, 8, SURFACE, BORDER)

def dp_header(x, y, label="Analysis Results"):
    t(x + 16, y + 14, label, font(13, bold=True), TEXT)
    hline(x, y + 38, CARD_W, BORDER)

# Default
DX = CARD_START_X
dp_base(DX, CARD_Y)
dp_header(DX, CARD_Y)
ry = CARD_Y + 48
for lbl, val, col in [("Flood Risk", "Low", TEAL), ("Sun Path", "Good", SUNPATH), ("Wind", "Medium", WARNING)]:
    t(DX + 16, ry, lbl, F_BODY, TEXT)
    tr(DX + CARD_W - 16, ry, val, F_BODY_B, col)
    ry += 26
t(DX + 16, CARD_Y + CARD_H - 28, "View full report  →", F_CAPTION, BRAND)
tc(DX + CARD_W // 2, CARD_Y + CARD_H + 10, "Default", F_MICRO, TEXT2)

# Empty
EX = DX + CARD_W + CARD_GAP
dp_base(EX, CARD_Y)
dp_header(EX, CARD_Y)
ec_cx2, ec_cy2 = EX + CARD_W // 2, CARD_Y + 110
R2 = 32
for i in range(18):
    a0 = 2 * math.pi * i / 18
    a1 = 2 * math.pi * (i + 0.55) / 18
    draw.line([ec_cx2 + R2 * math.cos(a0), ec_cy2 + R2 * math.sin(a0),
               ec_cx2 + R2 * math.cos(a1), ec_cy2 + R2 * math.sin(a1)],
              fill=BORDER, width=2)
tc(ec_cx2, CARD_Y + 150, "No analysis run yet", F_CAPTION, TEXT2)
BTN_W2, BTN_H2 = 116, 28
rrect(EX + (CARD_W - BTN_W2) // 2, CARD_Y + CARD_H - 44, BTN_W2, BTN_H2, 6, TEAL)
tc(EX + CARD_W // 2, CARD_Y + CARD_H - 36, "Run Analysis", F_CAPTION, TEXT_INV)
tc(EX + CARD_W // 2, CARD_Y + CARD_H + 10, "Empty", F_MICRO, TEXT2)

# Loading
LX = EX + CARD_W + CARD_GAP
dp_base(LX, CARD_Y)
dp_header(LX, CARD_Y)
sk_y = CARD_Y + 50
for pct in [0.80, 0.55, 0.70]:
    rrect(LX + 16, sk_y, int((CARD_W - 32) * pct), 12, 6, SKELETON)
    sk_y += 26
# Also skeleton footer bar
rrect(LX + 16, CARD_Y + CARD_H - 34, int((CARD_W - 32) * 0.40), 10, 5, SKELETON)
tc(LX + CARD_W // 2, CARD_Y + CARD_H + 10, "Loading", F_MICRO, TEXT2)

cy = CARD_Y + CARD_H + 50

# ─────────────────────────────────────────────────────────────────────────────
# FOOTER
# ─────────────────────────────────────────────────────────────────────────────
hline(MARGIN, cy, W - 2 * MARGIN, BORDER)
t(MARGIN, cy + 14, "SAT · Phase 4 · Step 17 · Complete Component Library Reference · 14 of 14", F_MICRO, TEXT2)
tr(W - MARGIN, cy + 14, "Geodetic Strata  ·  §1 Atoms  §2 Map-Specific  §3 Layout Shells", F_MICRO, TEXT2)

FINAL_H = cy + 44

# Crop and save
img.crop((0, 0, W, FINAL_H)).save(
    r"C:\Users\tanny\OneDrive\Desktop\Site\SAT\.claude\skills\canvas-design\SAT_All_Components.png",
    "PNG", dpi=(144, 144)
)
print(f"Saved: SAT_All_Components.png  ({W}×{FINAL_H})")
