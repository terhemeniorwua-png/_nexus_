"use client";

import { useCallback, useRef } from "react";

export function TiltCard({
  maxTilt = 8,
  scale = 1.02,
  magnetic = false,
  className = "",
  children,
}) {
  const ref = useRef(null);

  const handleMove = useCallback(
    (event) => {
      if (event.pointerType === "touch") return;
      const node = ref.current;
      if (!node) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;

      const rx = (0.5 - py) * maxTilt * 2;
      const ry = (px - 0.5) * maxTilt * 2;

      let translate = "";
      if (magnetic) {
        const mx = (px - 0.5) * 14;
        const my = (py - 0.5) * 14;
        translate = `translate3d(${mx}px, ${my}px, 0) `;
      }

      node.style.transform = `${translate}perspective(1000px) rotateX(${rx.toFixed(
        2
      )}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    },
    [maxTilt, scale, magnetic]
  );

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.transform = "";
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`hero-tilt ${className}`}
    >
      {children}
    </div>
  );
}