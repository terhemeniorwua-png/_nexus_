"use client";

import { useRef, useSyncExternalStore } from "react";
import type { ElementType, ReactNode, HTMLAttributes } from "react";

const inViewCache = new WeakMap<Element, boolean>();

function isInView(node: Element | null | undefined) {
  return Boolean(node && inViewCache.get(node));
}

function subscribeToInView(node: Element | null | undefined, onStoreChange: () => void, threshold: number) {
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

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  delay?: number;
  y?: number;
  className?: string;
  children: ReactNode;
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  y = 28,
  className = "",
  children,
  ...props
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

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
      } as any}
      {...props}
    >
      {children}
    </Tag>
  );
}