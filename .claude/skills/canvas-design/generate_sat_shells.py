"""
SAT Component Library — Layout Shells reference sheet
Design philosophy: Geodetic Strata
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

# ── Palette ────────────────────────────────────────────────────────────────
BRAND      = (26, 58, 92)
TEAL       = (46, 125, 111)
BG         = (248, 249, 250)
SURFACE    = (255, 255, 255)
BORDER     = (226, 232, 240)
TEXT       = (15, 23, 42)
TEXT2      = (100, 116, 139)
TEXT_INV   = (255, 255, 255)
TEXT_DIS   = (203, 213, 225)
SUNPATH    = (245, 158, 11)
FLOOD      = (37, 99, 235)
TEMP       = (239, 68, 68)
WIND       = (6, 182, 212)
RAINFALL   = (124, 58, 237)
SUCCESS    = (22, 163, 74)
WARNING    = (217, 119, 6)
SKELETON   = (241, 245, 249)

def rgba_blend(color, alpha, bg=BG):
    return tuple(int(c * alpha + b * (1 - alpha)) for c, b in zip(color, bg))

MAP_BG = rgba_blend(BRAND, 0.12)

# ── Fonts ───────────────────────────────────────────────────────────────────
FD = "C:/Windows/Fonts/"
def font(size, bold=False, light=False):
    try:
        if light:
            return ImageFont.truetype(FD + "segoeuil.ttf", size)
        if bold:
            return ImageFont.truetype(FD + "segoeuib.ttf", size)
        return ImageFont.truetype(FD + "segoeui.ttf", size)
    except Exception:
        return ImageFont.load_default()

F_TITLE   = font(32, bold=True)
F_SECTION = font(11)
F_LABEL   = font(22, bold=True)
F_SUB     = font(13)
F_SMALL   = font(11)
F_SEMIBOLD= font(14, bold=True)
F_BODY    = font(13)
F_BODY_B  = font(13, bold=True)
F_CAPTION = font(11)
F_NAV     = font(14)
F_NAV_B   = font(14, bold=True)
F_MICRO   = font(10)

# ── Canvas ──────────────────────────────────────────────────────────────────
W, H = 1500, 1720
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# ── Helpers ─────────────────────────────────────────────────────────────────
def rrect(x, y, w, h, r, fill=None, stroke=None, sw=1):
    """Rounded rectangle."""
    if fill:
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill)
    if stroke:
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, outline=stroke, width=sw)

def circle(cx, cy, r, fill=None, stroke=None, sw=1):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill, outline=stroke, width=sw)

def hline(x, y, w, color=BORDER, sw=1):
    draw.line([x, y, x+w, y], fill=color, width=sw)

def txt(x, y, s, f, color=TEXT, anchor="la"):
    draw.text((x, y), s, font=f, fill=color, anchor=anchor)

def txt_c(cx, y, s, f, color=TEXT):
    draw.text((cx, y), s, font=f, fill=color, anchor="ma")

def txt_r(rx, y, s, f, color=TEXT):
    draw.text((rx, y), s, font=f, fill=color, anchor="ra")

def section_header(x, y, label):
    """Component section header."""
    txt(x, y, label, F_LABEL, TEXT)
    hline(x, y + 34, W - 2*x, BORDER)

# ── Title ────────────────────────────────────────────────────────────────────
MARGIN = 80
txt(MARGIN, 56, "SAT", F_TITLE, BRAND)
# Dot accent
circle(MARGIN + 60, 72, 5, TEAL)
txt(MARGIN + 74, 56, "Component Library — Layout Shells", F_TITLE, TEXT)
txt(MARGIN, 98, "Phase 4 · Step 17 · Section 3 of 3", F_CAPTION, TEXT2)
hline(MARGIN, 124, W - 2*MARGIN, BORDER, 2)

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1 — SidePanel
# ═══════════════════════════════════════════════════════════════════════════
SEC1_Y = 148
section_header(MARGIN, SEC1_Y, "SidePanel")

# ── Expanded (240 × 480) ─────────────────────────────────────────────
EXP_X = MARGIN
EXP_Y = SEC1_Y + 50
EXP_W, EXP_H = 240, 420

rrect(EXP_X, EXP_Y, EXP_W, EXP_H, 8, SURFACE, BORDER)

# Header
HEADER_H = 52
rrect(EXP_X, EXP_Y, EXP_W, HEADER_H, 8, BRAND)
# Square off bottom corners of header
draw.rectangle([EXP_X, EXP_Y + HEADER_H//2, EXP_X + EXP_W, EXP_Y + HEADER_H], fill=BRAND)
txt(EXP_X + 16, EXP_Y + 17, "Layers", F_SEMIBOLD, TEXT_INV)
txt_r(EXP_X + EXP_W - 14, EXP_Y + 17, "‹", F_SEMIBOLD, TEXT_INV)

# Divider
hline(EXP_X, EXP_Y + HEADER_H, EXP_W, BORDER)

# Section label: ANALYSIS LAYERS
txt(EXP_X + 16, EXP_Y + HEADER_H + 14, "ANALYSIS LAYERS", F_MICRO, TEXT2)

# Layer rows
layers = [
    ("Flood Risk",   FLOOD),
    ("Sun Path",     SUNPATH),
    ("Temperature",  TEMP),
    ("Wind",         WIND),
    ("Rainfall",     RAINFALL),
]
ROW_Y = EXP_Y + HEADER_H + 36
for name, color in layers:
    dot_cx = EXP_X + 16 + 4
    dot_cy = ROW_Y + 12
    circle(dot_cx, dot_cy, 4, color)
    txt(EXP_X + 30, ROW_Y + 4, name, F_BODY, TEXT)
    circle(EXP_X + EXP_W - 20, dot_cy, 4, SUCCESS)
    ROW_Y += 30

# Divider
hline(EXP_X, ROW_Y + 4, EXP_W, BORDER)

# RESULTS section
txt(EXP_X + 16, ROW_Y + 16, "RESULTS", F_MICRO, TEXT2)
txt(EXP_X + 16, ROW_Y + 34, "Site Score", F_BODY, TEXT)
txt_r(EXP_X + EXP_W - 16, ROW_Y + 34, "72 / 100", F_BODY_B, BRAND)
hline(EXP_X, ROW_Y + 56, EXP_W, BORDER)

# Scores breakdown
score_rows = [("Flood", "Low", TEAL), ("Wind", "Medium", WARNING), ("Temp", "High", TEMP)]
sy2 = ROW_Y + 68
for sl, sv, sc in score_rows:
    txt(EXP_X + 16, sy2, sl, F_BODY, TEXT2)
    txt_r(EXP_X + EXP_W - 16, sy2, sv, F_CAPTION, sc)
    sy2 += 22

# Action links at bottom
hline(EXP_X, EXP_Y + EXP_H - 46, EXP_W, BORDER)
txt(EXP_X + 16, EXP_Y + EXP_H - 32, "Export Report", F_CAPTION, BRAND)
txt_r(EXP_X + EXP_W - 16, EXP_Y + EXP_H - 32, "Clear  ×", F_CAPTION, TEXT2)

# Variant label below
txt_c(EXP_X + EXP_W//2, EXP_Y + EXP_H + 10, "Expanded", F_CAPTION, TEXT2)

# ── Collapsed (48 × 480) ─────────────────────────────────────────────
COL_X = EXP_X + EXP_W + 28
COL_Y = EXP_Y
COL_W, COL_H = 48, 420

rrect(COL_X, COL_Y, COL_W, COL_H, 8, SURFACE, BORDER)

# Expand chevron
txt_c(COL_X + COL_W//2, COL_Y + 16, "›", F_SEMIBOLD, TEXT2)

# Colored dots
dots = [FLOOD, SUNPATH, TEMP]
dot_start_y = COL_Y + 72
for i, color in enumerate(dots):
    circle(COL_X + COL_W//2, dot_start_y + i * 28, 5, color)

# Variant label
txt_c(COL_X + COL_W//2, COL_Y + COL_H + 10, "Collapsed", F_CAPTION, TEXT2)

# Connector line between variants
conn_y = EXP_Y + EXP_H//2
hline(EXP_X + EXP_W + 2, conn_y, COL_X - EXP_X - EXP_W - 4, TEXT_DIS)

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2 — MapCanvas
# ═══════════════════════════════════════════════════════════════════════════
SEC2_Y = SEC1_Y + 50 + EXP_H + 70
section_header(MARGIN, SEC2_Y, "MapCanvas")

MAP_X  = MARGIN
MAP_Y  = SEC2_Y + 50
MAP_W  = W - 2*MARGIN
MAP_H  = 420

# Map base
rrect(MAP_X, MAP_Y, MAP_W, MAP_H, 8, MAP_BG, BORDER)

# Grid lines (tile suggestions)
GRID = 80
for gx in range(MAP_X, MAP_X + MAP_W, GRID):
    draw.line([gx, MAP_Y, gx, MAP_Y + MAP_H], fill=rgba_blend(BRAND, 0.06), width=1)
for gy in range(MAP_Y, MAP_Y + MAP_H, GRID):
    draw.line([MAP_X, gy, MAP_X + MAP_W, gy], fill=rgba_blend(BRAND, 0.06), width=1)

# Subtle road/path lines (suggests real map content)
# Horizontal "road"
road_y = MAP_Y + MAP_H // 2 + 20
draw.line([MAP_X + 60, road_y, MAP_X + MAP_W - 60, road_y],
          fill=rgba_blend((255,255,255), 0.5, MAP_BG), width=3)
# Diagonal
draw.line([MAP_X + 200, MAP_Y + 80, MAP_X + 500, MAP_Y + MAP_H - 80],
          fill=rgba_blend((255,255,255), 0.4, MAP_BG), width=2)
# Another road
draw.line([MAP_X + MAP_W//2 + 80, MAP_Y + 20, MAP_X + MAP_W//2 + 80, MAP_Y + MAP_H - 20],
          fill=rgba_blend((255,255,255), 0.4, MAP_BG), width=2)

# Site polygon (subtle building footprint at center)
cx, cy = MAP_X + MAP_W//2 - 60, MAP_Y + MAP_H//2 - 20
draw.polygon([cx, cy-30, cx+60, cy-30, cx+70, cy+20, cx-10, cy+20],
             fill=rgba_blend(TEAL, 0.25, MAP_BG),
             outline=rgba_blend(TEAL, 0.6, MAP_BG))

# Top-left: Location card
LOC_X, LOC_Y, LOC_W, LOC_H = MAP_X + 16, MAP_Y + 16, 172, 36
rrect(LOC_X, LOC_Y, LOC_W, LOC_H, 6, SURFACE, BORDER)
circle(LOC_X + 14, LOC_Y + 18, 5, BRAND)
txt(LOC_X + 24, LOC_Y + 10, "Pune, Maharashtra", F_BODY, TEXT)

# Top-right: Zoom controls
ZC_W, ZC_H = 36, 76
ZC_X = MAP_X + MAP_W - ZC_W - 16
ZC_Y = MAP_Y + 16
rrect(ZC_X, ZC_Y, ZC_W, ZC_H, 6, SURFACE, BORDER)
txt_c(ZC_X + ZC_W//2, ZC_Y + 8, "+", F_SEMIBOLD, TEXT)
hline(ZC_X + 6, ZC_Y + ZC_H//2, ZC_W - 12, BORDER)
txt_c(ZC_X + ZC_W//2, ZC_Y + ZC_H//2 + 8, "−", F_SEMIBOLD, TEXT)

# Bottom-right: Attribution
ATTR_W, ATTR_H = 140, 24
ATTR_X = MAP_X + MAP_W - ATTR_W - 16
ATTR_Y = MAP_Y + MAP_H - ATTR_H - 12
rrect(ATTR_X, ATTR_Y, ATTR_W, ATTR_H, 4, SURFACE, BORDER)
txt(ATTR_X + 8, ATTR_Y + 5, "© OpenStreetMap", F_MICRO, TEXT2)

# Single variant label
txt_c(MAP_X + MAP_W//2, MAP_Y + MAP_H + 10, "Single variant · 1 340 × 420", F_CAPTION, TEXT2)

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3 — DashboardPanel
# ═══════════════════════════════════════════════════════════════════════════
SEC3_Y = SEC2_Y + 50 + MAP_H + 70
section_header(MARGIN, SEC3_Y, "DashboardPanel")

CARD_W, CARD_H = 360, 220
CARD_GAP       = 40
CARDS_TOTAL    = 3 * CARD_W + 2 * CARD_GAP
CARD_START_X   = MARGIN + (W - 2*MARGIN - CARDS_TOTAL) // 2
CARD_Y         = SEC3_Y + 50

def card_base(x, y):
    rrect(x, y, CARD_W, CARD_H, 8, SURFACE, BORDER)

def card_header(x, y, label="Analysis Results"):
    txt(x + 16, y + 16, label, F_SEMIBOLD, TEXT)
    hline(x, y + 42, CARD_W, BORDER)

# ── Default ───────────────────────────────────────────────────────────
D_X = CARD_START_X
card_base(D_X, CARD_Y)
card_header(D_X, CARD_Y)

rows = [
    ("Flood Risk", "Low",    TEAL),
    ("Sun Path",   "Good",   SUNPATH),
    ("Wind",       "Medium", WARNING),
]
ry = CARD_Y + 52
for lbl, val, col in rows:
    txt(D_X + 16, ry, lbl, F_BODY, TEXT)
    txt_r(D_X + CARD_W - 16, ry, val, F_BODY_B, col)
    ry += 28

# Link
txt(D_X + 16, CARD_Y + CARD_H - 30, "View full report  →", F_CAPTION, BRAND)

# Variant label
txt_c(D_X + CARD_W//2, CARD_Y + CARD_H + 10, "Default", F_CAPTION, TEXT2)

# ── Empty ─────────────────────────────────────────────────────────────
E_X = D_X + CARD_W + CARD_GAP
card_base(E_X, CARD_Y)
card_header(E_X, CARD_Y)

# Dashed circle placeholder
ec_cx = E_X + CARD_W // 2
ec_cy = CARD_Y + 115
R = 36
N_DASHES = 20
for i in range(N_DASHES):
    a0 = 2 * math.pi * i / N_DASHES
    a1 = 2 * math.pi * (i + 0.55) / N_DASHES
    x0 = ec_cx + R * math.cos(a0)
    y0 = ec_cy + R * math.sin(a0)
    x1 = ec_cx + R * math.cos(a1)
    y1 = ec_cy + R * math.sin(a1)
    draw.line([x0, y0, x1, y1], fill=BORDER, width=2)

txt_c(ec_cx, CARD_Y + 160, "No analysis run yet", F_CAPTION, TEXT2)

# Button
BTN_W, BTN_H = 120, 30
BTN_X = E_X + (CARD_W - BTN_W) // 2
BTN_Y = CARD_Y + CARD_H - 46
rrect(BTN_X, BTN_Y, BTN_W, BTN_H, 6, TEAL)
txt_c(BTN_X + BTN_W//2, BTN_Y + 8, "Run Analysis", F_CAPTION, TEXT_INV)

txt_c(E_X + CARD_W//2, CARD_Y + CARD_H + 10, "Empty", F_CAPTION, TEXT2)

# ── Loading ───────────────────────────────────────────────────────────
L_X = E_X + CARD_W + CARD_GAP
card_base(L_X, CARD_Y)
card_header(L_X, CARD_Y)

SKEL_WIDTHS = [0.80, 0.58, 0.70]
SKEL_X = L_X + 16
sy = CARD_Y + 58
for pct in SKEL_WIDTHS:
    sw = int((CARD_W - 32) * pct)
    rrect(SKEL_X, sy, sw, 12, 6, SKELETON)
    sy += 28

txt_c(L_X + CARD_W//2, CARD_Y + CARD_H + 10, "Loading", F_CAPTION, TEXT2)

# ═══════════════════════════════════════════════════════════════════════════
# Footer
# ═══════════════════════════════════════════════════════════════════════════
FOOT_Y = CARD_Y + CARD_H + 50
hline(MARGIN, FOOT_Y, W - 2*MARGIN, BORDER)
txt(MARGIN, FOOT_Y + 14, "SAT · Phase 4 · Component Library Reference · Layout Shells", F_MICRO, TEXT2)
txt_r(W - MARGIN, FOOT_Y + 14, "Geodetic Strata  ·  Components 11–14 of 14", F_MICRO, TEXT2)

# ═══════════════════════════════════════════════════════════════════════════
# Second pass — refinements
# ═══════════════════════════════════════════════════════════════════════════

# Tighten title rule
hline(MARGIN, 126, W - 2*MARGIN, BRAND, 1)

# Section accent dots
for sy_pos in [SEC1_Y + 6, SEC2_Y + 6, SEC3_Y + 6]:
    circle(MARGIN - 16, sy_pos + 10, 3, TEAL)

# Pin variant count badges on SidePanel
badge_x = COL_X + COL_W + 20
badge_y = COL_Y + 20
rrect(badge_x, badge_y, 52, 24, 12, TEAL)
txt_c(badge_x + 26, badge_y + 6, "2 var", F_MICRO, TEXT_INV)

# Pin variant count on MapCanvas
mc_badge_x = MAP_X + MAP_W - 62
mc_badge_y = MAP_Y + MAP_H - 38
rrect(mc_badge_x, mc_badge_y, 52, 24, 12, TEAL)
txt_c(mc_badge_x + 26, mc_badge_y + 6, "1 var", F_MICRO, TEXT_INV)

# Pin variant count on Dashboard section
dp_badge_x = W - MARGIN - 62
dp_badge_y = SEC3_Y + 4
rrect(dp_badge_x, dp_badge_y, 62, 24, 12, TEAL)
txt_c(dp_badge_x + 31, dp_badge_y + 6, "3 var", F_MICRO, TEXT_INV)

# ── Save ─────────────────────────────────────────────────────────────────────
OUT = r"C:\Users\tanny\OneDrive\Desktop\Site\SAT\.claude\skills\canvas-design\SAT_Layout_Shells.png"
img.save(OUT, "PNG", dpi=(144, 144))
print(f"Saved: {OUT}  ({W}×{H})")
