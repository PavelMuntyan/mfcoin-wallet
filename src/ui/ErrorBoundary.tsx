import { Component, ErrorInfo, ReactNode } from 'react';

interface State {
  failed: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Wallet UI failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <main className="wallet-shell"><p className="form-error" role="alert">Wallet view could not be displayed. Lock and reopen the wallet before trying again.</p></main>;
    }
    return this.props.children;
  }
}
