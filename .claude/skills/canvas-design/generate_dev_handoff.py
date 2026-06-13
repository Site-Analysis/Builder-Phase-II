"""
SAT Dev Handoff Reference — Phase 8
Design philosophy: Meridian Logic
"""
from PIL import Image, ImageDraw, ImageFont
import os

# ── Palette ───────────────────────────────────────────────────────────────────
TEAL      = (46,  125, 111)   # #2E7D6F — brand secondary
TEAL_DK   = (30,   95,  82)   # darker teal for text
TEAL_LT   = (234, 242, 241)   # #EAF2F1 — tint
BG        = (248, 249, 250)   # --color-neutral-bg
SURFACE   = (255, 255, 255)
BORDER    = (220, 226, 234)
TEXT      = (15,  23,  42)    # near-black
TEXT2     = (100, 116, 139)   # secondary
ROW_ALT   = (244, 246, 250)
AMBER     = (161,  90,   8)
AMB_LT    = (255, 244, 218)
GREEN     = ( 21, 128,  61)
GRN_LT    = (220, 248, 230)
BLUE      = ( 37,  99, 235)
BLU_LT    = (219, 234, 254)
NEU_LT    = (238, 241, 245)

# ── Fonts ─────────────────────────────────────────────────────────────────────
FD = "C:/Windows/Fonts/"

def _f(fname, size):
    try:    return ImageFont.truetype(FD + fname, size)
    except: return ImageFont.load_default()

def mono(size):
    for f in ['consola.ttf', 'lucon.ttf', 'couri.ttf', 'cour.ttf']:
        try: return ImageFont.truetype(FD + f, size)
        except: pass
    return ImageFont.load_default()

F_LOGO  = _f('segoeuib.ttf', 26)
F_SUBT  = _f('segoeuil.ttf', 14)
F_META  = _f('segoeuil.ttf', 12)
F_SEC   = _f('segoeuib.ttf', 12)   # section header text
F_CHDR  = _f('segoeuib.ttf', 10)   # table column header
F_BOLD  = _f('segoeuib.ttf', 10)   # component name
F_REG   = _f('segoeui.ttf',  10)   # body text
F_MONO  = mono(9)                  # monospace (tokens, routes, css vars)
F_LITE  = _f('segoeuil.ttf',  9)   # secondary detail
F_GRP   = _f('segoeuib.ttf',  8)   # group label
F_TAG   = _f('segoeuib.ttf',  9)   # open question tag
F_FTR   = _f('segoeuil.ttf',  9)   # footer

def tw(text, fnt):
    try:
        bb = fnt.getbbox(str(text))
        return bb[2] - bb[0]
    except:
        return len(str(text)) * 6

def trunc(text, fnt, max_w):
    text = str(text)
    if tw(text, fnt) <= max_w:
        return text
    while len(text) > 1 and tw(text + '…', fnt) > max_w:
        text = text[:-1]
    return text + '…'

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H = 1920, 1600
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

MG   = 72          # margin
PAD  = 10          # cell inner padding
C1X  = MG          # left column x
C1W  = 800         # left column width
GAP  = 48          # column gap
C2X  = C1X + C1W + GAP   # right column x = 920
C2W  = W - C2X - MG      # right column width = 928

# ── Drawing helpers ───────────────────────────────────────────────────────────
def filled_rect(x, y, w, h, fill, r=3):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill)

def outlined_rect(x, y, w, h, outline, width=1, r=3):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=outline, width=width)

def hline(x1, x2, y, color=BORDER, width=1):
    draw.line([(x1, y), (x2, y)], fill=color, width=width)

def vline(x, y1, y2, color=BORDER, width=1):
    draw.line([(x, y1), (x, y2)], fill=color, width=width)

def t(x, y, text, fnt, color=TEXT):
    draw.text((x, y), str(text), font=fnt, fill=color)

def sec_hdr(x, y, label, w):
    """Teal section header bar"""
    filled_rect(x, y, w, 30, TEAL, r=4)
    t(x + PAD + 2, y + 8, label, F_SEC, SURFACE)
    return y + 38

def col_hdr(x, y, labels, col_ws, total_w):
    """Grey table column header row"""
    filled_rect(x, y, total_w, 20, (230, 234, 240), r=2)
    cx = x + PAD
    for lbl, cw in zip(labels, col_ws):
        t(cx, y + 4, lbl, F_CHDR, TEXT2)
        cx += cw
    hline(x, x + total_w, y + 20, BORDER)
    return y + 22

