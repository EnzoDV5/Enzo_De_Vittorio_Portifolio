import { frameSrc, pickWidth, type DeviceSequence } from "~/lib/devices";

export type SequencePlayer = {
  /** Draw a (fractional) frame position; cross-fades between neighbouring frames. */
  draw: (position: number) => void;
  /** Stop downloads still in flight and free the decoded frames. */
  dispose: () => void;
  count: number;
};

/**
 * Pixel density the moving canvas is drawn at. A sequence is only ever seen in motion (at rest
 * the full-resolution still takes over), so beyond 1.5× the extra pixels cost GPU memory and
 * fill rate without being seen.
 */
const MOTION_DPR = 1.5;
/** Widest the canvas backing store gets, whatever the screen. */
const MAX_CANVAS = 1280;

type Frame = HTMLImageElement | ImageBitmap;

/**
 * Plays a pre-rendered device sequence on a canvas (adapted from Stack Studio's ImageSequence).
 * Frames load coarse to fine, every 8th first, so a rough motion is ready almost at once, and
 * each draw cross-fades the two frames either side of the position, so it glides rather than
 * steps.
 *
 * Built to keep scrolling smooth on phones as well as laptops:
 * - every frame is decoded once, off the main thread, into an ImageBitmap at exactly the canvas
 *   size, so drawing is a plain copy (no scaling, and no surprise re-decode mid-scroll);
 * - the canvas is drawn at no more than 1.5× density, which keeps 48 frames to a fraction of
 *   the memory full-resolution frames would take;
 * - at rest on the last frame, the canvas steps aside for the still beneath it, which is the
 *   same frame at full resolution, so the device stays crisp once it has settled.
 *
 * The still is the canvas's previous sibling (<DeviceImage lastFrame>).
 */
export function createSequencePlayer(
  canvas: HTMLCanvasElement,
  sequence: DeviceSequence,
  onFirstDraw: () => void,
): SequencePlayer | null {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  const still =
    canvas.previousElementSibling instanceof HTMLElement ? canvas.previousElementSibling : null;
  const dpr = Math.min(window.devicePixelRatio || 1, MOTION_DPR);
  const source = pickWidth(sequence, canvas.clientWidth, dpr);
  const count = sequence.frames;
  canvas.width = Math.min(source, MAX_CANVAS, Math.ceil(canvas.clientWidth * dpr) || source);
  canvas.height = Math.round((canvas.width * sequence.height) / sequence.width);
  context.imageSmoothingQuality = "high";

  const frames = new Array<Frame | undefined>(count);
  const images: HTMLImageElement[] = [];
  let wanted = 0;
  let shown = -1;
  let revealed = false;
  let resting = false;
  let alive = true;

  const nearest = (index: number) => {
    for (let i = index; i >= 0; i--) if (frames[i]) return i;
    for (let i = index + 1; i < count; i++) if (frames[i]) return i;
    return -1;
  };

  /** On the last frame, show the crisp still; anywhere else, the canvas. */
  const rest = (atEnd: boolean) => {
    if (!still || atEnd === resting || !revealed) return;
    resting = atEnd;
    // Same frame on both sides of the swap, so it must be instant: no fade through half-opacity.
    still.style.transition = "none";
    still.style.opacity = atEnd ? "1" : "0";
    canvas.style.visibility = atEnd ? "hidden" : "visible";
  };

  const draw = (position: number) => {
    wanted = Math.min(Math.max(position, 0), count - 1);
    rest(wanted >= count - 1.001 && Boolean(frames[count - 1]));
    if (resting || Math.abs(wanted - shown) < 0.02) return;
    const before = Math.floor(wanted);
    const after = Math.min(before + 1, count - 1);
    const mix = wanted - before;
    const a = frames[before];
    const b = frames[after];
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    if (a && b && mix > 0.04 && mix < 0.96) {
      // Additive drawing of the two weighted frames is an exact blend, transparent edges included.
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 1 - mix;
      context.drawImage(a, 0, 0, width, height);
      context.globalAlpha = mix;
      context.drawImage(b, 0, 0, width, height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    } else {
      const frame = frames[nearest(Math.round(wanted))];
      if (!frame) return;
      context.drawImage(frame, 0, 0, width, height);
    }
    shown = wanted;
    if (!revealed) {
      revealed = true;
      onFirstDraw();
      rest(wanted >= count - 1.001);
    }
  };

  const toBitmap = async (image: HTMLImageElement): Promise<Frame> => {
    if (typeof createImageBitmap !== "function") return image;
    try {
      const bitmap = await createImageBitmap(image, {
        resizeWidth: canvas.width,
        resizeHeight: canvas.height,
        resizeQuality: "high",
        premultiplyAlpha: "premultiply",
      });
      // The bitmap holds the pixels now: let the browser drop the image's own decoded copy.
      image.removeAttribute("src");
      return bitmap;
    } catch {
      return image;
    }
  };

  const order: number[] = [];
  for (const step of [8, 4, 2, 1]) {
    for (let i = 0; i < count; i += step) if (!order.includes(i)) order.push(i);
  }
  if (!order.includes(count - 1)) order.splice(1, 0, count - 1);
  for (const index of order) {
    const image = new window.Image();
    image.decoding = "async";
    image.src = frameSrc(sequence, index, source);
    images[index] = image;
    image
      .decode()
      .then(() => (alive ? toBitmap(image) : null))
      .then((frame) => {
        if (!frame) return;
        if (!alive) {
          if ("close" in frame) frame.close();
          return;
        }
        frames[index] = frame;
        shown = -1;
        draw(wanted);
      })
      .catch(() => undefined);
  }

  return {
    draw,
    count,
    dispose: () => {
      alive = false;
      // Stops frames still downloading (an empty src would request the page itself).
      for (const image of images) image?.removeAttribute("src");
      for (const frame of frames) if (frame && "close" in frame) frame.close();
      frames.fill(undefined);
    },
  };
}
