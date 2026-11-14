"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  relationLabels,
  type KnowledgeGraphData,
  type GraphEdge,
} from "@/lib/search/relations";
import styles from "@/app/graph/graph.module.css";

export function KnowledgeGraph({ data }: { data: KnowledgeGraphData }) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selected, setSelected] = useState<string>("");
  const nodes = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  );
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const groups = [
      data.nodes.filter((n) => n.kind === "topic"),
      data.nodes.filter((n) => n.kind === "article"),
    ];
    groups.forEach((group, groupIndex) =>
      group.forEach((node, index) => {
        const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
        const radius = groupIndex === 0 ? 118 : 225;
        map.set(node.id, {
          x: Math.round((350 + Math.cos(angle) * radius) * 1000) / 1000,
          y: Math.round((290 + Math.sin(angle) * radius) * 1000) / 1000,
        });
      }),
    );
    return map;
  }, [data.nodes]);
  const linked = useMemo(
    () =>
      new Set([
        selected,
        ...data.edges
          .filter((e) => e.from === selected || e.to === selected)
          .flatMap((e) => [e.from, e.to]),
      ]),
    [selected, data.edges],
  );
  const selection = nodes.get(selected);
  const selectedEdges = data.edges.filter(
    (e) => !selected || e.from === selected || e.to === selected,
  );
  const renderEdge = (edge: GraphEdge) => (
    <article key={edge.id} className={styles.relationCard}>
      <div className={styles.direction}>
        <Link href={nodes.get(edge.from)!.href}>
          <strong>{nodes.get(edge.from)!.label}</strong>
        </Link>
        <span aria-label="指向">→</span>
        <Link href={nodes.get(edge.to)!.href}>
          <strong>{nodes.get(edge.to)!.label}</strong>
        </Link>
      </div>
      <div className={styles.relationType}>
        {relationLabels[edge.type] || edge.type} · {edge.type} · 已确认
      </div>
      <p>{edge.description || "编辑已确认此关系。"}</p>
      {edge.evidenceUrl && (
        <a
          href={edge.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--accent)" }}
        >
          查看关系依据 ↗
        </a>
      )}
    </article>
  );
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.controls} role="group" aria-label="关系显示方式">
          <button
            className={`button ${view === "graph" ? "" : "secondary"}`}
            onClick={() => setView("graph")}
            aria-pressed={view === "graph"}
          >
            关系图
          </button>
          <button
            className={`button ${view === "list" ? "" : "secondary"}`}
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
          >
            证据列表
          </button>
        </div>
        <div className={styles.legend}>
          <span>
            <i className={styles.dot} />
            技术主题
          </span>
          <span>
            <i className={`${styles.dot} ${styles.articleDot}`} />
            内容资料
          </span>
          <span>{data.edges.length} 条关系</span>
        </div>
      </div>
      <div className={styles.nodeSelector}>
        <label htmlFor="graph-node" style={{ fontSize: 12 }}>
          聚焦节点
        </label>
        <select
          id="graph-node"
          style={{ maxWidth: 460 }}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">显示全部节点</option>
          {data.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.kind === "topic" ? "主题" : "资料"} · {node.label}
            </option>
          ))}
        </select>
        {selected && (
          <button className="button secondary" onClick={() => setSelected("")}>
            清除聚焦
          </button>
        )}
      </div>
      {!data.edges.length ? (
        <div className={`panel ${styles.empty}`}>
          <h2>还没有符合条件的已确认关系</h2>
          <p>可减少筛选条件，或在后台添加有证据的知识关联。</p>
        </div>
      ) : view === "list" ? (
        <div aria-live="polite">{selectedEdges.map(renderEdge)}</div>
      ) : (
        <div className={styles.layout}>
          <div
            className={styles.canvas}
            tabIndex={0}
            role="region"
            aria-label="关系图画布，可横向滚动"
          >
            <svg
              viewBox="0 0 700 580"
              role="group"
              aria-label="已审核知识关系图；用Tab或节点选择框聚焦，并在旁边查看证据"
            >
              <defs>
                <marker
                  id="atlas-arrow"
                  viewBox="0 0 10 10"
                  refX="22"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
                </marker>
              </defs>
              {data.edges.map((edge) => {
                const from = positions.get(edge.from)!,
                  to = positions.get(edge.to)!;
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={
                      selected &&
                      (edge.from === selected || edge.to === selected)
                        ? styles.activeEdge
                        : styles.edge
                    }
                    markerEnd="url(#atlas-arrow)"
                  >
                    <title>{`${nodes.get(edge.from)!.label} → ${relationLabels[edge.type] || edge.type} → ${nodes.get(edge.to)!.label}`}</title>
                  </line>
                );
              })}
              {data.nodes.map((node) => {
                const position = positions.get(node.id)!;
                return (
                  <g
                    key={node.id}
                    className={styles.node}
                    data-kind={node.kind}
                    data-selected={selected === node.id}
                    data-dimmed={!!selected && !linked.has(node.id)}
                    transform={`translate(${position.x},${position.y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`聚焦${node.kind === "topic" ? "主题" : "资料"}：${node.label}`}
                    aria-pressed={selected === node.id}
                    onClick={() => setSelected(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(node.id);
                      }
                    }}
                  >
                    <circle r={node.kind === "topic" ? 12 : 9} />
                    <text textAnchor="middle" y={28}>
                      {node.label.length > 15
                        ? node.label.slice(0, 14) + "…"
                        : node.label}
                    </text>
                    <title>{node.label}</title>
                  </g>
                );
              })}
            </svg>
          </div>
          <aside className={styles.detail} aria-live="polite">
            {selection ? (
              <>
                <span className="eyebrow">
                  {selection.kind === "topic" ? "TOPIC" : "ARTICLE"}
                </span>
                <h2>{selection.label}</h2>
                <Link className="button secondary" href={selection.href}>
                  打开{selection.kind === "topic" ? "主题" : "资料"} ↗
                </Link>
                {selectedEdges.map(renderEdge)}
              </>
            ) : (
              <>
                <h2>从一个节点开始</h2>
                <p>
                  点击图中的节点，查看与它相连的资料、方向和原始证据。也可以切换到列表逐条阅读。
                </p>
                <div className="notice">
                  连线表示编辑确认的具体关系；布局位置没有时间或重要性含义。
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      {data.total > data.edges.length && (
        <p className="notice">
          共 {data.total} 条符合条件的关系，当前显示最近确认的{" "}
          {data.edges.length} 条。请选择技术主题或关系类型缩小范围。
        </p>
      )}
    </>
  );
}
