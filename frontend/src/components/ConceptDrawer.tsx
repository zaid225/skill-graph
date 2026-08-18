import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, GitBranch, Unlock, ExternalLink, Route, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Concept, type PrerequisiteEntry, type Resource } from "@/lib/api";
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";

interface ConceptDrawerProps {
  conceptId: string | null;
  onFindPathTo: (conceptId: string) => void;
  onSelectConcept: (conceptId: string) => void;
}

const DIFFICULTY_LABEL: Record<Concept["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function ConceptDrawer({ conceptId, onFindPathTo, onSelectConcept }: ConceptDrawerProps) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteEntry[]>([]);
  const [unlocksTree, setUnlocksTree] = useState<PrerequisiteEntry[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conceptId) {
      setConcept(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getConcept(conceptId),
      api.getPrerequisites(conceptId, 4),
      api.getUnlocks(conceptId, 4),
      api.getResources(conceptId),
    ])
      .then(([c, prereq, unlocks, res]) => {
        if (cancelled) return;
        setConcept(c.concept);
        setPrerequisites(prereq.prerequisites);
        setUnlocksTree(unlocks.unlocks);
        setResources(res.resources);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load concept details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conceptId]);

  if (!conceptId) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 border-dashed shadow-none p-8 text-center">
        <Layers className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-bold uppercase tracking-wide">No concept selected</p>
        <p className="text-xs text-muted-foreground">
          Click a node on the graph, or search above, to inspect its prerequisites, dependent concepts, and linked
          notes/tests.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="h-full space-y-4 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>
    );
  }

  if (error || !concept) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-destructive">Couldn't load this concept</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="space-y-2 border-b-2 border-border pb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: domainColor(concept.domain) }}
          />
          <Badge variant="secondary">{concept.domain}</Badge>
          <Badge variant="outline">{DIFFICULTY_LABEL[concept.difficulty]}</Badge>
        </div>
        <CardTitle className="text-base">{concept.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{concept.description}</p>
        <Button size="sm" variant="secondary" className="w-fit gap-1.5" onClick={() => onFindPathTo(concept.id)}>
          <Route className="h-3.5 w-3.5" /> Find Path to This Concept
        </Button>
      </CardHeader>

      <CardContent className="flex-1 space-y-5 overflow-y-auto p-4">
        <Section
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Prerequisites"
          empty="No prerequisites — this is a foundational concept."
        >
          {prerequisites.map((p) => (
            <ConceptRow key={p.id} concept={p} hop={p.hopDistance} onClick={() => onSelectConcept(p.id)} />
          ))}
        </Section>

        <Section
          icon={<Unlock className="h-3.5 w-3.5" />}
          title="Unlocks (dependent concepts)"
          empty="Nothing else currently depends on this concept."
        >
          {unlocksTree.map((u) => (
            <ConceptRow key={u.id} concept={u} hop={u.hopDistance} onClick={() => onSelectConcept(u.id)} />
          ))}
        </Section>

        <Section icon={<BookOpen className="h-3.5 w-3.5" />} title="Notes & Resources" empty="No resources linked yet.">
          {resources.map((r) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md border-2 border-border p-2 text-sm transition-colors hover:bg-accent"
            >
              <Badge variant="outline" className="shrink-0 capitalize">
                {r.type}
              </Badge>
              <span className="truncate">{r.title}</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {hasChildren ? <div className="space-y-1.5">{children}</div> : <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}

function ConceptRow({ concept, hop, onClick }: { concept: Concept; hop: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border-2 border-border p-2 text-left text-sm transition-colors hover:bg-accent"
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: domainColor(concept.domain) }}
      />
      <span className="truncate">{concept.name}</span>
      <Badge variant="secondary" className="ml-auto shrink-0">
        {hop} hop{hop === 1 ? "" : "s"}
      </Badge>
    </button>
  );
}
