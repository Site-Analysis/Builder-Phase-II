import { cn } from "@/lib/utils";

export interface SiteLabelProps {
  projectName: string;
  coordinates: string;
  area: string;
  date: string;
  className?: string;
}

export function SiteLabel({
  projectName,
  coordinates,
  area,
  date,
  className,
}: SiteLabelProps) {
  return (
    <div
      className={cn(
        "absolute bottom-4 left-4 z-[400]",
        "rounded border border-neutral-border bg-neutral-surface/90 px-3 py-2",
        "backdrop-blur-sm shadow-sm",
        className
      )}
      aria-label={`${projectName} — ${coordinates} — ${area} — ${date}`}
    >
      <p className="text-sm font-semibold text-text-primary leading-tight">
        {projectName}
      </p>
      <p className="text-xs text-text-secondary mt-0.5">{coordinates}</p>
      <p className="text-xs text-text-secondary">{area} · {date}</p>
    </div>
  );
}
