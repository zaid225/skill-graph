import { useMemo, useState, type ReactNode } from "react";
import { Plus, Loader2, AlertTriangle, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { api, ApiError, type Concept, type Domain } from "@/lib/api";
import { DOMAIN_COLORS } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";

const DOMAINS: Domain[] = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Design"];
const DIFFICULTIES: Concept["difficulty"][] = ["beginner", "intermediate", "advanced"];

interface AddConceptDialogProps {
  concepts: Concept[];
  onCreated: (concept: Concept) => void;
}

export function AddConceptDialog({ concepts, onCreated }: AddConceptDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState<Domain>("Mathematics");
  const [difficulty, setDifficulty] = useState<Concept["difficulty"]>("beginner");
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [prereqFilter, setPrereqFilter] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredConcepts = useMemo(() => {
    const q = prereqFilter.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter((c) => c.name.toLowerCase().includes(q));
  }, [concepts, prereqFilter]);

  function reset() {
    setName("");
    setDescription("");
    setDomain("Mathematics");
    setDifficulty("beginner");
    setPrerequisiteIds([]);
    setPrereqFilter("");
    setError(null);
  }

  function togglePrereq(id: string) {
    setPrerequisiteIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  // Mirrors the server's rules so the button disables before a round-trip.
  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const descriptionValid = description.trim().length >= 10 && description.trim().length <= 400;
  const canSubmit = nameValid && descriptionValid && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { concept } = await api.createConcept({
        name: name.trim(),
        description: description.trim(),
        domain,
        difficulty,
        prerequisiteIds,
      });
      onCreated(concept);
      toast.success(`Added ${concept.name}`, {
        description: prerequisiteIds.length
          ? `Linked to ${prerequisiteIds.length} prerequisite${prerequisiteIds.length === 1 ? "" : "s"}.`
          : "No prerequisites linked.",
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save this concept.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add<span className="hidden sm:inline"> Concept</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a Concept</DialogTitle>
          <DialogDescription>
            New topics join the graph immediately. Pick what a learner must already know before tackling it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" hint={name.length > 0 && !nameValid ? "2-80 characters" : undefined}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Graph Neural Networks"
              autoFocus
            />
          </Field>

          <Field
            label="Description"
            hint={description.length > 0 && !descriptionValid ? "10-400 characters" : undefined}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="One or two sentences on what this covers."
              className="flex w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Domain">
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as Domain)}
                className="flex h-9 w-full rounded-md border-2 border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Difficulty">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Concept["difficulty"])}
                className="flex h-9 w-full rounded-md border-2 border-input bg-background px-2 text-sm capitalize shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={prerequisiteIds.length ? `Prerequisites (${prerequisiteIds.length} selected)` : "Prerequisites"}>
            <Input
              value={prereqFilter}
              onChange={(e) => setPrereqFilter(e.target.value)}
              placeholder="Filter concepts..."
              className="mb-2"
            />
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border-2 border-border p-1.5">
              {filteredConcepts.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                  No concepts match that filter.
                </p>
              ) : (
                filteredConcepts.map((c) => {
                  const selected = prerequisiteIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePrereq(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border-2 px-2 py-1.5 text-left text-sm transition-colors",
                        selected ? "border-border bg-accent" : "border-transparent hover:bg-accent/50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 border-border",
                          selected && "bg-primary text-primary-foreground"
                        )}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: DOMAIN_COLORS[c.domain] }}
                      />
                      <span className="truncate">{c.name}</span>
                    </button>
                  );
                })
              )}
            </div>
            {prerequisiteIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {prerequisiteIds.map((id) => {
                  const c = concepts.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <Badge key={id} variant="outline" className="gap-1">
                      {c.name}
                      <button type="button" onClick={() => togglePrereq(id)} aria-label={`Remove ${c.name}`}>
                        &times;
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-md border-2 border-border bg-destructive/15 p-2 text-xs font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add Concept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        {hint && <span className="text-xs font-medium text-destructive">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