def row(x, y, vals, col_ws, fonts, h=21, alt=False, total_w=None):
    """Single table data row"""
    tw_total = total_w or sum(col_ws)
    if alt:
        filled_rect(x, y, tw_total, h, ROW_ALT, r=0)
    cx = x + PAD
    for val, cw, fnt in zip(vals, col_ws, fonts):
        t(cx, y + 5, trunc(val, fnt, cw - PAD * 2), fnt, TEXT)
        cx += cw
    hline(x, x + tw_total, y + h, BORDER)
    return y + h

def grp_lbl(x, y, label, w):
    """Cartographic group separator: teal rule with label"""
    hline(x, x + w, y + 9, TEAL_LT, 1)
    lw = tw(label, F_GRP) + 10
    filled_rect(x, y + 2, lw, 15, BG, r=0)   # white cover over line
    t(x + 5, y + 4, label, F_GRP, TEAL_DK)
    return y + 20

# ── HEADER ────────────────────────────────────────────────────────────────────
y_hdr = 40
t(MG, y_hdr, "SAT", F_LOGO, TEAL)
sat_w = tw("SAT", F_LOGO)
t(MG + sat_w + 14, y_hdr + 6, "Site Analysis Tool", F_SUBT, TEXT2)

meta = "Dev Handoff  —  Phase 8  —  2026-06-12"
t(W - MG - tw(meta, F_META), y_hdr + 8, meta, F_META, TEXT2)

y_rule = y_hdr + 42
hline(MG, W - MG, y_rule, TEAL, 2)
Y0 = y_rule + 20   # both columns start here

# Thin vertical meridian between columns
MERIDIAN_X = C1X + C1W + GAP // 2

# ── LEFT COLUMN — SECTION 01: TOKEN REFERENCE ─────────────────────────────────
y1 = sec_hdr(C1X, Y0, "01 — TOKEN REFERENCE", C1W)

usable1 = C1W - PAD * 2
TC = [int(usable1 * r) for r in [0.38, 0.38, 0.24]]

y1 = col_hdr(C1X, y1, ['Figma Variable', 'CSS Custom Property', 'Tailwind Key'], TC, C1W)
tbl1_start = y1

tokens = [
    # (group_label | None, figma_var, css_prop, tw_key)
    ('Brand',    'color/brand/primary',          '--color-brand-primary',          'colors.brand.primary'),
    (None,       'color/brand/secondary',        '--color-brand-secondary',        'colors.brand.secondary'),
    (None,       'color/brand/secondary-tint',   '--color-brand-secondary-tint',   'colors.brand.secondaryTint'),
    ('Neutral',  'color/neutral/bg',             '--color-neutral-bg',             'colors.neutral.bg'),
    (None,       'color/neutral/surface',        '--color-neutral-surface',        'colors.neutral.surface'),
    (None,       'color/neutral/border',         '--color-neutral-border',         'colors.neutral.border'),
    (None,       'color/neutral/text/primary',   '--color-text-primary',           'colors.text.primary'),
    (None,       'color/neutral/text/secondary', '--color-text-secondary',         'colors.text.secondary'),
    (None,       'color/neutral/text/disabled',  '--color-text-disabled',          'colors.text.disabled'),
    ('Semantic', 'color/semantic/success',       '--color-semantic-success',       'colors.semantic.success'),
    (None,       'color/semantic/success-bg',    '--color-semantic-success-bg',    'colors.semantic.successBg'),
    (None,       'color/semantic/warning',       '--color-semantic-warning',       'colors.semantic.warning'),
    (None,       'color/semantic/warning-bg',    '--color-semantic-warning-bg',    'colors.semantic.warningBg'),
    (None,       'color/semantic/error',         '--color-semantic-error',         'colors.semantic.error'),
    (None,       'color/semantic/error-bg',      '--color-semantic-error-bg',      'colors.semantic.errorBg'),
    (None,       'color/semantic/info',          '--color-semantic-info',          'colors.semantic.info'),
    ('Analysis', 'color/analysis/flood',         '--color-analysis-flood',         'colors.analysis.flood'),
    (None,       'color/analysis/sunpath',       '--color-analysis-sunpath',       'colors.analysis.sunpath'),
    (None,       'color/analysis/wind',          '--color-analysis-wind',          'colors.analysis.wind'),
    (None,       'color/analysis/temperature',   '--color-analysis-temperature',   'colors.analysis.temperature'),
    (None,       'color/analysis/rainfall',      '--color-analysis-rainfall',      'colors.analysis.rainfall'),
    ('Spacing',  'spacing/xs',                   '--spacing-xs',                   'spacing.xs'),
    (None,       'spacing/sm',                   '--spacing-sm',                   'spacing.sm'),
    (None,       'spacing/md',                   '--spacing-md',                   'spacing.md'),
    (None,       'spacing/lg',                   '--spacing-lg',                   'spacing.lg'),
]

