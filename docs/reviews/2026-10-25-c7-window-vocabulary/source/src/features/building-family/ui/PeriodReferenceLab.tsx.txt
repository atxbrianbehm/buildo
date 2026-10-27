import { useId, useMemo, useState } from "react";
import {
  createPeriodComparisonNotes,
  listPeriodReferenceEntries,
  periodReferenceCatalog,
  periodReferenceImageUrl,
  type PeriodComparisonRubricStatus,
  type PeriodReferenceEntry
} from "../qa/periodReferenceCatalog";

export interface PeriodReferenceLabProps {
  fidelityMode?: "proof" | "kit";
  seeds?: {
    family: string;
    building: string;
    material: string;
    trim: string;
  };
  onOpenAssemblyHall?: () => void;
}

type PriorityFilter = "all" | PeriodReferenceEntry["priority"];
type CollectionFilter = "all" | PeriodReferenceEntry["collection"];

function downloadJsonFile(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function defaultScores(): Record<string, PeriodComparisonRubricStatus> {
  return Object.fromEntries(
    periodReferenceCatalog.rubric.map((item) => [item.id, "not-reviewed" as const])
  );
}

export function PeriodReferenceLab({
  fidelityMode = "kit",
  seeds,
  onOpenAssemblyHall
}: PeriodReferenceLabProps) {
  const priorityId = useId();
  const collectionId = useId();
  const notesId = useId();

  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("primary");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [selectedId, setSelectedId] = useState<string>(() => {
    const primary = listPeriodReferenceEntries({ priority: "primary" });
    return primary[0]?.id ?? periodReferenceCatalog.entries[0]!.id;
  });
  const [scores, setScores] = useState<Record<string, PeriodComparisonRubricStatus>>(defaultScores);
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});
  const [freeformNotes, setFreeformNotes] = useState("");

  const entries = useMemo(
    () =>
      listPeriodReferenceEntries({
        priority: priorityFilter,
        collection: collectionFilter
      }),
    [priorityFilter, collectionFilter]
  );

  const selected =
    entries.find((entry) => entry.id === selectedId) ??
    periodReferenceCatalog.entries.find((entry) => entry.id === selectedId) ??
    entries[0] ??
    periodReferenceCatalog.entries[0]!;

  const imageUrl = periodReferenceImageUrl(selected);

  const exportNotes = () => {
    const notes = createPeriodComparisonNotes({
      referenceId: selected.id,
      presentationMode: "clay",
      fidelityMode,
      seeds,
      screenshotTargetRoute: "#room=assemblyHall",
      rubricScores: periodReferenceCatalog.rubric.map((item) => ({
        id: item.id,
        status: scores[item.id] ?? "not-reviewed",
        notes: scoreNotes[item.id]?.trim() || undefined
      })),
      freeformNotes: freeformNotes.trim() || undefined
    });
    downloadJsonFile(`${selected.id}-period-comparison.json`, notes);
  };

  return (
    <section className="period-ref-lab" aria-labelledby="period-ref-lab-heading">
      <header className="period-ref-lab__header">
        <h2 id="period-ref-lab-heading">{periodReferenceCatalog.label}</h2>
        <p className="period-ref-lab__lede">
          Side-by-side photo references from <code>docs/ref</code> and the HABS pack. Score kit-mode clay
          against real facades; export notes next to a Visual QA packet. This does not drive structure.
        </p>
        <dl className="period-ref-lab__summary" aria-label="Period reference catalog summary">
          <div>
            <dt>Catalog</dt>
            <dd>{periodReferenceCatalog.id}</dd>
          </div>
          <div>
            <dt>Entries</dt>
            <dd>{periodReferenceCatalog.entries.length}</dd>
          </div>
          <div>
            <dt>Showing</dt>
            <dd>{entries.length}</dd>
          </div>
          <div>
            <dt>Fidelity</dt>
            <dd>{fidelityMode}</dd>
          </div>
          <div>
            <dt>Protocol</dt>
            <dd>{periodReferenceCatalog.compareProtocol.presentation}</dd>
          </div>
        </dl>
      </header>

      <div className="period-ref-lab__controls">
        <label htmlFor={priorityId}>
          Priority
          <select
            id={priorityId}
            aria-label="Period reference priority filter"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
          >
            <option value="all">All</option>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="detail">Detail</option>
            <option value="context">Context</option>
          </select>
        </label>
        <label htmlFor={collectionId}>
          Collection
          <select
            id={collectionId}
            aria-label="Period reference collection filter"
            value={collectionFilter}
            onChange={(event) => setCollectionFilter(event.target.value as CollectionFilter)}
          >
            <option value="all">All</option>
            <option value="user">docs/ref (user)</option>
            <option value="habs">HABS / LOC pack</option>
          </select>
        </label>
        {onOpenAssemblyHall ? (
          <button type="button" className="period-ref-lab__action" onClick={onOpenAssemblyHall}>
            Open Assembly Hall
          </button>
        ) : null}
        <button type="button" className="period-ref-lab__action" onClick={exportNotes}>
          Download comparison notes
        </button>
      </div>

      <div className="period-ref-lab__layout">
        <aside className="period-ref-lab__list" aria-label="Period reference list">
          {entries.length === 0 ? (
            <p className="period-ref-lab__empty">No references match these filters.</p>
          ) : (
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={
                      entry.id === selected.id
                        ? "period-ref-lab__list-item period-ref-lab__list-item--active"
                        : "period-ref-lab__list-item"
                    }
                    aria-current={entry.id === selected.id ? "true" : undefined}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span className="period-ref-lab__list-title">{entry.title}</span>
                    <span className="period-ref-lab__list-meta">
                      {entry.priority} · {entry.collection}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="period-ref-lab__main">
          <figure className="period-ref-lab__figure" aria-label={`Reference photo ${selected.title}`}>
            <img
              src={imageUrl}
              alt={selected.title}
              className="period-ref-lab__image"
              loading="lazy"
            />
            <figcaption>
              <strong>{selected.title}</strong>
              <span>
                {selected.priority} · {selected.collection} · {selected.file}
              </span>
            </figcaption>
          </figure>

          <section className="period-ref-lab__section" aria-labelledby="period-ref-lookfor-heading">
            <h3 id="period-ref-lookfor-heading">Look for</h3>
            <ul>
              {selected.lookFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="period-ref-lab__rights">{selected.rightsNote}</p>
          </section>

          <section className="period-ref-lab__section" aria-labelledby="period-ref-protocol-heading">
            <h3 id="period-ref-protocol-heading">Compare protocol</h3>
            <dl className="period-ref-lab__protocol" aria-label="Compare protocol">
              <div>
                <dt>Presentation</dt>
                <dd>{periodReferenceCatalog.compareProtocol.presentation}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{periodReferenceCatalog.compareProtocol.camera}</dd>
              </div>
              <div>
                <dt>Lighting</dt>
                <dd>{periodReferenceCatalog.compareProtocol.lighting}</dd>
              </div>
            </dl>
          </section>

          <section className="period-ref-lab__section" aria-labelledby="period-ref-rubric-heading">
            <h3 id="period-ref-rubric-heading">Manual rubric</h3>
            <div className="period-ref-lab__rubric" role="list" aria-label="Period comparison rubric">
              {periodReferenceCatalog.rubric.map((item) => (
                <div key={item.id} className="period-ref-lab__rubric-row" role="listitem">
                  <div className="period-ref-lab__rubric-copy">
                    <strong>{item.label}</strong>
                    <p>{item.prompt}</p>
                  </div>
                  <label className="period-ref-lab__rubric-score">
                    Score
                    <select
                      aria-label={`Rubric score ${item.label}`}
                      value={scores[item.id] ?? "not-reviewed"}
                      onChange={(event) =>
                        setScores((prev) => ({
                          ...prev,
                          [item.id]: event.target.value as PeriodComparisonRubricStatus
                        }))
                      }
                    >
                      <option value="not-reviewed">Not reviewed</option>
                      <option value="pass">Pass</option>
                      <option value="partial">Partial</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  <label className="period-ref-lab__rubric-note">
                    Note
                    <input
                      type="text"
                      aria-label={`Rubric note ${item.label}`}
                      value={scoreNotes[item.id] ?? ""}
                      onChange={(event) =>
                        setScoreNotes((prev) => ({
                          ...prev,
                          [item.id]: event.target.value
                        }))
                      }
                      placeholder="Optional"
                    />
                  </label>
                </div>
              ))}
            </div>
            <label className="period-ref-lab__freeform" htmlFor={notesId}>
              Freeform notes
              <textarea
                id={notesId}
                aria-label="Period comparison freeform notes"
                rows={3}
                value={freeformNotes}
                onChange={(event) => setFreeformNotes(event.target.value)}
                placeholder="Overall clay vs photo notes…"
              />
            </label>
          </section>
        </div>
      </div>
    </section>
  );
}
