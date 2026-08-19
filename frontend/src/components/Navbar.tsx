import { useEffect, useRef, useState } from "react";
import { Network, Search, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddConceptDialog } from "@/components/AddConceptDialog";
import { cn } from "@/lib/utils";
import { api, type Concept, type Domain } from "@/lib/api";
import { DOMAIN_COLORS } from "@/lib/domain-colors";

const DOMAINS: Domain[] = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Design"];

export type ConnectionStatus = "checking" | "connected" | "disconnected";

interface NavbarProps {
  concepts: Concept[];
  activeDomain: Domain | null;
  onDomainChange: (domain: Domain | null) => void;
  onSelectConcept: (conceptId: string) => void;
  connectionStatus: ConnectionStatus;
  onConceptCreated: (concept: Concept) => void;
}

export function Navbar({
  concepts,
  activeDomain,
  onDomainChange,
  onSelectConcept,
  connectionStatus,
  onConceptCreated,
}: NavbarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Local list first so typing feels instant, then the server's search takes
  // over once it answers. It also matches on description, which the client
  // list cannot do without shipping every description to the browser.
  const [remoteHits, setRemoteHits] = useState<Concept[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .listConcepts({ q })
        .then((r) => {
          if (!cancelled) setRemoteHits(r.concepts);
        })
        .catch(() => {
          if (!cancelled) setRemoteHits(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const localHits = query.trim()
    ? concepts.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const suggestions = (remoteHits ?? localHits).slice(0, 8);

  return (
    <header className="flex flex-col gap-2 border-b-2 border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-primary text-primary-foreground shadow-xs sm:h-9 sm:w-9">
          <Network className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold uppercase leading-none tracking-wide">SkillGraph</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">Learning path explorer</p>
        </div>

        {/* Pinned to the identity row on phones so the actions never need a row
            of their own. They move back to the right on large screens. */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <AddConceptDialog concepts={concepts} onCreated={onConceptCreated} />
          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-end">
        <div ref={containerRef} className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search concepts…"
            className="pl-8"
          />
          {open && suggestions.length > 0 && (
            <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border-2 border-border bg-popover shadow">
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectConcept(c.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: DOMAIN_COLORS[c.domain] }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.domain}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          <button
            onClick={() => onDomainChange(null)}
            className={cn(
              "shrink-0 rounded-md border-2 border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-all",
              activeDomain === null
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-background hover:bg-accent"
            )}
          >
            All
          </button>
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => onDomainChange(activeDomain === d ? null : d)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border-2 border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-all",
                activeDomain === d ? "text-white shadow-xs" : "bg-background hover:bg-accent"
              )}
              style={activeDomain === d ? { backgroundColor: DOMAIN_COLORS[d] } : undefined}
            >
              <span
                className="h-1.5 w-1.5 rounded-full border border-border"
                style={{ backgroundColor: DOMAIN_COLORS[d] }}
              />
              {d}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <AddConceptDialog concepts={concepts} onCreated={onConceptCreated} />
          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>
    </header>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "checking") {
    return (
      <Badge variant="secondary" className="gap-1" title="Checking the database connection">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Checking</span>
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge className="gap-1 border-border bg-emerald-400 text-emerald-950" title="Connected to CognoDB">
        <Wifi className="h-3 w-3" />
        <span className="hidden sm:inline">Connected</span>
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1" title="CognoDB unreachable">
      <WifiOff className="h-3 w-3" />
      <span className="hidden sm:inline">Offline</span>
    </Badge>
  );
}
