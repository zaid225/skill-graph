import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Navbar, type ConnectionStatus } from "@/components/Navbar";
import { GraphCanvas } from "@/components/GraphCanvas";
import { PathFinder } from "@/components/PathFinder";
import { ConceptDrawer } from "@/components/ConceptDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Concept, type Domain, type GraphNode, type GraphOverview, type LearningPathStep } from "@/lib/api";

export default function App() {
  const [overview, setOverview] = useState<GraphOverview | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");

  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pathFinderTarget, setPathFinderTarget] = useState<string | null>(null);
  const [pathFinderKey, setPathFinderKey] = useState(0);
  const [highlightedPath, setHighlightedPath] = useState<Set<string> | undefined>(undefined);

  async function loadGraph() {
    setLoading(true);
    setLoadError(null);
    try {
      const [ov, conceptList] = await Promise.all([api.graphOverview(), api.listConcepts()]);
      setOverview(ov);
      setConcepts(conceptList.concepts);
      setConnectionStatus("connected");
    } catch (err) {
      if (err instanceof ApiError && err.code === "DATABASE_UNAVAILABLE") {
        setConnectionStatus("disconnected");
        setLoadError(err.message);
      } else if (err instanceof ApiError) {
        setLoadError(err.message);
      } else {
        setLoadError("Failed to load the graph.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGraph();
    const interval = setInterval(async () => {
      try {
        const h = await api.health();
        setConnectionStatus(h.status);
      } catch {
        setConnectionStatus("disconnected");
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleNodeClick = (node: GraphNode) => {
    if (node.label === "Concept") setSelectedId(node.id);
  };

  // Re-fetch rather than splicing the new node in by hand: the concept may
  // have brought REQUIRES edges with it, and the server is the authority on
  // what the graph now looks like.
  const handleConceptCreated = async (concept: Concept) => {
    await loadGraph();
    setSelectedId(concept.id);
  };

  const handleFindPathTo = (conceptId: string) => {
    setPathFinderTarget(conceptId);
    setPathFinderKey((k) => k + 1);
  };

  const handlePathFound = (path: LearningPathStep[] | null) => {
    setHighlightedPath(path ? new Set(path.map((s) => s.concept.id)) : undefined);
  };

  const isEmptyGraph = overview !== null && overview.nodes.length === 0;

  const showBanner = connectionStatus === "disconnected";

  return (
    <div className="flex h-screen flex-col bg-background">
      <Navbar
        concepts={concepts}
        activeDomain={activeDomain}
        onDomainChange={setActiveDomain}
        onSelectConcept={setSelectedId}
        connectionStatus={connectionStatus}
        onConceptCreated={handleConceptCreated}
      />

      {showBanner && (
        <div className="flex items-center gap-3 border-b-2 border-border bg-destructive/15 px-4 py-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {loadError ?? "CognoDB is unreachable. It may be paused, misconfigured, or the credentials are invalid."}
          </span>
          <Button size="sm" variant="outline" onClick={loadGraph} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_340px]">
        <div className="relative min-h-[320px] overflow-hidden rounded-lg border-2 border-border bg-card shadow">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <div className="w-full max-w-sm space-y-3 p-6">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          )}

          {!loading && isEmptyGraph && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-bold uppercase tracking-wide">No graph data yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Run <code className="rounded border-2 border-border bg-muted px-1 py-0.5">npm run seed</code> in the
                backend to populate CognoDB with the sample concept graph.
              </p>
            </div>
          )}

          {!loading && overview && !isEmptyGraph && (
            <GraphCanvas
              data={overview}
              activeDomain={activeDomain}
              selectedId={selectedId}
              highlightPath={highlightedPath}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto">
          <PathFinder
            key={pathFinderKey}
            concepts={concepts}
            initialTarget={pathFinderTarget}
            onPathFound={handlePathFound}
          />
          <div className="min-h-[300px] flex-1">
            <ConceptDrawer conceptId={selectedId} onFindPathTo={handleFindPathTo} onSelectConcept={setSelectedId} />
          </div>
        </div>
      </main>
    </div>
  );
}
