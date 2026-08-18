import { useEffect, useRef, useState } from "react";
import { Network, Search, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Concept, Domain } from "@/lib/api";
import { DOMAIN_COLORS } from "@/lib/domain-colors";

const DOMAINS: Domain[] = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Design"];

export type ConnectionStatus = "checking" | "connected" | "disconnected";

interface NavbarProps {
  concepts: Concept[];
  activeDomain: Domain | null;
  onDomainChange: (domain: Domain | null) => void;
  onSelectConcept: (conceptId: string) => void;
  connectionStatus: ConnectionStatus;
}

export function Navbar({ concepts, activeDomain, onDomainChange, onSelectConcept, connectionStatus }: NavbarProps) {
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

  const suggestions = query.trim()
    ? concepts.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <header className="flex flex-col gap-3 border-b-2 border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-border bg-primary text-primary-foreground shadow-xs">
          <Network className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-bold uppercase leading-none tracking-wide">SkillGraph</h1>
          <p className="text-xs text-muted-foreground">Learning path explorer</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div ref={containerRef} className="relative w-full sm:w-72">
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

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onDomainChange(null)}
            className={cn(
              "rounded-md border-2 border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-all",
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
                "flex items-center gap-1.5 rounded-md border-2 border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-all",
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

        <ConnectionBadge status={connectionStatus} />
      </div>
    </header>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "checking") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge className="gap-1 border-border bg-emerald-400 text-emerald-950">
        <Wifi className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <WifiOff className="h-3 w-3" /> Offline
    </Badge>
  );
}
