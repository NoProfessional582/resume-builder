import { useEffect, useState } from 'react';
import { isFinal, type CodexEvent, type Run, type RunStreamEvent } from '../types';

export interface RunStreamState {
  run: Run | null;
  events: { at: number; event: CodexEvent }[];
}

/** Follows a run's live progress over Server-Sent Events until it finishes. */
export function useRunStream(runId: number | null): RunStreamState {
  const [state, setState] = useState<RunStreamState>({ run: null, events: [] });

  useEffect(() => {
    setState({ run: null, events: [] });
    if (runId == null) return;

    const source = new EventSource(`/api/runs/${runId}/stream`);
    source.onmessage = (message) => {
      const data = JSON.parse(message.data) as RunStreamEvent;
      if (data.kind === 'run') {
        setState((s) => ({ ...s, run: data.run }));
        if (isFinal(data.run.status)) source.close();
      } else {
        setState((s) => ({ ...s, events: [...s.events, { at: Date.now(), event: data.event }] }));
      }
    };
    // EventSource reconnects on its own; nothing to do on transient errors.
    return () => source.close();
  }, [runId]);

  return state;
}