for i, (grp, fig, css, twk) in enumerate(tokens):
    if grp:
        y1 = grp_lbl(C1X, y1, grp.upper(), C1W)
    y1 = row(C1X, y1, [fig, css, twk], TC,
             [F_MONO, F_MONO, F_MONO], h=21, alt=(i % 2 == 0), total_w=C1W)

outlined_rect(C1X, tbl1_start, C1W, y1 - tbl1_start, BORDER, width=1, r=2)
y1_final = y1

# ── RIGHT COLUMN — SECTION 02: COMPONENT REGISTRY ────────────────────────────
y2 = sec_hdr(C2X, Y0, "02 — COMPONENT REGISTRY", C2W)

usable2 = C2W - PAD * 2
CC = [int(usable2 * r) for r in [0.17, 0.20, 0.36, 0.27]]

y2 = col_hdr(C2X, y2, ['Component', 'Figma Path', 'Variants', 'Props'], CC, C2W)
tbl2_start = y2

components = [
    ('Atoms',    'Button',                'Atoms/Button',                'primary/secondary/ghost/danger × sm/md/lg × 5 states', 'variant, size, disabled, loading, onClick'),
    (None,       'Input',                 'Atoms/Input',                 'default/focus/error/disabled × md/lg',                 'placeholder, value, state, errorMessage, onChange'),
    (None,       'StatusBadge',           'Atoms/StatusBadge',           'complete/needs-review/high/moderate/low/none',          'severity, label'),
    (None,       'ScoreCircle',           'Atoms/ScoreCircle',           'sm/md/lg × high/moderate/low/none',                    'score (0–100), size, severity'),
    (None,       'Toggle',               'Atoms/Toggle',                'on / off / disabled',                                  'checked, disabled, label, onChange'),
    (None,       'Checkbox',             'Atoms/Checkbox',              'unchecked/checked/indeterminate/disabled',              'checked, indeterminate, disabled, label'),
    ('Map',      'MapContainer',          'Map/MapContainer',            'full-screen / split',                                  'mode, children'),
    (None,       'SiteBoundaryOverlay',   'Map/SiteBoundaryOverlay',     'circle / polygon',                                     'shape, coordinates'),
    (None,       'SiteLabel',             'Map/SiteLabel',               'single style',                                         'projectName, coordinates, area, date'),
    (None,       'ZoomControls',          'Map/ZoomControls',            'single style',                                         'onZoomIn, onZoomOut'),
    ('Layout',   'TopNav',                'Layout/TopNav',               'dashboard / analysis / new-analysis',                  'context, breadcrumbs, userAvatarUrl'),
    (None,       'RightPanel',            'Layout/RightPanel',           'loading / populated / collapsed',                      'state, overallScore, moduleProgress, children'),
    (None,       'AnalysisModuleSection', 'Layout/AnalysisModuleSection','expanded × severity',                                  'moduleName, severity, score, indicators, onToggle'),
    (None,       'ExportDrawer',          'Layout/ExportDrawer',         'loading / ready / generating',                         'state, modules, settings, onGenerate, onCancel'),
]

for i, (grp, name, path, variants, props) in enumerate(components):
    if grp:
        y2 = grp_lbl(C2X, y2, grp.upper(), C2W)
    y2 = row(C2X, y2, [name, path, variants, props], CC,
             [F_BOLD, F_MONO, F_LITE, F_LITE], h=22, alt=(i % 2 == 0), total_w=C2W)

outlined_rect(C2X, tbl2_start, C2W, y2 - tbl2_start, BORDER, width=1, r=2)
y2 += 20

# ── SECTION 03: SCREEN DIRECTORY ──────────────────────────────────────────────
y2 = sec_hdr(C2X, y2, "03 — SCREEN DIRECTORY", C2W)

SC = [int(usable2 * r) for r in [0.14, 0.21, 0.38, 0.27]]
y2 = col_hdr(C2X, y2, ['Screen', 'Route', 'Key Components', 'Unconfirmed Endpoints'], SC, C2W)
tbl3_start = y2

