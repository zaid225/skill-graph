import { useState, type ReactNode } from "react";
import { Pencil, Loader2, AlertTriangle, Trash2 } from "lucide-react";
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
import { toast } from "@/components/ui/sonner";
import { api, ApiError, type Concept, type Domain } from "@/lib/api";

const DOMAINS: Domain[] = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Design"];
const DIFFICULTIES: Concept["difficulty"][] = ["beginner", "intermediate", "advanced"];

interface EditConceptDialogProps {
  concept: Concept;
  onUpdated: (concept: Concept) => void;
  onDeleted: (conceptId: string) => void;
}

export function EditConceptDialog({ concept, onUpdated, onDeleted }: EditConceptDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(concept.name);
  const [description, setDescription] = useState(concept.description);
  const [domain, setDomain] = useState<Domain>(concept.domain);
  const [difficulty, setDifficulty] = useState<Concept["difficulty"]>(concept.difficulty);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetToConcept() {
    setName(concept.name);
    setDescription(concept.description);
    setDomain(concept.domain);
    setDifficulty(concept.difficulty);
    setConfirmDelete(false);
    setError(null);
  }

  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const descriptionValid = description.trim().length >= 10 && description.trim().length <= 400;
  const dirty =
    name.trim() !== concept.name ||
    description.trim() !== concept.description ||
    domain !== concept.domain ||
    difficulty !== concept.difficulty;
  const canSave = nameValid && descriptionValid && dirty && !saving && !deleting;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { concept: updated } = await api.updateConcept(concept.id, {
        name: name.trim(),
        description: description.trim(),
        domain,
        difficulty,
      });
      onUpdated(updated);
      toast.success(`Saved ${updated.name}`);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteConcept(concept.id);
      onDeleted(concept.id);
      toast.success(`Deleted ${concept.name}`, {
        description: "Its links and any notes only it taught were removed too.",
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this concept.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetToConcept();
        else setConfirmDelete(false);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Concept</DialogTitle>
          <DialogDescription>
            Renaming is safe. The id stays fixed so existing prerequisite links keep working.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" hint={!nameValid ? "2-80 characters" : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Description" hint={!descriptionValid ? "10-400 characters" : undefined}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
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

          {error && (
            <div className="flex items-start gap-2 rounded-md border-2 border-border bg-destructive/15 p-2 text-xs font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t-2 border-border pt-3">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Delete and unlink everywhere?</span>
                <Button size="sm" variant="destructive" onClick={remove} disabled={deleting}>
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Yes, delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  No
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving || deleting}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={!canSave}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
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
