# Start the cadastral service (port 8011) with data paths from the local clone.
# Usage: .\start.ps1 [--flags feature.cadastral.land-records,feature.cadastral.overlays]

$REPO = "C:\Users\tanny\chirag's cadestral\prime-karnataka-cadastral-viewer"

$env:CADASTRAL_REPO_ROOT = $REPO
$env:CADASTRAL_DATA_DIR  = "$REPO\data\cadastral_lake_v2"
$env:CADASTRAL_DB_PATH   = "$REPO\db\karnataka_lands_full.db"
$env:FLAGS               = "feature.cadastral.land-records,feature.cadastral.overlays"

$venv = "$PSScriptRoot\.venv\Scripts\uvicorn.exe"
& $venv app.main:app --host 0.0.0.0 --port 8011 --reload
