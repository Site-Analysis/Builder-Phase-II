/**
 * Feature flag registry.
 *
 * All flags default false. Enable per-environment via FLAGS env var:
 *   FLAGS=feature.temperature.thermal-profile,feature.wind.analysis
 *
 * Naming convention: feature.<domain>.<name>
 */

export type FeatureFlag =
  | "feature.temperature.thermal-profile"
  | "feature.flood.risk-analysis"
  | "feature.sunpath.diagram"
  | "feature.wind.analysis"
  | "feature.rainfall.archive"
  | "feature.rainfall.summary"
  | "feature.rainfall.climate-profile"
  | "feature.rainfall.anomaly"
  | "feature.rainfall.seasonality"
  | "feature.rainfall.site-analysis"
  | "feature.planning.road-width-resolver";

const enabled: Set<string> = new Set(
  (process.env.FLAGS ?? "").split(",").map((f) => f.trim()).filter(Boolean)
);

export function isEnabled(flag: FeatureFlag): boolean {
  return enabled.has(flag);
}

export function requireFlag(flag: FeatureFlag): void {
  if (!isEnabled(flag)) {
    throw new Error(`Feature flag disabled: ${flag}`);
  }
}
