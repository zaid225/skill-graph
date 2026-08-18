/**
 * Typed API client for the SkillGraph Hono backend.
 *
 * All requests go through `request()`, which normalizes the backend's
 * structured error shape ({ error, message }) into a thrown ApiError so
 * components can branch on `err.code === "DATABASE_UNAVAILABLE"` to render
 * the connection banner instead of a generic error state.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type Domain = "Mathematics" | "Physics" | "Chemistry" | "Biology" | "Computer Science" | "Design";

export interface Concept {
  id: string;
  name: string;
  description: string;
  domain: Domain;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface Resource {
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

export type GraphNode = (Concept & { label: "Concept" }) | (Resource & { label: "Resource" });

export interface GraphOverview {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PrerequisiteEntry extends Concept {
  hopDistance: number;
}

export interface LearningPathStep {
  concept: Concept;
  hop: number;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`);
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the SkillGraph API. Is the backend running?", 0);
  }

  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(body.error ?? "UNKNOWN_ERROR", body.message ?? res.statusText, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: "connected" | "disconnected"; message?: string }>("/api/health"),

  graphOverview: () => request<GraphOverview>("/api/graph/overview"),

  listConcepts: (params?: { domain?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.domain) qs.set("domain", params.domain);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ concepts: Concept[] }>(`/api/concepts${suffix}`);
  },

  getConcept: (id: string) => request<{ concept: Concept }>(`/api/concepts/${encodeURIComponent(id)}`),

  getPrerequisites: (id: string, hops = 4) =>
    request<{ conceptId: string; hops: number; prerequisites: PrerequisiteEntry[] }>(
      `/api/concepts/${encodeURIComponent(id)}/prerequisites?hops=${hops}`
    ),

  getUnlocks: (id: string, hops = 4) =>
    request<{ conceptId: string; hops: number; unlocks: PrerequisiteEntry[] }>(
      `/api/concepts/${encodeURIComponent(id)}/unlocks?hops=${hops}`
    ),

  getResources: (id: string) =>
    request<{ conceptId: string; resources: Resource[] }>(`/api/concepts/${encodeURIComponent(id)}/resources`),

  shortestPath: (source: string, target: string) =>
    request<{ source: string; target: string; hops: number; path: LearningPathStep[] }>(
      `/api/paths/shortest?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`
    ),
};
