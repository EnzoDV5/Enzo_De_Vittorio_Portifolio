import Lenis from "lenis";
import { useEffect, useRef } from "react";
import { ScrollTrigger, gsap } from "~/lib/gsap";

/** Creates Lenis on GSAP's ticker and hands it up. Destroyed on unmount (e.g. reduced motion). */
export default function LenisFx({ onReady }: { onReady: (lenis: Lenis | null) => void }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: false,
      anchors: { offset: -80 },
      lerp: 0.11,
      // Nested scrollers (the mobile menu, the contact textarea) opt out with data-lenis-prevent.
      // That's cheaper than allowNestedScroll, which inspects the styles of every element under
      // the pointer on every wheel event.
    });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    onReady(lenis);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      onReady(null);
    };
  }, [onReady]);

  // ScrollTriggers measure their start and end once, but pages keep settling after the islands
  // mount: web fonts swap in, images decode, sections grow when motion turns on. Whenever the
  // page height changes, re-measure every trigger, in page order (pins add height below them),
  // so the device stage and the pinned gallery start where their sections actually are.
  // A refresh mid-scroll can shift a pin under the reader's thumb, so it waits for the page to
  // be still (and changes that arrive together are measured once).
  useEffect(() => {
    let timer = 0;
    let live = true;
    let height = document.body.offsetHeight;
    const refresh = () => {
      if (!live) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!live) return;
        if (lenisRef.current?.isScrolling) return refresh();
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
        height = document.body.offsetHeight;
      }, 160);
    };
    const observer = new ResizeObserver(() => {
      if (document.body.offsetHeight !== height) refresh();
    });
    observer.observe(document.body);
    void document.fonts.ready.then(refresh);
    return () => {
      live = false;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  return null;
}
