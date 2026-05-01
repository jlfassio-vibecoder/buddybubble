'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { resetKey: string; children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class WrapperErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[WrapperErrorBoundary]', error, info.componentStack);
    }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="p-4 text-sm text-red-200">Wrapper failed to render.</div>
        )
      );
    }
    return this.props.children;
  }
}
