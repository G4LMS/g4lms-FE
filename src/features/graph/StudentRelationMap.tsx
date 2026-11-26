import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';
import { buildChapterClusterGraph } from './graphHierarchy';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

interface Props {
  courseId: string;
  courseCode: string;
  courseName: string;
  data: KnowledgeGraphData;
  rightOpen: boolean;
  focusRequest?: { id: string; nonce: number } | null;
  onStartLearning: (nodeId: string) => void;
}

type ProgressFilter = 'all' | 'learned' | 'unlearned';

function isNodeLearned(node: KnowledgeGraphNode): boolean {
  const p = (node.properties ?? {}) as Record<string, unknown>;
  return (
    p.learning_state === 'mastered' ||
    p.learningState === 'mastered' ||
    (typeof p.mastery === 'number' && p.mastery >= 70) ||
    p.status === 'mastered'
  );
}

export function StudentRelationMap({
  courseId,
  courseCode,
  courseName,
  data,
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

  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  const [selectedChapterKey, setSelectedChapterKey] = useState<string>('__all__');
  const [clusterFocusReq, setClusterFocusReq] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  const scopedStudyNodes = useMemo(() => {
    if (selectedChapterKey === '__all__') return studyNodes;
    const chIds = new Set(chapterByKey.get(selectedChapterKey)?.nodeIds ?? []);
    return studyNodes.filter((n) => chIds.has(n.id));
  }, [studyNodes, selectedChapterKey, chapterByKey]);

  const learnedCount = useMemo(
    () => scopedStudyNodes.filter((n) => isNodeLearned(n)).length,
    [scopedStudyNodes],
  );
  const unlearnedCount = scopedStudyNodes.length - learnedCount;

  useEffect(() => {
    if (focusRequest?.id && studyById.has(focusRequest.id)) {
      const chKey = nodeChapterMap.get(focusRequest.id);
      if (chKey) setSelectedChapterKey(chKey);
      setClusterFocusReq({ id: focusRequest.id, nonce: Date.now() });
      return;
    }
    setSelectedChapterKey('__all__');
    setClusterFocusReq(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, focusRequest?.nonce, courseRootId]);

  const filteredGraph = useMemo<KnowledgeGraphData>(() => {
    if (progressFilter === 'all' && selectedChapterKey === '__all__') {
      return clusterGraph.graph;
    }
    const allowedChapters =
      selectedChapterKey === '__all__'
        ? chapters
        : chapters.filter((ch) => ch.key === selectedChapterKey);
    const chapterStudyIds = new Set(allowedChapters.flatMap((ch) => ch.nodeIds));
    const matchingStudyIds = new Set(
      studyNodes
        .filter((n) => {
          if (!chapterStudyIds.has(n.id)) return false;
          if (progressFilter === 'learned') return isNodeLearned(n);
          if (progressFilter === 'unlearned') return !isNodeLearned(n);
          return true;
        })
        .map((n) => n.id),
    );
    const keptChapterNodeIds = new Set(
      allowedChapters
        .filter((ch) => ch.nodeIds.some((id) => matchingStudyIds.has(id)))
        .map((ch) => ch.nodeId),
    );
    const keptIds = new Set<string>([
      courseRootId,
      ...keptChapterNodeIds,
      ...matchingStudyIds,
    ]);
    return {
      nodes: clusterGraph.graph.nodes.filter((n) => keptIds.has(n.id)),
      edges: clusterGraph.graph.edges.filter(
        (e) => keptIds.has(e.source) && keptIds.has(e.target),
      ),
    };
  }, [clusterGraph.graph, progressFilter, selectedChapterKey, studyNodes, chapters, courseRootId]);

  const activeChapter =
    selectedChapterKey !== '__all__'
      ? (chapterByKey.get(selectedChapterKey) ?? chapters[0])
      : chapters[0];

  // Initial expanded IDs for the floating "Cả cụm" D3 canvas:
  // Center = courseRootId (mã môn) -> radiates to Chapters -> expands sub-items!
  const clusterInitialExpanded = useMemo(() => {
    const ids: string[] = [courseRootId];
    if (selectedChapterKey !== '__all__') {
      const chosen = chapterByKey.get(selectedChapterKey);
      if (chosen) ids.push(chosen.nodeId);
      return ids;
    }
    if (progressFilter !== 'all') {
      chapters.forEach((ch) => ids.push(ch.nodeId));
      return ids;
    }
    if (studyNodes.length <= 36) {
      chapters.forEach((ch) => ids.push(ch.nodeId));
    } else if (activeChapter) {
      ids.push(activeChapter.nodeId);
    }
    return ids;
  }, [
    courseRootId,
    progressFilter,
    selectedChapterKey,
    studyNodes.length,
    chapters,
    activeChapter,
    chapterByKey,
  ]);

  const handleClusterSelectChange = (val: string) => {
    setSelectedChapterKey(val);
    setClusterFocusReq(null);
  };

  return (
    <div className="relation-view">
      <div className="relation-toolbar">
        <div className="relation-navigation">
          <div>
            <span>
              {selectedChapterKey === '__all__'
                ? courseCode
                : (activeChapter?.name ?? courseCode)}
            </span>
            <ChevronRight size={13} aria-hidden />
            <strong>
              {selectedChapterKey === '__all__'
                ? 'Toàn bộ cấu trúc môn học'
                : `${activeChapter?.nodeIds.length ?? 0} bài học`}
            </strong>
          </div>
        </div>

        <div className="relation-toolbar-actions">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: '#475569',
            }}
            aria-label="Chú thích trạng thái học"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              Đã học
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              Chưa học
            </span>
          </div>

          <div className="relation-mode-toggle" role="group" aria-label="Lọc trạng thái học">
            <button
              type="button"
              data-active={progressFilter === 'all'}
              onClick={() => {
                setProgressFilter('all');
                setClusterFocusReq(null);
              }}
            >
              Tất cả ({scopedStudyNodes.length})
            </button>
            <button
              type="button"
              data-active={progressFilter === 'learned'}
              onClick={() => {
                setProgressFilter('learned');
                setClusterFocusReq(null);
              }}
            >
              Đã học ({learnedCount})
            </button>
            <button
              type="button"
              data-active={progressFilter === 'unlearned'}
              onClick={() => {
                setProgressFilter('unlearned');
                setClusterFocusReq(null);
              }}
            >
              Chưa học ({unlearnedCount})
            </button>
          </div>

          <label>
            Chọn cụm
            <select
              value={selectedChapterKey}
              onChange={(e) => handleClusterSelectChange(e.target.value)}
            >
              <option value="__all__">Tất cả chương ({courseCode})</option>
              {chapters.map((ch) => (
                <option key={ch.key} value={ch.key}>
                  {ch.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
        <KnowledgeGraphCanvas
          courseId={courseId}
          data={filteredGraph}
          role="student"
          editMode={false}
          rightOpen={false}
          focusRequest={clusterFocusReq}
          initialExpandedIds={clusterInitialExpanded}
          defaultShowAll
          onStartLearning={onStartLearning}
        />
      </div>
    </div>
  );
}
