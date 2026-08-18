/**
 * Shared TypeScript types for the SkillGraph Worker.
 */

/** Cloudflare Worker environment bindings / secrets */
export interface Env {
  COGNODB_URI: string;
  COGNODB_USER: string;
  COGNODB_PASSWORD: string;
  ENVIRONMENT?: string;
}

export type Domain =
  | "Mathematics"
  | "Physics"
  | "Chemistry"
  | "Biology"
  | "Computer Science"
  | "Design";

export interface ConceptNode {
  id: string;
  name: string;
  description: string;
  domain: Domain;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface ResourceNode {
  id: string;
  title: string;
  url: string;
  type: "note" | "test" | "article" | "video" | "course";
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "REQUIRES" | "TEACHES";
}

export interface GraphOverviewResponse {
  nodes: Array<(ConceptNode & { label: "Concept" }) | (ResourceNode & { label: "Resource" })>;
  edges: GraphEdge[];
}

export interface ApiError {
  error: string;
  message: string;
}
