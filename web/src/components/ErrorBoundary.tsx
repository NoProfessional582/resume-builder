import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Shows a message instead of a blank page when a page crashes. Reset by changing `resetKey`. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        <p className="font-semibold">Something went wrong on this page.</p>
        <p className="mt-1">Your data is saved on the server; reloading usually fixes it.</p>
        <pre className="mt-3 overflow-auto rounded bg-white/70 p-2 text-xs text-red-800">{this.state.error.message}</pre>
        <button
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }
}
