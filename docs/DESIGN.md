# DESIGN.md — UI design specification (binding)

Visual goal: enterprise security console (reference: Microsoft Sentinel, Splunk, Darktrace,
Grafana). A dense, calm instrument — no marketing look. Applies to the ENTIRE
dashboard, not just the setup wizard.

## Don'ts (hard)
- NO pure black (#000) + neon green as the default accent.
- No green metrics. No colorful/glowing card borders. No glow, gradient, shadow.
- No huge numbers (no 40px+). No rainbow accent colors (color only = meaning).
- Green ONLY for: wordmark, active nav item, primary button, focus ring. Nowhere else.

## Color tokens (define as CSS variables in :root)
Surfaces:  --bg-canvas #0b0f14 ; --bg-surface #12181f ; --bg-elevated #1a212b
Borders:   --border #232b35 ; --border-strong #2d3742 (hairline 0.5px)
Text:      --text #e6edf3 ; --text-muted #8b97a6 ; --text-hint #5c6773
Brand:     --accent #22c55e (sparingly)
Severity:  --sev-critical #f0563f ; --sev-high #f5a524 ; --sev-medium #3b82f6 ; --sev-low #6b7785
Chips:     bg = respective color @ ~14% alpha, text = lighter variant of the color.

## Typography
- Sans (system stack). ONLY two weights: 400 and 500. No 600/700.
- Type scale: label 12px, body 13–14px, KPI value 22px, panel title 13px/500, h2 16px.
- `font-variant-numeric: tabular-nums` for ALL metrics. Mono for counts, IDs, timestamps.
- Sentence case. No ALL-CAPS labels.

## Components
- KPI tile: bg-surface, 0.5px border, radius 8, padding ~14px. Label (12px muted) on top,
  value (22px/500 tabular), sub/trend (11px hint) below. NO colored top border.
- Card/panel: bg-surface, 0.5px border, radius 8. Header 13px/500 + optional meta on the right (muted).
- Table (main work surface for events): header 11px muted, rows 12.5px,
  row divider 0.5px (#1a212b), numbers/IDs tabular/mono. Sortable/filterable.
- Severity chip: small, radius 4, bg color@14%, text light color variant, weight 500.
- Buttons: primary = green fill (sparingly). Otherwise outline (0.5px border, transparent,
  hover bg-elevated). Radius 6–8.
- Charts: muted gridlines, one series, small axis labels, no glow/no neon fill.
- Radii generally 6–8px. Inner spacing 8/12/16px, vertical rhythm in rem.

## Layout
- Sidebar slightly darker than the canvas; group headers small/muted; active item with a green
  left indicator + bg-elevated.
- Topbar: breadcrumb (e.g. "Security · Overview") + global time range filter + user avatar.
- Dashboard order: KPI row (4) → event table (main area) → severity breakdown +
  top rules. Density over whitespace.

## Quality floor
- Responsive down to mobile, visible keyboard focus, `prefers-reduced-motion` respected.
- i18n: every new string in DE + EN, no raw keys.
