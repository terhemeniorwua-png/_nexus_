export function GradientMesh() {
  return (
    <div aria-hidden="true" className="hero-canvas">
      <div className="hero-dotgrid" />
      <div
        className="hero-glow"
        style={{
          width: 560,
          height: 560,
          left: "-12%",
          top: "-18%",
          background:
            "radial-gradient(closest-side, rgba(99, 102, 241, 0.45), transparent)",
        }}
      />
      <div
        className="hero-glow"
        style={{
          width: 620,
          height: 620,
          right: "-14%",
          top: "4%",
          background:
            "radial-gradient(closest-side, rgba(139, 92, 246, 0.38), transparent)",
          animationDelay: "-6s",
        }}
      />
      <div
        className="hero-glow"
        style={{
          width: 520,
          height: 520,
          left: "48%",
          top: "52%",
          background:
            "radial-gradient(closest-side, rgba(79, 70, 229, 0.35), transparent)",
          animationDelay: "-11s",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{
          background: "linear-gradient(to top, #09090b, transparent)",
        }}
      />
    </div>
  );
}