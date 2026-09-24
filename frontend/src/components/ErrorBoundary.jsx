import { Component } from "react";

// A minimal error boundary — React only supports these as class
// components. Used around the previews, and around each screen, so a
// rendering failure (bad geometry, an exhausted WebGL context, an
// order with unexpected data) can't blank the whole app. fallback is
// what to show instead: a node, or a function of (error, reset) where
// reset tries the children again.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      return typeof fallback === "function" ? fallback(this.state.error, this.reset) : (fallback ?? null);
    }
    return this.props.children;
  }
}
