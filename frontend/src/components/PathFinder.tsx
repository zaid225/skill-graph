import { useState } from "react";
import { ArrowRight, Route, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError, type Concept, type LearningPathStep } from "@/lib/api";
import { domainColor } from "@/lib/domain-colors";

interface PathFinderProps {
  concepts: Concept[];
  initialSource?: string | null;
  initialTarget?: string | null;
  onPathFound: (path: LearningPathStep[] | null) => void;
}

export function PathFinder({ concepts, initialSource, initialTarget, onPathFound }: PathFinderProps) {
  const [source, setSource] = useState(initialSource ?? "");
  const [target, setTarget] = useState(initialTarget ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<LearningPathStep[] | null>(null);

  async function findPath() {
    if (!source || !target) return;
    setLoading(true);
    setError(null);
    setPath(null);
    try {
      const res = await api.shortestPath(source, target);
      setPath(res.path);
      onPathFound(res.path);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NO_PATH_FOUND") {
        setError(
          "These aren't connected by prerequisites. The target doesn't build on what you already know, so try a different pair."
        );
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong finding a path.");
      }
      onPathFound(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          <Route className="h-4 w-4" /> Path Finder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ConceptSelect label="I already know" value={source} onChange={setSource} concepts={concepts} />
        <ConceptSelect label="I want to learn" value={target} onChange={setTarget} concepts={concepts} />

        <Button onClick={findPath} disabled={!source || !target || source === target || loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
          Find Shortest Path
        </Button>

        {source && target && source === target && (
          <p className="text-xs text-muted-foreground">Pick two different concepts.</p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border-2 border-border bg-destructive/15 p-2 text-xs font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {path && path.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {path.length - 1} hop{path.length - 1 === 1 ? "" : "s"} · {path.length} concepts
            </p>
            <ol className="space-y-1.5">
              {path.map((step, i) => (
                <li key={step.concept.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: domainColor(step.concept.domain) }}
                  />
                  <span className="truncate">{step.concept.name}</span>
                  {i < path.length - 1 && <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConceptSelect({
  label,
  value,
  onChange,
  concepts,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  concepts: Concept[];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border-2 border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Select a concept…</option>
        {concepts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
