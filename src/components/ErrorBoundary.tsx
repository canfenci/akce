import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Akçe UI ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="auth-screen"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div className="wordmark" style={{ marginBottom: '24px' }}>
            akçe<span>.</span>
          </div>
          <div
            className="data-card"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              Akçe beklenmedik bir sorunla karşılaştı.
            </h2>
            <p style={{ color: 'var(--color-text-secondary, #777d76)', margin: 0, fontSize: '0.9rem' }}>
              Uygulama arayüzünde geçici bir hata oluştu. Verileriniz korunmaktadır.
            </p>
            <button
              onClick={this.handleRetry}
              className="secondary-button"
              style={{
                marginTop: '8px',
                padding: '10px 24px',
                cursor: 'pointer',
              }}
            >
              Tekrar dene
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
