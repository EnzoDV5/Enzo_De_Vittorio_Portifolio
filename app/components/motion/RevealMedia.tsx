import { lazy, useRef } from "react";
import { Island } from "~/components/motion/Island";
import { cn } from "~/lib/cn";
import { useMotionAllowed } from "~/lib/motion";

const RevealMediaFx = lazy(() => import("./fx/RevealMediaFx"));

type Props = { children: React.ReactNode; className?: string; innerClassName?: string };

/**
 * Media that wipes open from the bottom while settling from 1.1× scale. The frame stays put
 * (with its shape and background); a clipping layer inside it does the wipe (RevealMediaFx).
 */
export function RevealMedia({ children, className, innerClassName }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const motion = useMotionAllowed();
  return (
    <>
      <div ref={frame} className={cn("relative overflow-clip", className)}>
        <div ref={clip} className="relative size-full overflow-clip">
          <div ref={inner} className={cn("relative size-full", innerClassName)}>
            {children}
          </div>
        </div>
      </div>
      {/* After the element, not inside it: React attaches a parent's ref only after its
          children's effects run, so an island inside would find the ref still empty. */}
      {motion && (
        <Island>
          <RevealMediaFx frame={frame} clip={clip} inner={inner} />
        </Island>
      )}
    </>
  );
}
