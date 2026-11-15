import { EASE_IN, gsap, useGSAP } from "~/lib/gsap";
import { inViewAtMount } from "~/lib/inView";

type Props = {
  frame: React.RefObject<HTMLElement | null>;
  clip: React.RefObject<HTMLElement | null>;
  inner: React.RefObject<HTMLElement | null>;
};

/**
 * Animation half of <RevealMedia>: a wipe from the bottom while the media settles from 1.1×.
 *
 * The wipe is two opposing transforms instead of an animated clip-path: the clipping layer
 * slides up from one frame-height below while the media inside it slides down by the same
 * amount, so the media holds still and only the clip's edge moves. Same look, but transforms
 * run on the compositor, where a clip-path would repaint the whole image on every frame.
 */
export default function RevealMediaFx({ frame, clip, inner }: Props) {
  useGSAP(() => {
    const el = frame.current;
    const wipe = clip.current;
    const media = inner.current;
    if (!el || !wipe || !media || inViewAtMount(el)) return;
    gsap
      .timeline({
        scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none none" },
        onComplete: () => gsap.set([wipe, media], { clearProps: "transform,willChange" }),
      })
      .fromTo(
        wipe,
        { yPercent: 100, willChange: "transform" },
        { yPercent: 0, duration: 1.2, ease: EASE_IN },
      )
      // The counter-slide must match the clip's exactly (same duration and ease) to cancel it.
      .fromTo(
        media,
        { yPercent: -100, willChange: "transform" },
        { yPercent: 0, duration: 1.2, ease: EASE_IN },
        "<",
      )
      .fromTo(media, { scale: 1.1 }, { scale: 1, duration: 1.4, ease: EASE_IN }, "<");
  });
  return null;
}
