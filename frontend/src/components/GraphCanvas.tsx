import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import ForceGraph2D from "react-force-graph-2d";
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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

    const visibleNodeIds = new Set<string>();
    const nodes: FGNode[] = data.nodes
      .filter((n) => {
        if (activeDomain && n.label === "Concept" && n.domain !== activeDomain) return false;
        return true;
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
    <div ref={containerRef} className="graph-canvas-wrapper h-full w-full">
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
          // Fit once on first settle. Re-fitting later would yank the viewport
          // out from under someone who has panned or zoomed themselves.
          if (hasFitRef.current) return;
          hasFitRef.current = true;
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
            const fontSize = (n.label === "Concept" ? 11 : 9) / globalScale;
            ctx.font = `${n.label === "Concept" ? "bold " : ""}${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            // Knock a light plate out behind the text so labels stay readable
            // where they overlap edges or other nodes.
            const padding = 2 / globalScale;
            const width = ctx.measureText(label).width;
            const top = (node.y ?? 0) + radius + padding;
            ctx.fillStyle = "rgba(255, 253, 250, 0.75)";
            ctx.fillRect((node.x ?? 0) - width / 2 - padding, top, width + padding * 2, fontSize + padding);

            ctx.fillStyle = n.label === "Concept" ? "#2d2216" : "rgba(45,34,22,0.65)";
            ctx.fillText(label, node.x ?? 0, top);
          }
        }}
      />
    </div>
  );
}
