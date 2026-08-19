import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Frame } from "lucide-react";
import type { GraphOverview, GraphNode, Domain } from "@/lib/api";
import { DOMAIN_COLORS, NODE_LABEL_COLORS } from "@/lib/domain-colors";

interface GraphCanvasProps {
  data: GraphOverview | null;
  activeDomain: Domain | null;
  selectedId: string | null;
  highlightPath?: Set<string>;
  onNodeClick: (node: GraphNode) => void;
}

// react-force-graph-2d's generics don't play well with our discriminated
// union node type once force-simulation fields (x, y, vx, vy...) are mixed
// in, we type our own data shapes and hand them to the component as `any`
// at the render boundary instead of fighting the library's generics.
type FGNode = GraphNode & { x?: number; y?: number };
type FGLink = { source: string; target: string; type: string };

const ForceGraph = ForceGraph2D as unknown as ComponentType<Record<string, any>>;

export function GraphCanvas({ data, activeDomain, selectedId, highlightPath, onNodeClick }: GraphCanvasProps) {
  const fgRef = useRef<any>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFitRef = useRef(false);
  const fitKeyRef = useRef<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(fg.zoom() * factor, 200);
  }, []);

  const fitToData = useCallback(() => fgRef.current?.zoomToFit(400, 60), []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => void 0);
    else el.requestFullscreen?.().catch(() => void 0);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    const visibleConceptIds = new Set(
      data.nodes
        .filter((n) => n.label === "Concept" && (!activeDomain || n.domain === activeDomain))
        .map((n) => n.id)
    );

    // A resource only earns a place on the canvas while the concept that
    // teaches it is visible. Without this check, filtering to one domain
    // leaves every other domain's notes floating as unconnected dots.
    const taughtBy = new Map<string, string>();
    for (const e of data.edges) {
      if (e.type === "TEACHES") taughtBy.set(e.target, e.source);
    }

    const visibleNodeIds = new Set<string>();
    const nodes: FGNode[] = data.nodes
      .filter((n) => {
        if (n.label === "Concept") return visibleConceptIds.has(n.id);
        const parent = taughtBy.get(n.id);
        return parent !== undefined && visibleConceptIds.has(parent);
      })
      .map((n) => {
        visibleNodeIds.add(n.id);
        return { ...n } as FGNode;
      });

    const links: FGLink[] = data.edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));

    return { nodes, links };
  }, [data, activeDomain]);

  const colorFor = (node: FGNode): string => {
    if (node.label === "Concept") return DOMAIN_COLORS[node.domain] ?? "#94a3b8";
    return NODE_LABEL_COLORS[node.label];
  };

  if (!data) return null;

  return (
    <div ref={containerRef} className="graph-canvas-wrapper relative h-full w-full bg-card">
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <ControlButton label="Zoom in" onClick={() => zoomBy(1.4)}>
          <ZoomIn className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <ZoomOut className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Fit graph to view" onClick={fitToData}>
          <Frame className="h-4 w-4" />
        </ControlButton>
        <ControlButton label={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </ControlButton>
      </div>

      <ForceGraph
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeId="id"
        nodeLabel={(n: FGNode) => (n.label === "Concept" ? n.name : n.title)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkColor={(l: FGLink) => (l.type === "REQUIRES" ? "#2d221699" : "#ea580c66")}
        linkWidth={(l: FGLink) =>
          highlightPath && highlightPath.has(String(l.source)) && highlightPath.has(String(l.target)) ? 3 : 1
        }
        cooldownTicks={80}
        onEngineStop={() => {
          // Fit on first settle, and again whenever the domain filter changes
          // the visible set. Refitting on every settle would yank the viewport
          // away from someone who has panned or zoomed themselves.
          const key = activeDomain ?? "all";
          if (hasFitRef.current && fitKeyRef.current === key) return;
          hasFitRef.current = true;
          fitKeyRef.current = key;
          fgRef.current?.zoomToFit(400, 60);
        }}
        onNodeClick={(node: FGNode) => onNodeClick(node as GraphNode)}
        nodeCanvasObject={(node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as FGNode;
          const label = n.label === "Concept" ? n.name : n.title;
          const isSelected = n.id === selectedId;
          const isOnPath = highlightPath?.has(n.id);
          const baseRadius = n.label === "Concept" ? 6 : 3.5;
          const radius = isSelected ? baseRadius + 2.5 : baseRadius;

          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = colorFor(n);
          ctx.fill();

          // Every node gets a hard dark outline to match the brutalist
          // border treatment used throughout the rest of the UI; selected
          // or path-highlighted nodes get a thicker primary-colored ring.
          ctx.lineWidth = isSelected ? 3 : isOnPath ? 2 : 1.2;
          ctx.strokeStyle = isSelected ? "#ea580c" : isOnPath ? "#ea580ccc" : "#2d2216";
          ctx.stroke();

          const showLabel = n.label === "Concept" ? globalScale > 0.45 : globalScale > 1.6;
          if (showLabel) {
            drawLabel(ctx, {
              text: label,
              x: node.x ?? 0,
              y: node.y ?? 0,
              offset: radius,
              globalScale,
              bold: n.label === "Concept",
              basePx: n.label === "Concept" ? 11 : 9.5,
              color: n.label === "Concept" ? "#2d2216" : "rgba(45,34,22,0.7)",
            });
          }
        }}
      />
    </div>
  );
}

interface LabelSpec {
  text: string;
  x: number;
  y: number;
  offset: number;
  globalScale: number;
  bold: boolean;
  basePx: number;
  color: string;
}

/**
 * Draws a node label in screen space rather than graph space.
 *
 * The obvious approach is `font = (11 / globalScale) + "px"` and let the canvas
 * transform scale it back up. That reads fine at 1x but falls apart zoomed in:
 * at 8x the font is about 1.4px, browsers rasterise sub-pixel type badly, and
 * the transform then magnifies the mush. Labels end up visibly blurry exactly
 * when someone has zoomed in to read them.
 *
 * So we reset the transform, place the text at the node's projected screen
 * position, and ask for a real pixel size. `getTransform().a` is devicePixelRatio
 * multiplied by the zoom, so dividing by globalScale recovers the DPR and keeps
 * the text sharp on retina displays too.
 *
 * Size grows with the square root of zoom, clamped, so text gets bigger as you
 * zoom in without ever running away or dropping below legibility.
 */
function drawLabel(ctx: CanvasRenderingContext2D, spec: LabelSpec) {
  const { text, x, y, offset, globalScale, bold, basePx, color } = spec;

  const t = ctx.getTransform();
  const dpr = t.a / globalScale || 1;
  const fontPx = Math.min(24, Math.max(9, basePx * Math.sqrt(globalScale)));

  // Project the node's graph coords into CSS pixels.
  const screenX = (t.a * x + t.e) / dpr;
  const screenY = (t.d * y + t.f) / dpr;
  const top = screenY + offset * globalScale + 3;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `${bold ? "bold " : ""}${fontPx}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Plate behind the text so labels survive crossing an edge or another node.
  const pad = 3;
  const width = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(255, 253, 250, 0.82)";
  ctx.fillRect(screenX - width / 2 - pad, top - 1, width + pad * 2, fontPx + 2);

  ctx.fillStyle = color;
  ctx.fillText(text, screenX, top);
  ctx.restore();
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-border bg-background text-foreground shadow-xs transition-all hover:bg-accent active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
    >
      {children}
    </button>
  );
}
