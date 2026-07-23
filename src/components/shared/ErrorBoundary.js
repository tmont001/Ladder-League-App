import React from 'react';
import { reportClientError } from '../../lib/reportError';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const errorId = Date.now().toString(36);
    this.setState({ errorId });
    reportClientError(error, {
      screen:    this.props.screen || 'unknown',
      component: info?.componentStack?.split('\n')[1]?.trim(),
      leagueId:  this.props.leagueId,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-message">
            Something went wrong. Try reloading the page.
            {this.state.errorId && (
              <div className="error-boundary-id">
                Error ID: {this.state.errorId}
              </div>
            )}
          </div>
          <div className="error-boundary-actions">
            <button
              className="btn-next"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            {this.props.onHome && (
              <button
                className="btn-back"
                onClick={this.props.onHome}
              >
                Go Home
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
