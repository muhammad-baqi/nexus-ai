// OKLCH -> sRGB conversion (Björn Ottosson's OKLab matrices) used only to compute WCAG contrast
// ratios for app/globals.css's design tokens. Out-of-gamut channels are clamped to [0, 1],
// matching how browsers ultimately clip sRGB rendering — not a full CSS Color 4 gamut-mapping
// implementation, but sufficient for a contrast-ratio regression guard.

export type Oklch = { l: number; c: number; h: number };
type LinearRgb = { r: number; g: number; b: number };

function oklchToLinearSrgb({ l, c, h }: Oklch): LinearRgb {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return { r: clamp(r), g: clamp(g), b: clamp(bLin) };
}

function linearToGamma(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function gammaToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG relative luminance of an opaque oklch() color. */
export function oklchLuminance(color: Oklch): number {
  return relativeLuminance(oklchToLinearSrgb(color));
}

/**
 * WCAG relative luminance of an oklch() color rendered at `alpha` opacity over an opaque
 * oklch() backdrop — e.g. Tailwind's `bg-destructive/10`, as used by the destructive Button
 * variant. Alpha blending happens in gamma-encoded sRGB (matching CSS's default compositing),
 * then the result is converted back to linear for the luminance calculation.
 */
export function oklchLuminanceOverBackdrop(fg: Oklch, alpha: number, backdrop: Oklch): number {
  const fgRgb = oklchToLinearSrgb(fg);
  const bgRgb = oklchToLinearSrgb(backdrop);

  const blendChannel = (fgLinear: number, bgLinear: number) =>
    gammaToLinear(alpha * linearToGamma(fgLinear) + (1 - alpha) * linearToGamma(bgLinear));

  return relativeLuminance({
    r: blendChannel(fgRgb.r, bgRgb.r),
    g: blendChannel(fgRgb.g, bgRgb.g),
    b: blendChannel(fgRgb.b, bgRgb.b),
  });
}

/** WCAG contrast ratio between two relative luminance values. */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
