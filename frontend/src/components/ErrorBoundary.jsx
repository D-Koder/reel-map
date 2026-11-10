import React from 'react';
import { reportCrash } from '../lib/sentry';

// Catches a crash anywhere in the app, reports it, and shows a way out instead of a blank screen.
export default class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportCrash(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-screen" role="alert">
        <p><strong>Something went wrong.</strong></p>
        <p>We've been told about it. Reloading usually fixes it.</p>
        <button type="button" className="step-btn primary" onClick={() => window.location.reload()}>Reload</button>
        <p><a href="/support" target="_blank" rel="noreferrer">Help and support</a></p>
      </div>
    );
  }
}
