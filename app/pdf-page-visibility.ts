export type PdfPageProximity = { nearby: boolean; visible: boolean };

type PageState = PdfPageProximity & { listener: (proximity: PdfPageProximity) => void };

class PdfPageObserverPool {
  private readonly pages = new Map<Element, PageState>();
  private readonly nearbyObserver: IntersectionObserver;
  private readonly visibleObserver: IntersectionObserver;

  constructor(private readonly root: Element) {
    this.nearbyObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => this.update(entry.target, "nearby", entry.isIntersecting));
    }, { root, rootMargin: "560px 0px" });
    this.visibleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => this.update(entry.target, "visible", entry.isIntersecting));
    }, { root, rootMargin: "100px 0px" });
  }

  observe(element: Element, listener: (proximity: PdfPageProximity) => void) {
    this.pages.set(element, { nearby: false, visible: false, listener });
    this.nearbyObserver.observe(element);
    this.visibleObserver.observe(element);
    return () => {
      this.nearbyObserver.unobserve(element);
      this.visibleObserver.unobserve(element);
      this.pages.delete(element);
      if (this.pages.size) return;
      this.nearbyObserver.disconnect();
      this.visibleObserver.disconnect();
      observerPools.delete(this.root);
    };
  }

  private update(element: Element, field: "nearby" | "visible", value: boolean) {
    const state = this.pages.get(element);
    if (!state || state[field] === value) return;
    state[field] = value;
    state.listener({ nearby: state.nearby, visible: state.visible });
  }
}

const observerPools = new WeakMap<Element, PdfPageObserverPool>();

export function observePdfPageProximity(
  element: Element,
  root: Element,
  listener: (proximity: PdfPageProximity) => void,
) {
  let pool = observerPools.get(root);
  if (!pool) {
    pool = new PdfPageObserverPool(root);
    observerPools.set(root, pool);
  }
  return pool.observe(element, listener);
}
