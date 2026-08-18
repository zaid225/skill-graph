import type { Domain } from "./api";

/** Consistent color coding for each concept domain across the graph canvas,
 * badges, and legend. Chosen for clear visual separation against the warm
 * amber theme background. */
export const DOMAIN_COLORS: Record<Domain, string> = {
  Mathematics: "#ea580c", // orange (theme primary)
  Physics: "#2563eb", // blue
  Chemistry: "#16a34a", // green
  Biology: "#db2777", // pink
  "Computer Science": "#7c3aed", // violet
  Design: "#0d9488", // teal
};

export const NODE_LABEL_COLORS: Record<"Concept" | "Resource", string> = {
  Concept: "#d97706",
  Resource: "#94a3b8",
};

export function domainColor(domain: Domain): string {
  return DOMAIN_COLORS[domain] ?? "#94a3b8";
}
