export const frag = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uSpeed;
uniform float uSymmetry;
uniform int   uShapeType;
uniform vec3  uPalette[4];
uniform float uAspect;

varying vec2 vUv;

#define PI 3.14159265358979323846

// ── Helpers ──────────────────────────────────────────────────────────────────

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453);
}

// ── Pattern 0: Circuits ───────────────────────────────────────────────────────
// Grid-based circuit traces with branching lines

float circuits(vec2 p, float t) {
  p *= 4.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float v = 0.0;

  // Horizontal trace
  float h = hash(ip);
  if (h > 0.4) {
    float traceY = 0.5 + sin(t * 0.7 + h * 6.28) * 0.05;
    v += smoothstep(0.06, 0.0, abs(fp.y - traceY)) * smoothstep(0.0, 0.15, fp.x) * smoothstep(1.0, 0.85, fp.x);
  }

  // Vertical trace
  float v2 = hash(ip + vec2(7.3, 2.1));
  if (v2 > 0.4) {
    float traceX = 0.5 + cos(t * 0.5 + v2 * 6.28) * 0.05;
    v += smoothstep(0.06, 0.0, abs(fp.x - traceX)) * smoothstep(0.0, 0.15, fp.y) * smoothstep(1.0, 0.85, fp.y);
  }

  // Junction nodes
  float n = hash(ip + vec2(3.7, 9.1));
  if (n > 0.6) {
    vec2 nodePos = vec2(0.5);
    float d = length(fp - nodePos);
    v += smoothstep(0.12, 0.04, d) * (0.6 + 0.4 * sin(t * 2.0 + n * 10.0));
  }

  // Diagonal accent
  float d = hash(ip + vec2(13.1, 4.7));
  if (d > 0.7) {
    float diag = fp.x - fp.y;
    v += smoothstep(0.05, 0.0, abs(diag)) * 0.5;
  }

  // Pulse travel along traces
  float pulse = hash(ip + vec2(1.1, 8.3));
  if (pulse > 0.5) {
    float px = fract(fp.x - t * (0.3 + pulse * 0.4));
    v += smoothstep(0.12, 0.0, abs(fp.y - 0.5)) * smoothstep(0.05, 0.0, abs(px - 0.5)) * 1.5;
  }

  return clamp(v, 0.0, 1.0);
}

// ── Pattern 1: Crystals ───────────────────────────────────────────────────────
// Voronoi with sharp facets and animated cells

float crystals(vec2 p, float t) {
  p *= 3.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float minDist = 8.0;
  float secondDist = 8.0;
  vec2 minCell = vec2(0.0);

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cell = ip + neighbor;
      vec2 h = hash2(cell);
      // Animate cell centers
      vec2 cellPos = neighbor + h * 0.5 + 0.25 + 0.25 * sin(t * 0.4 + h * 6.28);
      float d = length(fp - cellPos);
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
        minCell = cell;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  // Edge sharpness
  float edge = secondDist - minDist;
  float facet = smoothstep(0.0, 0.08, edge);

  // Inner cell gradient based on angle
  float cellHash = hash(minCell);
  float innerPattern = sin(minDist * 12.0 + t * 0.6 + cellHash * 6.28) * 0.5 + 0.5;

  return mix(innerPattern * facet, 1.0 - smoothstep(0.0, 0.04, edge), 0.3);
}

// ── Pattern 2: Plasma ─────────────────────────────────────────────────────────
// Layered sine waves — smooth iridescent flow

float plasma(vec2 p, float t) {
  float v = 0.0;
  v += sin(p.x * 3.0 + t);
  v += sin(p.y * 3.0 + t * 0.7);
  v += sin((p.x + p.y) * 2.5 + t * 0.5);
  v += sin(length(p) * 5.0 - t * 0.8);
  v += sin(p.x * 2.0 + sin(p.y * 1.5 + t * 0.3) + t * 0.4);
  v += sin(p.y * 2.5 + sin(p.x * 2.0 - t * 0.4) + t * 0.6);
  return v * 0.5 / 3.0 + 0.5;
}

// ── Pattern 3: Geometric ──────────────────────────────────────────────────────
// Repeating hexagonal SDF grid with clean edges

float hexDist(vec2 p) {
  p = abs(p);
  float c = dot(p, normalize(vec2(1.0, 1.732)));
  return max(c, p.x);
}

float geometric(vec2 p, float t) {
  p *= 3.0;

  // Hex grid repeat
  vec2 hexSize = vec2(1.0, 1.732);
  vec2 a = mod(p, hexSize) - hexSize * 0.5;
  vec2 b = mod(p - hexSize * 0.5, hexSize) - hexSize * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;

  float d = hexDist(gv);
  float hexSize2 = 0.42;

  // Animated rings
  float ring = smoothstep(hexSize2, hexSize2 - 0.03, d) - smoothstep(hexSize2 - 0.06, hexSize2 - 0.09, d);

  // Inner pulse
  vec2 ip = floor(p / hexSize);
  float h = hash(ip);
  float pulse = sin(t * 0.8 + h * 6.28) * 0.5 + 0.5;
  float inner = smoothstep(hexSize2 - 0.12, hexSize2 - 0.18, d) * pulse;

  // Outer glow
  float glow = smoothstep(0.6, 0.0, d) * 0.15;

  return clamp(ring + inner * 0.6 + glow, 0.0, 1.0);
}

// ── Palette mapping ───────────────────────────────────────────────────────────

vec3 paletteColor(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  int i = int(t);
  float f = fract(t);
  if (i == 0) return mix(uPalette[0], uPalette[1], f);
  if (i == 1) return mix(uPalette[1], uPalette[2], f);
  return mix(uPalette[2], uPalette[3], f);
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = vUv;

  // Centered, aspect-corrected
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  // Polar coords
  float r = length(p);
  float a = atan(p.y, p.x);

  // Kaleidoscope fold
  float segAngle = PI * 2.0 / uSymmetry;
  a = mod(a, segAngle);
  if (a > segAngle * 0.5) a = segAngle - a;

  // Back to Cartesian
  p = vec2(cos(a), sin(a)) * r;

  float animTime = uTime * uSpeed;

  float v;
  if (uShapeType == 0)      v = circuits(p, animTime);
  else if (uShapeType == 1) v = crystals(p, animTime);
  else if (uShapeType == 2) v = plasma(p, animTime);
  else                      v = geometric(p, animTime);

  vec3 col = paletteColor(v);

  // Subtle radial vignette
  col *= 1.0 - smoothstep(0.3, 0.7, r * 1.2);

  gl_FragColor = vec4(col, 1.0);
}
`
