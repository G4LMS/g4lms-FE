import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  LoaderCircle,
  Lock,
} from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';
import {
  buildChapterClusterGraph,
  extractChapterMeta,
} from './graphHierarchy';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

type LearningState = 'mastered' | 'learning' | 'remedial' | 'unlearned' | 'locked';

interface Props {
  courseId: string;
  courseCode: string;
  courseName: string;
  data: KnowledgeGraphData;
  rightOpen: boolean;
  focusRequest?: { id: string; nonce: number } | null;
  onStartLearning: (nodeId: string) => void;
}

const STATE_LABEL: Record<LearningState, string> = {
  mastered: 'Đã vững',
  learning: 'Đang học',
  remedial: 'Cần ôn',
  unlearned: 'Chưa học',
  locked: 'Khóa tiên quyết',
};

function StateIcon({ state }: { state: LearningState }) {
  if (state === 'mastered') return <Check size={15} />;
  if (state === 'learning') return <LoaderCircle size={15} />;
  if (state === 'remedial') return <AlertCircle size={15} />;
  if (state === 'locked') return <Lock size={14} />;
  return <BookOpen size={14} />;
}

const relationCardTop = (index: number, count: number) =>
  104 + (index - (count - 1) / 2) * 88;

export function StudentRelationMap({
  courseId,
  courseCode,
  courseName,
  data,
  rightOpen,
  focusRequest,
  onStartLearning,
}: Props) {
  const clusterGraph = useMemo(
    () => buildChapterClusterGraph(data, courseCode, courseName),
    [data, courseCode, courseName],
  );
  const { chapters, courseRootId } = clusterGraph;

  const studyNodes = useMemo(
    () =>
      data.nodes.filter(
        (n) =>
          n.type !== 'Course' &&
          n.type !== 'Content' &&
          n.type !== 'LO' &&
          n.type !== 'Chapter',
      ),
    [data.nodes],
  );

  const studyById = useMemo(
    () => new Map(studyNodes.map((n) => [n.id, n])),
    [studyNodes],
  );

  const nodeChapterMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of chapters) {
      for (const nid of ch.nodeIds) map.set(nid, ch.key);
    }
    return map;
  }, [chapters]);

  const chapterByKey = useMemo(
    () => new Map(chapters.map((ch) => [ch.key, ch])),
    [chapters],
  );

  const learningStateMap = useMemo(() => {
    const map = new Map<string, LearningState>();
    const prereqSources = new Map<string, string[]>();

    for (const e of data.edges) {
      if (e.type === 'PREREQUISITE' && (e.properties ?? {}).strength !== 'soft') {
        const arr = prereqSources.get(e.target) ?? [];
        arr.push(e.source);
        prereqSources.set(e.target, arr);
      }
    }

    let hasLearning = false;
    for (const node of studyNodes) {
      const p = (node.properties ?? {}) as Record<string, unknown>;
      const ls = String(p.learning_state ?? p.learningState ?? '');
      const masteryVal = typeof p.mastery === 'number' ? p.mastery : null;

      if (ls === 'mastered' || (masteryVal !== null && masteryVal >= 70)) {
        map.set(node.id, 'mastered');
      } else if (ls === 'learning') {
        hasLearning = true;
        map.set(node.id, 'learning');
      } else if (
        ls === 'remedial' ||
        p.status === 'proposed' ||
        p.status === 'pending_review'
      ) {
        map.set(node.id, 'remedial');
      } else if (ls === 'locked') {
        map.set(node.id, 'locked');
      } else {
        map.set(node.id, 'unlearned');
      }
    }

    for (const node of studyNodes) {
      const cur = map.get(node.id);
      if (!cur || cur === 'mastered' || cur === 'learning') continue;
      const reqs = prereqSources.get(node.id) ?? [];
      if (reqs.some((srcId) => map.get(srcId) !== 'mastered')) {
        map.set(node.id, 'locked');
      }
    }

    if (!hasLearning) {
      const firstOpen =
        studyNodes.find((n) => map.get(n.id) === 'unlearned') ??
        studyNodes.find((n) => map.get(n.id) !== 'locked') ??
        studyNodes[0];
      if (firstOpen && map.get(firstOpen.id) !== 'locked') map.set(firstOpen.id, 'learning');
    }

    return map;
  }, [studyNodes, data.edges]);

  const defaultNodeId = useMemo(() => {
    const learning = studyNodes.find(
      (n) => learningStateMap.get(n.id) === 'learning',
    );
    return learning?.id ?? studyNodes[0]?.id ?? '';
  }, [studyNodes, learningStateMap]);

  const [mode, setMode] = useState<'focus' | 'cluster'>('focus');
  const [selectedNodeId, setSelectedNodeId] = useState<string>(defaultNodeId);
  const [selectedChapterKey, setSelectedChapterKey] = useState<string>(
    () =>
      (defaultNodeId ? nodeChapterMap.get(defaultNodeId) : undefined) ??
      chapters[0]?.key ??
      '__all__',
  );
  const [history, setHistory] = useState<string[]>([]);
  const [clusterFocusReq, setClusterFocusReq] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  // Sync when courseId changes or incoming focusRequest arrives
  useEffect(() => {
    if (focusRequest?.id && studyById.has(focusRequest.id)) {
      setSelectedNodeId(focusRequest.id);
      const chKey = nodeChapterMap.get(focusRequest.id);
      if (chKey) setSelectedChapterKey(chKey);
      if (mode === 'cluster') {
        setClusterFocusReq({ id: focusRequest.id, nonce: Date.now() });
      }
      return;
    }
    if (!studyById.has(selectedNodeId)) {
      setSelectedNodeId(defaultNodeId);
      setSelectedChapterKey(
        (defaultNodeId ? nodeChapterMap.get(defaultNodeId) : undefined) ??
          chapters[0]?.key ??
          '__all__',
      );
      setHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, focusRequest?.nonce, defaultNodeId]);

  const activeNode = studyById.get(selectedNodeId) ?? studyNodes[0] ?? null;
  const activeChapterKey =
    (activeNode ? nodeChapterMap.get(activeNode.id) : undefined) ??
    chapters[0]?.key ??
    'general';
  const activeChapter =
    chapterByKey.get(
      selectedChapterKey !== '__all__' ? selectedChapterKey : activeChapterKey,
    ) ?? chapters[0];

  // Responsive fitScale for the 900x420 SVG canvas in "Chuỗi bài học"
  const diagramShellRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const shell = diagramShellRef.current;
    if (!shell) return;
    const updateScale = () =>
      setFitScale(Math.min(1, Math.max(0.5, shell.clientWidth / 900)));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [mode]);

  const focusNode = (id: string) => {
    if (!id || id === activeNode?.id || !studyById.has(id)) return;
    if (activeNode) setHistory((prev) => [...prev, activeNode.id]);
    setSelectedNodeId(id);
    const ch = nodeChapterMap.get(id);
    if (ch) setSelectedChapterKey(ch);
  };

  const goBack = () => {
    const prevId = history[history.length - 1];
    if (!prevId) return;
    setHistory((prev) => prev.slice(0, -1));
    setSelectedNodeId(prevId);
    const ch = nodeChapterMap.get(prevId);
    if (ch) setSelectedChapterKey(ch);
  };

  // Compute direct relations for the focused node
  const { localBefore, localAfter, localRelated, crossRelations, crossNodeSet } =
    useMemo(() => {
      const empty = {
        localBefore: [] as KnowledgeGraphNode[],
        localAfter: [] as KnowledgeGraphNode[],
        localRelated: [] as KnowledgeGraphNode[],
        crossRelations: [] as Array<{
          node: KnowledgeGraphNode;
          chapterName: string;
          chapterKey: string;
          direction: string;
        }>,
        crossNodeSet: new Set<string>(),
      };
      if (!activeNode) return empty;

      const curCh = nodeChapterMap.get(activeNode.id);
      const beforeSeen = new Set<string>();
      const afterSeen = new Set<string>();
      const relatedSeen = new Set<string>();
      const crossMap = new Map<
        string,
        { node: KnowledgeGraphNode; direction: string }
      >();

      const localBeforeList: KnowledgeGraphNode[] = [];
      const localAfterList: KnowledgeGraphNode[] = [];
      const localRelatedList: KnowledgeGraphNode[] = [];

      for (const e of data.edges) {
        if (e.type === 'PREREQUISITE') {
          if (e.target === activeNode.id) {
            const src = studyById.get(e.source);
            if (!src) continue;
            if (nodeChapterMap.get(src.id) === curCh) {
              if (!beforeSeen.has(src.id)) {
                beforeSeen.add(src.id);
                localBeforeList.push(src);
              }
            } else if (!crossMap.has(src.id)) {
              crossMap.set(src.id, { node: src, direction: 'Từ cụm' });
            }
          } else if (e.source === activeNode.id) {
            const tgt = studyById.get(e.target);
            if (!tgt) continue;
            if (nodeChapterMap.get(tgt.id) === curCh) {
              if (!afterSeen.has(tgt.id)) {
                afterSeen.add(tgt.id);
                localAfterList.push(tgt);
              }
            } else if (!crossMap.has(tgt.id)) {
              crossMap.set(tgt.id, { node: tgt, direction: 'Đến cụm' });
            }
          }
        } else if (
          e.type === 'RELATED_TO' ||
          e.type === 'DEVELOP' ||
          e.type === 'ASSESS'
        ) {
          const otherId =
            e.source === activeNode.id
              ? e.target
              : e.target === activeNode.id
                ? e.source
                : null;
          if (!otherId) continue;
          const other = studyById.get(otherId);
          if (!other) continue;
          if (nodeChapterMap.get(other.id) === curCh) {
            if (!relatedSeen.has(other.id)) {
              relatedSeen.add(other.id);
              localRelatedList.push(other);
            }
          } else if (!crossMap.has(other.id)) {
            crossMap.set(other.id, { node: other, direction: 'Liên quan' });
          }
        }
      }

      // Compute which study nodes have any cross-session edge (for ⇄ mark)
      const crossSet = new Set<string>();
      for (const e of data.edges) {
        if (
          e.type !== 'PREREQUISITE' &&
          e.type !== 'RELATED_TO' &&
          e.type !== 'DEVELOP' &&
          e.type !== 'ASSESS'
        ) {
          continue;
        }
        const sCh = nodeChapterMap.get(e.source);
        const tCh = nodeChapterMap.get(e.target);
        if (sCh && tCh && sCh !== tCh) {
          crossSet.add(e.source);
          crossSet.add(e.target);
        }
      }

      const crossList = Array.from(crossMap.values()).map(
        ({ node, direction }) => {
          const chKey = nodeChapterMap.get(node.id) ?? 'general';
          const chMeta = chapterByKey.get(chKey) ?? extractChapterMeta(node);
          return {
            node,
            chapterName: chMeta.name,
            chapterKey: chKey,
            direction,
          };
        },
      );

      return {
        localBefore: localBeforeList.slice(0, 4),
        localAfter: localAfterList.slice(0, 4),
        localRelated: localRelatedList.slice(0, 3),
        crossRelations: crossList,
        crossNodeSet: crossSet,
      };
    }, [activeNode, data.edges, studyById, nodeChapterMap, chapterByKey]);

  // Initial expanded IDs for the floating "Cả cụm" D3 canvas:
  // Center = courseRootId (mã môn) -> radiates to Chapters -> expands sub-items!
  const clusterInitialExpanded = useMemo(() => {
    const ids: string[] = [courseRootId];
    if (selectedChapterKey === '__all__') {
      if (studyNodes.length <= 36) {
        chapters.forEach((ch) => ids.push(ch.nodeId));
      } else if (activeChapter) {
        ids.push(activeChapter.nodeId);
      }
    } else {
      const chosen = chapterByKey.get(selectedChapterKey);
      if (chosen) ids.push(chosen.nodeId);
    }
    return ids;
  }, [
    courseRootId,
    selectedChapterKey,
    studyNodes.length,
    chapters,
    activeChapter,
    chapterByKey,
  ]);

  const handleClusterSelectChange = (val: string) => {
    setSelectedChapterKey(val);
    if (val === '__all__') {
      if (mode === 'cluster') {
        setClusterFocusReq({ id: courseRootId, nonce: Date.now() });
      }
      return;
    }
    const ch = chapterByKey.get(val);
    if (!ch) return;
    if (ch.nodeIds.length > 0) {
      const firstInCh =
        ch.nodeIds.find((id) => learningStateMap.get(id) === 'learning') ??
        ch.nodeIds[0];
      setSelectedNodeId(firstInCh);
      setHistory([]);
    }
    if (mode === 'cluster') {
      setClusterFocusReq({ id: ch.nodeId, nonce: Date.now() });
    }
  };

  return (
    <div className="relation-view">
      {/* Top Toolbar matching G4LMS */}
      <div className="relation-toolbar">
        <div className="relation-navigation">
          <button
            type="button"
            onClick={goBack}
            disabled={history.length === 0 || mode === 'cluster'}
          >
            <ArrowLeft size={14} aria-hidden /> Quay lại
          </button>
          <div>
            <span>
              {mode === 'cluster' && selectedChapterKey === '__all__'
                ? courseCode
                : (activeChapter?.name ?? courseCode)}
            </span>
            <ChevronRight size={13} aria-hidden />
            <strong>
              {mode === 'cluster' && selectedChapterKey === '__all__'
                ? 'Toàn bộ cấu trúc môn học'
                : (activeNode?.name ?? courseName)}
            </strong>
          </div>
        </div>

        <div className="relation-toolbar-actions">
          <div className="relation-mode-toggle" aria-label="Phạm vi bản đồ">
            <button
              type="button"
              data-active={mode === 'focus'}
              onClick={() => setMode('focus')}
            >
              Chuỗi bài học
            </button>
            <button
              type="button"
              data-active={mode === 'cluster'}
              onClick={() => {
                setMode('cluster');
                setSelectedChapterKey('__all__');
                setClusterFocusReq({ id: courseRootId, nonce: Date.now() });
              }}
            >
              Cả cụm
            </button>
          </div>

          <label>
            Chọn chương
            <select
              value={
                mode === 'focus' && selectedChapterKey === '__all__'
                  ? (activeChapter?.key ?? chapters[0]?.key ?? '')
                  : selectedChapterKey
              }
              onChange={(e) => handleClusterSelectChange(e.target.value)}
            >
              {mode === 'cluster' && (
                <option value="__all__">Tất cả chương ({courseCode})</option>
              )}
              {chapters.map((ch) => (
                <option key={ch.key} value={ch.key}>
                  {ch.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {mode === 'focus' ? (
        <div className="relation-focus-body">
          {!activeNode ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              Chưa có khái niệm nào trong bản đồ quan hệ.
            </div>
          ) : (
            <>
              <div
                className="relation-diagram-shell"
                ref={diagramShellRef}
                style={{ '--relation-scale': fitScale } as CSSProperties}
              >
                <div className="relation-canvas">
                  <svg viewBox="0 0 900 420" preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <marker
                        id="relation-arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="8"
                        markerHeight="8"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M0,0 L10,5 L0,10 Z" />
                      </marker>
                    </defs>

                    {localBefore.map((node, index) => {
                      const sourceY =
                        relationCardTop(index, localBefore.length) + 34;
                      return (
                        <path
                          key={`before-edge-${node.id}`}
                          className="relation-edge"
                          d={`M240 ${sourceY} H300 V138 H350`}
                          markerEnd="url(#relation-arrow)"
                        />
                      );
                    })}

                    {localAfter.map((node, index) => {
                      const targetY =
                        relationCardTop(index, localAfter.length) + 34;
                      return (
                        <path
                          key={`after-edge-${node.id}`}
                          className="relation-edge"
                          d={`M550 138 H610 V${targetY} H660`}
                          markerEnd="url(#relation-arrow)"
                        />
                      );
                    })}

                    {localRelated.map((node, index) => {
                      const targetX =
                        350 +
                        (index - (localRelated.length - 1) / 2) * 230 +
                        100;
                      return (
                        <path
                          key={`related-edge-${node.id}`}
                          className="relation-edge relation-edge-related"
                          d={`M450 172 V240 H${targetX} V282`}
                        />
                      );
                    })}

                    {localBefore.length > 0 && (
                      <>
                        <rect
                          className="relation-edge-label-bg"
                          x="248"
                          y="124"
                          width="94"
                          height="20"
                          rx="6"
                        />
                        <text
                          className="relation-edge-label"
                          x="295"
                          y="138"
                          textAnchor="middle"
                        >
                          Nên học trước
                        </text>
                      </>
                    )}

                    {localAfter.length > 0 && (
                      <>
                        <rect
                          className="relation-edge-label-bg"
                          x="574"
                          y="124"
                          width="72"
                          height="20"
                          rx="6"
                        />
                        <text
                          className="relation-edge-label"
                          x="610"
                          y="138"
                          textAnchor="middle"
                        >
                          Học tiếp
                        </text>
                      </>
                    )}

                    {localRelated.length > 0 && (
                      <>
                        <rect
                          className="relation-edge-label-bg"
                          x="414"
                          y="204"
                          width="72"
                          height="20"
                          rx="6"
                        />
                        <text
                          className="relation-edge-label"
                          x="450"
                          y="218"
                          textAnchor="middle"
                        >
                          Liên quan
                        </text>
                      </>
                    )}
                  </svg>

                  <span className="relation-column-title" data-column="before">
                    Nên học trước
                  </span>
                  <span className="relation-column-title" data-column="selected">
                    Đang chọn
                  </span>
                  <span className="relation-column-title" data-column="after">
                    Học tiếp
                  </span>

                  {localBefore.length > 0 ? (
                    localBefore.map((node, index) => {
                      const st = learningStateMap.get(node.id) ?? 'unlearned';
                      return (
                        <button
                          key={node.id}
                          type="button"
                          className="relation-node"
                          data-state={st}
                          data-selected="false"
                          onClick={() => focusNode(node.id)}
                          style={
                            {
                              '--relation-x': '40px',
                              '--relation-y': `${relationCardTop(index, localBefore.length)}px`,
                            } as CSSProperties
                          }
                        >
                          <span>
                            <StateIcon state={st} />
                          </span>
                          <strong>{node.name}</strong>
                          {crossNodeSet.has(node.id) && (
                            <em
                              className="relation-cross-mark"
                              aria-label="Có quan hệ liên cụm"
                            >
                              ⇄
                            </em>
                          )}
                          <small>{STATE_LABEL[st]}</small>
                        </button>
                      );
                    })
                  ) : (
                    <span className="relation-empty" data-column="before">
                      Không có bài tiên quyết trong cụm
                    </span>
                  )}

                  {(() => {
                    const st =
                      learningStateMap.get(activeNode.id) ?? 'unlearned';
                    return (
                      <div
                        className="relation-node relation-node-center"
                        data-state={st}
                        data-selected="true"
                        style={
                          {
                            '--relation-x': '350px',
                            '--relation-y': '104px',
                          } as CSSProperties
                        }
                      >
                        <span>
                          <StateIcon state={st} />
                        </span>
                        <strong>{activeNode.name}</strong>
                        <button
                          type="button"
                          className="relation-learn-btn"
                          disabled={st === 'locked'}
                          title={st === 'locked' ? 'Cần hoàn thành bài tiên quyết trước' : 'Vào học bài này'}
                          onClick={() => onStartLearning(activeNode.id)}
                        >
                          {st === 'locked' ? 'Đang khóa' : 'Học'} <ArrowRight size={12} />
                        </button>
                        <small>{STATE_LABEL[st]}</small>
                      </div>
                    );
                  })()}

                  {localAfter.length > 0 ? (
                    localAfter.map((node, index) => {
                      const st = learningStateMap.get(node.id) ?? 'unlearned';
                      return (
                        <button
                          key={node.id}
                          type="button"
                          className="relation-node"
                          data-state={st}
                          data-selected="false"
                          onClick={() => focusNode(node.id)}
                          style={
                            {
                              '--relation-x': '660px',
                              '--relation-y': `${relationCardTop(index, localAfter.length)}px`,
                            } as CSSProperties
                          }
                        >
                          <span>
                            <StateIcon state={st} />
                          </span>
                          <strong>{node.name}</strong>
                          {crossNodeSet.has(node.id) && (
                            <em
                              className="relation-cross-mark"
                              aria-label="Có quan hệ liên cụm"
                            >
                              ⇄
                            </em>
                          )}
                          <small>{STATE_LABEL[st]}</small>
                        </button>
                      );
                    })
                  ) : (
                    <span className="relation-empty" data-column="after">
                      Không có bài tiếp theo trong cụm
                    </span>
                  )}

                  {localRelated.length > 0 && (
                    <span className="relation-related-title">Bài liên quan</span>
                  )}

                  {localRelated.map((node, index) => {
                    const st = learningStateMap.get(node.id) ?? 'unlearned';
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className="relation-node"
                        data-state={st}
                        data-selected="false"
                        onClick={() => focusNode(node.id)}
                        style={
                          {
                            '--relation-x': `${350 + (index - (localRelated.length - 1) / 2) * 230}px`,
                            '--relation-y': '282px',
                          } as CSSProperties
                        }
                      >
                        <span>
                          <StateIcon state={st} />
                        </span>
                        <strong>{node.name}</strong>
                        {crossNodeSet.has(node.id) && (
                          <em
                            className="relation-cross-mark"
                            aria-label="Có quan hệ liên cụm"
                          >
                            ⇄
                          </em>
                        )}
                        <small>{STATE_LABEL[st]}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              {crossRelations.length > 0 && (
                <div className="relation-cross-row">
                  <strong>Quan hệ liên cụm</strong>
                  <div>
                    {crossRelations.map((item) => (
                      <button
                        key={`${item.direction}-${item.node.id}`}
                        type="button"
                        onClick={() => focusNode(item.node.id)}
                      >
                        <span>⇄ {item.chapterName}</span>
                        <strong>{item.node.name}</strong>
                        <small>{item.direction}</small>
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Cả cụm: Giữ thao tác trôi nổi D3 của g4lms-FE, cấu trúc Mã môn -> Buổi học -> Mục nhỏ */
        <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
          <KnowledgeGraphCanvas
            courseId={courseId}
            data={clusterGraph.graph}
            role="student"
            editMode={false}
            rightOpen={false}
            focusRequest={clusterFocusReq}
            initialExpandedIds={clusterInitialExpanded}
            onStartLearning={onStartLearning}
            onFocusInChain={(nodeId) => {
              if (studyById.has(nodeId)) {
                setSelectedNodeId(nodeId);
                const ch = nodeChapterMap.get(nodeId);
                if (ch) setSelectedChapterKey(ch);
              }
              setMode('focus');
            }}
          />
        </div>
      )}
    </div>
  );
}
