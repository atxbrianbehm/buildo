import type { AssemblyHallPromptTrace } from "./assemblyHallFixture";

export interface PromptTracePanelProps {
  trace: AssemblyHallPromptTrace;
}

function formatTraceValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return value.map(formatTraceValue).join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

export function PromptTracePanel({ trace }: PromptTracePanelProps) {
  return (
    <section className="prompt-trace" aria-labelledby="prompt-trace-heading">
      <div className="prompt-trace__header">
        <div>
          <p className="project-label">Prompt Diagnostics</p>
          <h2 id="prompt-trace-heading">Prompt Trace</h2>
        </div>
        <dl className="prompt-trace__summary" aria-label="Prompt trace summary">
          <div>
            <dt>Interpreter</dt>
            <dd>{trace.interpreterProvider}</dd>
          </div>
          <div>
            <dt>Preset</dt>
            <dd>{trace.psgPresetId}</dd>
          </div>
          <div>
            <dt>Style Pack</dt>
            <dd>{trace.stylePackId}</dd>
          </div>
          <div>
            <dt>Trace</dt>
            <dd>{trace.traceId}</dd>
          </div>
        </dl>
      </div>
      <div className="prompt-trace__tables">
        <div className="prompt-trace__table-scroll">
          <table aria-label="Requested controls">
            <caption>Requested Controls</caption>
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {trace.requestedControls.map((control) => (
                <tr key={control.name}>
                  <td>{control.name}</td>
                  <td>{formatTraceValue(control.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prompt-trace__table-scroll">
          <table aria-label="Evaluated PSG variables">
            <caption>Evaluated PSG Variables</caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {trace.evaluatedVariables.map((variable) => (
                <tr key={variable.name}>
                  <td>{variable.name}</td>
                  <td>{formatTraceValue(variable.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prompt-trace__table-scroll prompt-trace__table-wide">
          <table aria-label="PSG evaluation trace">
            <caption>PSG Evaluation Trace</caption>
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">Type</th>
                <th scope="col">Semantic Path</th>
                <th scope="col">Output</th>
                <th scope="col">Seed</th>
              </tr>
            </thead>
            <tbody>
              {trace.psgTrace.map((entry) => (
                <tr key={entry.nodeId}>
                  <td>{entry.nodeId}</td>
                  <td>{entry.nodeType}</td>
                  <td>{entry.semanticPath}</td>
                  <td>{formatTraceValue(entry.outputValue)}</td>
                  <td>{entry.seed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prompt-trace__table-scroll prompt-trace__table-wide">
          <table aria-label="Prompt interpreter overrides">
            <caption>Interpreter Overrides</caption>
            <thead>
              <tr>
                <th scope="col">Override</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {trace.interpreterOverrides.map((override) => (
                <tr key={override.name}>
                  <td>{override.name}</td>
                  <td>{formatTraceValue(override.value)}</td>
                </tr>
              ))}
              {trace.interpreterOverrides.length === 0 ? (
                <tr>
                  <td>none</td>
                  <td>none</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
