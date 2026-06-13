// Solar arc diagram — seasonal sun path SVG + shadow table
// Rendered inside the expanded Sun Path module section

const SHADOW_DATA = [
  { season: "Summer",  am: "0.45×", noon: "0.18×", pm: "0.52×" },
  { season: "Equinox", am: "0.90×", noon: "0.36×", pm: "1.05×" },
  { season: "Winter",  am: "2.10×", noon: "0.85×", pm: "2.45×" },
];

export function SolarDiagram() {
  const thStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: "#64748B",
    textTransform: "uppercase", letterSpacing: "0.3px",
    padding: "5px 8px", textAlign: "left",
    borderBottom: "1px solid #E2E8F0",
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 11, color: "#0F172A",
    padding: "6px 8px", borderBottom: "1px solid #E2E8F0",
    fontFamily: "var(--font-geist-mono), monospace",
  };
  const tdLabelStyle: React.CSSProperties = {
    ...tdStyle,
    fontFamily: "inherit", color: "#64748B",
  };

  return (
    <>
      {/* Solar arc SVG */}
      <div style={{ background: "#F8F9FA", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: "#64748B",
          textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8,
        }}>
          Solar arc — seasonal paths
        </div>

        <svg viewBox="0 0 300 160" style={{ width: "100%", display: "block" }} aria-hidden>
          <defs>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#FEF9EE" />
              <stop offset="100%" stopColor="#FFF7D6" />
            </linearGradient>
          </defs>

          {/* Sky */}
          <rect width="300" height="140" fill="url(#skyGrad)" />
          {/* Ground */}
          <rect y="138" width="300" height="22" fill="#E8EEF2" rx="2" />
          <line x1="0" y1="138" x2="300" y2="138" stroke="#D1D9E0" strokeWidth="1.5" />

          {/* Compass labels */}
          <text x="8"   y="150" fontSize="8" fill="#94A3B8" fontFamily="inherit">E</text>
          <text x="146" y="150" fontSize="8" fill="#94A3B8" fontFamily="inherit" textAnchor="middle">S</text>
          <text x="288" y="150" fontSize="8" fill="#94A3B8" fontFamily="inherit">W</text>

          {/* Zenith guide lines */}
          <line x1="150" y1="138" x2="150" y2="14" stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="150" y1="138" x2="20"  y2="138" stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />

          {/* Summer solstice arc (highest) */}
          <path d="M 20 138 Q 150 14 280 138" stroke="#F59E0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Equinox arc (mid, dashed) */}
          <path d="M 45 138 Q 150 48 255 138" stroke="#D97706" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="5 3" />
          {/* Winter solstice arc (lowest) */}
          <path d="M 72 138 Q 150 82 228 138" stroke="#92400E" strokeWidth="1.5" fill="none" strokeLinecap="round" />

          {/* Altitude labels */}
          <text x="155" y="18" fontSize="7" fill="#D97706"
            fontFamily="var(--font-geist-mono), monospace">80°</text>
          <text x="155" y="52" fontSize="7" fill="#D97706"
            fontFamily="var(--font-geist-mono), monospace">55°</text>
          <text x="155" y="86" fontSize="7" fill="#92400E"
            fontFamily="var(--font-geist-mono), monospace">32°</text>

          {/* Current sun position */}
          <circle cx="205" cy="46" r="5" fill="#F59E0B" stroke="white" strokeWidth="1.5" />
          <text x="213" y="44" fontSize="7" fill="#92400E" fontFamily="inherit">Now</text>
        </svg>

        {/* Arc legend */}
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {[
            { color: "#F59E0B", dash: false, height: 3,   label: "Summer (Jun 21)" },
            { color: "#D97706", dash: true,  height: 2,   label: "Equinox"         },
            { color: "#92400E", dash: false, height: 1.5, label: "Winter (Dec 21)" },
          ].map(({ color, dash, height, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 14, height,
                background: dash ? "none" : color,
                borderRadius: 1,
                borderTop: dash ? `${height}px dashed ${color}` : "none",
              }} />
              <span style={{ fontSize: 10, color: "#64748B" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Shadow table */}
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.5px", color: "#64748B", marginBottom: 8,
      }}>
        Shadow length · ratio to building height
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={thStyle}>Season</th>
            <th style={thStyle}>9 am</th>
            <th style={thStyle}>Noon</th>
            <th style={thStyle}>3 pm</th>
          </tr>
        </thead>
        <tbody>
          {SHADOW_DATA.map((row, i) => (
            <tr key={row.season}>
              <td style={{ ...tdLabelStyle, borderBottom: i === SHADOW_DATA.length - 1 ? "none" : "1px solid #E2E8F0" }}>
                {row.season}
              </td>
              <td style={{ ...tdStyle, borderBottom: i === SHADOW_DATA.length - 1 ? "none" : "1px solid #E2E8F0" }}>{row.am}</td>
              <td style={{ ...tdStyle, borderBottom: i === SHADOW_DATA.length - 1 ? "none" : "1px solid #E2E8F0" }}>{row.noon}</td>
              <td style={{ ...tdStyle, borderBottom: i === SHADOW_DATA.length - 1 ? "none" : "1px solid #E2E8F0" }}>{row.pm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
