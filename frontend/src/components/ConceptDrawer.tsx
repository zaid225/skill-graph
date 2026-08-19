import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BookOpen, GitBranch, Unlock, ExternalLink, Route, Layers, Plus, X, Loader2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EditConceptDialog } from "@/components/EditConceptDialog";
import { toast } from "@/components/ui/sonner";
import { api, ApiError, type Concept, type PrerequisiteEntry, type Resource } from "@/lib/api";
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";

interface ConceptDrawerProps {
  conceptId: string | null;
  allConcepts: Concept[];
  onFindPathTo: (conceptId: string) => void;
  onSelectConcept: (conceptId: string) => void;
  onGraphChanged: () => void;
}

const DIFFICULTY_LABEL: Record<Concept["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const RESOURCE_TYPES: Resource["type"][] = ["note", "test", "article", "video", "course"];

export function ConceptDrawer({
  conceptId,
  allConcepts,
  onFindPathTo,
  onSelectConcept,
  onGraphChanged,
}: ConceptDrawerProps) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteEntry[]>([]);
  const [unlocksTree, setUnlocksTree] = useState<PrerequisiteEntry[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (id: string, showSkeleton: boolean) => {
      if (showSkeleton) setLoading(true);
      setError(null);
      try {
        const [c, prereq, unlocks, res] = await Promise.all([
          api.getConcept(id),
          api.getPrerequisites(id, 10),
          api.getUnlocks(id, 10),
          api.getResources(id),
        ]);
        setConcept(c.concept);
        setPrerequisites(prereq.prerequisites);
        setUnlocksTree(unlocks.unlocks);
        setResources(res.resources);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load concept details.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!conceptId) {
      setConcept(null);
      return;
    }
    let cancelled = false;
    // The load itself guards nothing, so bail out on the state writes instead
    // if the selection changed while the requests were in flight.
    (async () => {
      if (cancelled) return;
      await load(conceptId, true);
    })();
    return () => {
      cancelled = true;
    };
  }, [conceptId, load]);

  async function runAction(key: string, successMessage: string, action: () => Promise<unknown>) {
    setBusyId(key);
    try {
      await action();
      if (conceptId) await load(conceptId, false);
      onGraphChanged();
      toast.success(successMessage);
    } catch (err) {
      // The server's message is the useful part here. A rejected prerequisite
      // explains it would create a cycle, which is worth showing verbatim.
      toast.error(err instanceof ApiError ? err.message : "That didn't work.");
    } finally {
      setBusyId(null);
    }
  }

  if (!conceptId) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 border-dashed p-8 text-center shadow-none">
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

  const directPrereqIds = new Set(prerequisites.filter((p) => p.hopDistance === 1).map((p) => p.id));

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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onFindPathTo(concept.id)}>
            <Route className="h-3.5 w-3.5" /> Plan a Path to This
          </Button>
          <EditConceptDialog
            key={concept.id + concept.name}
            concept={concept}
            onUpdated={() => {
              if (conceptId) load(conceptId, false);
              onGraphChanged();
            }}
            onDeleted={() => {
              onSelectConcept("");
              onGraphChanged();
            }}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-5 overflow-y-auto p-4">
        <Section
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Prerequisites"
          empty="No prerequisites. This is a foundational concept."
          action={
            <AddPrerequisite
              concept={concept}
              allConcepts={allConcepts}
              existing={directPrereqIds}
              onAdd={(prereqId) =>
                runAction(`add-prereq-${prereqId}`, "Prerequisite added", () =>
                  api.addPrerequisite(concept.id, prereqId)
                )
              }
            />
          }
        >
          {prerequisites.map((p) => (
            <ConceptRow
              key={p.id}
              concept={p}
              hop={p.hopDistance}
              onClick={() => onSelectConcept(p.id)}
              // Only direct links can be removed. Anything further away is
              // implied by the chain, so there is no single edge to delete.
              onRemove={
                p.hopDistance === 1
                  ? () =>
                      runAction(`rm-prereq-${p.id}`, `Unlinked ${p.name}`, () =>
                        api.removePrerequisite(concept.id, p.id)
                      )
                  : undefined
              }
              busy={busyId === `rm-prereq-${p.id}`}
            />
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

        <Section
          icon={<BookOpen className="h-3.5 w-3.5" />}
          title="Notes & Resources"
          empty="No resources linked yet."
          action={
            <AddResource
              onAdd={(input) =>
                runAction("add-resource", "Resource added", () => api.addResource(concept.id, input))
              }
            />
          }
        >
          {resources.map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              busy={busyId === `rm-res-${r.id}` || busyId === `edit-res-${r.id}`}
              onSave={(fields) =>
                runAction(`edit-res-${r.id}`, "Resource updated", () =>
                  api.updateResource(concept.id, r.id, fields)
                )
              }
              onRemove={() =>
                runAction(`rm-res-${r.id}`, `Deleted ${r.title}`, () =>
                  api.deleteResource(concept.id, r.id)
                )
              }
            />
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
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {hasChildren ? (
        <div className="space-y-1.5">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function ConceptRow({
  concept,
  hop,
  onClick,
  onRemove,
  busy,
}: {
  concept: Concept;
  hop: number;
  onClick: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border-2 border-border p-2 text-sm transition-colors hover:bg-accent">
      <button onClick={onClick} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left")}>
        <span
          className="h-2 w-2 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: domainColor(concept.domain) }}
        />
        <span className="truncate">{concept.name}</span>
      </button>
      <Badge variant="secondary" className="shrink-0">
        {hop} hop{hop === 1 ? "" : "s"}
      </Badge>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove ${concept.name} as a prerequisite`}
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function AddPrerequisite({
  concept,
  allConcepts,
  existing,
  onAdd,
}: {
  concept: Concept;
  allConcepts: Concept[];
  existing: Set<string>;
  onAdd: (prereqId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const candidates = allConcepts.filter((c) => c.id !== concept.id && !existing.has(c.id));

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 max-w-[9rem] rounded-md border-2 border-input bg-background px-1 text-xs"
      >
        <option value="">Pick one...</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={!value}
        onClick={() => {
          onAdd(value);
          setValue("");
          setOpen(false);
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => setOpen(false)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function AddResource({ onAdd }: { onAdd: (input: { title: string; url: string; type: Resource["type"] }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<Resource["type"]>("note");

  const valid = title.trim().length >= 2 && /^https?:\/\/\S+$/i.test(url.trim());

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add
      </Button>
    );
  }

  return (
    <div className="w-full space-y-1.5 rounded-md border-2 border-border p-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-7 text-xs" />
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs" />
      <div className="flex items-center gap-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Resource["type"])}
          className="h-7 flex-1 rounded-md border-2 border-input bg-background px-1 text-xs capitalize"
        >
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!valid}
          onClick={() => {
            onAdd({ title: title.trim(), url: url.trim(), type });
            setTitle("");
            setUrl("");
            setType("note");
            setOpen(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => setOpen(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ResourceRow({
  resource,
  busy,
  onSave,
  onRemove,
}: {
  resource: Resource;
  busy?: boolean;
  onSave: (fields: { title: string; url: string; type: Resource["type"] }) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(resource.title);
  const [url, setUrl] = useState(resource.url);
  const [type, setType] = useState<Resource["type"]>(resource.type);

  const valid = title.trim().length >= 2 && /^https?:\/\/\S+$/i.test(url.trim());

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-md border-2 border-border p-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 text-xs" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} className="h-7 text-xs" />
        <div className="flex items-center gap-1">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Resource["type"])}
            className="h-7 flex-1 rounded-md border-2 border-input bg-background px-1 text-xs capitalize"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!valid}
            onClick={() => {
              onSave({ title: title.trim(), url: url.trim(), type });
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-xs"
            onClick={() => {
              setTitle(resource.title);
              setUrl(resource.url);
              setType(resource.type);
              setEditing(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border-2 border-border p-2 text-sm transition-colors hover:bg-accent">
      <Badge variant="outline" className="shrink-0 capitalize">
        {resource.type}
      </Badge>
      <a
        href={resource.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-1 truncate hover:underline"
      >
        <span className="truncate">{resource.title}</span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      </a>
      <button
        onClick={() => setEditing(true)}
        aria-label={`Edit ${resource.title}`}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRemove}
        disabled={busy}
        aria-label={`Delete ${resource.title}`}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