screens = [
    ('Login',         '/login',                 'Button(primary/ghost), Input(lg)',                                         'none — Supabase Auth'),
    ('Dashboard',     '/dashboard',             'TopNav, StatusBadge, Button',                                              '/api/projects, /api/projects/stats'),
    ('New Analysis',  '/project/new',           'MapContainer(full), Input(lg), SiteBoundaryOverlay',                       '/api/geo/site-boundary, /api/projects'),
    ('Main Analysis', '/project/[id]',          'MapContainer(split), RightPanel, AnalysisModuleSection×5, ScoreCircle(lg)', '/api/projects/:id + 5 endpoints'),
    ('Export',        '/project/[id]?export=…', 'ExportDrawer, Checkbox×5, Toggle×5',                                       '/api/projects/:id/export'),
    ('Settings',      '/settings',              'Input(md), Toggle',                                                         'none — Supabase Auth'),
]

for i, scr_row in enumerate(screens):
    y2 = row(C2X, y2, list(scr_row), SC,
             [F_BOLD, F_MONO, F_LITE, F_MONO], h=21, alt=(i % 2 == 0), total_w=C2W)

outlined_rect(C2X, tbl3_start, C2W, y2 - tbl3_start, BORDER, width=1, r=2)
y2 += 20

# ── SECTION 04: OPEN QUESTIONS ────────────────────────────────────────────────
y2 = sec_hdr(C2X, y2, "04 — OPEN QUESTIONS", C2W)

questions = [
    ('[UNCONFIRMED]', AMBER, AMB_LT,
     '/api/projects/:id/score + 5 module endpoints — Chirag to confirm against contracts/*.yaml'),
    ('[UNCONFIRMED]', AMBER, AMB_LT,
     'Export endpoint: download_url response vs streaming PDF blob — Chirag to confirm'),
    ('[UNCONFIRMED]', AMBER, AMB_LT,
     '/api/geo/site-boundary — endpoint exists or client-side geocoding?'),
    ('[RESOLVED]',    GREEN, GRN_LT,
     '--color-brand-secondary-tint → #EAF2F1 (10% tint of #2E7D6F) — canonical value'),
    ('[ANIMATION]',   BLUE,  BLU_LT,
     'AnalysisModuleSection expand/collapse — CSS transitions only? Confirm no framer-motion'),
    ('[SCOPE]',       TEXT2, NEU_LT,
     'All screens at 1280–1440px. 768px breakpoint deferred post-Beta'),
]

tbl4_start = y2
for i, (tag, tag_col, tag_bg, note) in enumerate(questions):
    row_h = 24
    # Row background
    if i % 2 == 0:
        filled_rect(C2X, y2, C2W, row_h, ROW_ALT, r=0)
    # Coloured left bar
    filled_rect(C2X, y2, 4, row_h, tag_col, r=0)
    # Tag pill
    tag_pill_w = tw(tag, F_TAG) + 14
    filled_rect(C2X + 12, y2 + 5, tag_pill_w, 15, tag_bg, r=3)
    t(C2X + 12 + 7, y2 + 7, tag, F_TAG, tag_col)
    # Note text
    note_x = C2X + 12 + tag_pill_w + 10
    avail = C2W - (note_x - C2X) - PAD
    t(note_x, y2 + 7, trunc(note, F_REG, avail), F_REG, TEXT)
    hline(C2X, C2X + C2W, y2 + row_h, BORDER)
    y2 += row_h

outlined_rect(C2X, tbl4_start, C2W, y2 - tbl4_start, BORDER, width=1, r=2)
y2_final = y2

# ── Vertical meridian (drawn after content so we know the height) ─────────────
content_bottom = max(y1_final, y2_final)
vline(MERIDIAN_X, Y0, content_bottom + 8, TEAL_LT, 1)

# ── FOOTER ────────────────────────────────────────────────────────────────────
y_foot = content_bottom + 30
hline(MG, W - MG, y_foot, TEAL, 1)
y_foot += 12

foot_l = "Site Analysis Tool  ·  Design Freeze 2026-06-11  ·  Awaiting BE endpoint confirmation (Chirag)"
foot_r = "Phase 8 of 10  ·  UX Research → Code"
t(MG, y_foot, foot_l, F_FTR, TEXT2)
t(W - MG - tw(foot_r, F_FTR), y_foot, foot_r, F_FTR, TEXT2)

# ── Crop & save ───────────────────────────────────────────────────────────────
final_h = y_foot + 36
out = img.crop((0, 0, W, final_h))

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'SAT_Dev_Handoff_Phase8.png')
out.save(out_path, 'PNG', dpi=(150, 150))
print(f"Saved: {out_path}  ({W} × {final_h} px)")
