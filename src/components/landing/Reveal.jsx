"use client";

import { useRef, useSyncExternalStore } from "react";

const inViewCache = new WeakMap();

function isInView(node) {
  return Boolean(node && inViewCache.get(node));
}

function subscribeToInView(node, onStoreChange, threshold) {
  if (!node) return () => {};

  if (typeof IntersectionObserver === "undefined" || isInView(node)) {
    inViewCache.set(node, true);
    onStoreChange();
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          inViewCache.set(node, true);
          onStoreChange();
          observer.disconnect();
          break;
        }
      }
    },
    { threshold, rootMargin: "0px 0px -40px 0px" }
  );

  observer.observe(node);
  return () => observer.disconnect();
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  y = 28,
  className = "",
  children,
  ...props
}) {
  const ref = useRef(null);

  const visible = useSyncExternalStore(
    (onStoreChange) => subscribeToInView(ref.current, onStoreChange, 0.15),
    () => isInView(ref.current),
    () => false
  );

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? "is-revealed" : ""} ${className}`}
      style={{
        "--reveal-delay": `${delay}ms`,
        transform: visible ? "none" : `translateY(${y}px)`,
      }}
      {...props}
    >
      {children}
    </Tag>
  );
}