import { Component } from "react";

// A minimal error boundary — React only supports these as class
// components. Used around the 3D preview so a rendering failure
// there (bad geometry, an exhausted WebGL context mid-session, etc.)
// can't blank the rest of the order page, which has no other
// boundary anywhere in the tree.
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

  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
