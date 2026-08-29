"use client";

import { useRef } from "react";

export type LiveController<T extends object> = {
  value: T;
  update: (controller: T) => void;
};

export function createLiveController<T extends object>(initialController: T): LiveController<T> {
  let currentController = initialController;
  const methodCache = new Map<PropertyKey, (...args: unknown[]) => unknown>();
  const value = new Proxy({} as T, {
    get: (_target, property) => {
      const currentValue = Reflect.get(currentController, property, currentController);
      if (typeof currentValue !== "function") return currentValue;
      const cached = methodCache.get(property);
      if (cached) return cached;
      const forward = (...args: unknown[]) => {
        const latestMethod = Reflect.get(currentController, property, currentController);
        if (typeof latestMethod !== "function") throw new TypeError(`Controller member ${String(property)} is no longer callable`);
        return Reflect.apply(latestMethod, currentController, args);
      };
      methodCache.set(property, forward);
      return forward;
    },
    has: (_target, property) => property in currentController,
    ownKeys: () => Reflect.ownKeys(currentController),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(currentController, property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
  return {
    value,
    update: (controller) => { currentController = controller; },
  };
}

/** Keeps context-facing controller and method identities stable while exposing the latest state. */
export function useLiveController<T extends object>(controller: T): T {
  const liveRef = useRef<LiveController<T> | null>(null);
  if (!liveRef.current) liveRef.current = createLiveController(controller);
  liveRef.current.update(controller);
  return liveRef.current.value;
}
