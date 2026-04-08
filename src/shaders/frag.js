export const frag = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uSpeed;
uniform float uSymmetry;
uniform int   uShapeType;
uniform vec3  uPalette[4];
uniform float uAspect;

uniform float uHueShift;
uniform float uHueAngle;
uniform float uBrightness;
uniform float uContrast;
uniform vec3  uBgColor;
uniform float uZoomPulse;
uniform float uRotOffset;
uniform float uWarp;
uniform float uGlitch;

varying vec2 vUv;

#define PI  3.14159265358979323846
#define TAU 6.28318530717958647692

// ── Helpers ────────────────────────────────────────────────────────────────

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453);
}

vec3 hueRotate(vec3 col, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  vec3 k = vec3(0.57735026919);
  return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

// ── Pattern 0: Circuits ────────────────────────────────────────────────────

float circuits(vec2 p, float t) {
  p *= 4.5;
  vec2 ip = floor(p), fp = fract(p);
  float v = 0.0;

  float h = hash(ip);
  if (h > 0.28) {
    float y0 = 0.5 + sin(t * 0.7 + h * TAU) * 0.07;
    v += smoothstep(0.055, 0.0, abs(fp.y - y0)) * smoothstep(0.0,0.1,fp.x) * smoothstep(1.0,0.88,fp.x);
  }
  float h2 = hash(ip + vec2(7.3, 2.1));
  if (h2 > 0.28) {
    float x0 = 0.5 + cos(t * 0.5 + h2 * TAU) * 0.07;
    v += smoothstep(0.055, 0.0, abs(fp.x - x0)) * smoothstep(0.0,0.1,fp.y) * smoothstep(1.0,0.88,fp.y);
  }
  float n = hash(ip + vec2(3.7, 9.1));
  if (n > 0.45) {
    float d = length(fp - 0.5);
    v += smoothstep(0.13, 0.04, d) * (0.5 + 0.5*sin(t*2.8 + n*11.0));
    v += smoothstep(0.24, 0.14, d) * 0.3;
  }
  float diag = hash(ip + vec2(13.1, 4.7));
  if (diag > 0.62) {
    v += smoothstep(0.04, 0.0, abs(fp.x - fp.y)) * 0.55;
    v += smoothstep(0.04, 0.0, abs(fp.x + fp.y - 1.0)) * 0.55;
  }
  float pulse = hash(ip + vec2(1.1, 8.3));
  if (pulse > 0.42) {
    float trav = fract(fp.x - t * (0.35 + pulse * 0.5));
    v += smoothstep(0.09, 0.0, abs(fp.y - 0.5)) * smoothstep(0.038, 0.0, abs(trav - 0.5)) * 2.0;
  }
  return clamp(v, 0.0, 1.0);
}

// ── Pattern 1: Crystals ────────────────────────────────────────────────────

float crystals(vec2 p, float t) {
  p *= 3.2;
  vec2 ip = floor(p), fp = fract(p);
  float minD = 8.0, secD = 8.0;
  vec2 minCell = vec2(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 nb = vec2(float(x), float(y));
      vec2 cell = ip + nb;
      vec2 h = hash2(cell);
      vec2 cp = nb + h*0.5 + 0.25 + 0.25*sin(t*0.32 + h*TAU);
      float d = length(fp - cp);
      if (d < minD) { secD = minD; minD = d; minCell = cell; }
      else if (d < secD) { secD = d; }
    }
  }
  float edge = secD - minD;
  float ch = hash(minCell);
  float inner = sin(minD*15.0 + t*0.8 + ch*TAU) * 0.5 + 0.5;
  float facet = sin(minD*9.0 - t*0.5 + ch*PI) * 0.5 + 0.5;
  float edgeGlow = smoothstep(0.06, 0.0, edge);
  float sheen = smoothstep(0.15, 0.0, edge) * 0.4;
  return mix(inner*0.55 + facet*0.45, edgeGlow, 0.4) + sheen;
}

// ── Pattern 2: Plasma ──────────────────────────────────────────────────────

float plasma(vec2 p, float t) {
  float v = sin(p.x*3.2 + t)
          + sin(p.y*3.0 + t*0.72)
          + sin((p.x+p.y)*2.6 + t*0.48)
          + sin(length(p)*5.5 - t*0.9)
          + sin(p.x*2.1 + sin(p.y*1.6 + t*0.32) + t*0.42)
          + sin(p.y*2.6 + sin(p.x*1.9 - t*0.41) + t*0.58);
  return v / 6.0 * 0.5 + 0.5;
}

// ── Pattern 3: Geometric ───────────────────────────────────────────────────

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
}

float geometric(vec2 p, float t) {
  p *= 3.2;
  vec2 hs = vec2(1.0, 1.732);
  vec2 a = mod(p, hs) - hs*0.5;
  vec2 b = mod(p - hs*0.5, hs) - hs*0.5;
  vec2 gv = dot(a,a) < dot(b,b) ? a : b;
  float d = hexDist(gv);
  float r = 0.42;
  float ring = smoothstep(r, r-0.028, d) - smoothstep(r-0.06, r-0.1, d);
  vec2 ip = floor(p / hs);
  float h = hash(ip);
  float pulse = sin(t*0.95 + h*TAU) * 0.5 + 0.5;
  float fill = smoothstep(r-0.1, r-0.22, d) * pulse;
  float glow = smoothstep(0.58, 0.0, d) * 0.22;
  float a2 = atan(gv.y, gv.x) + t*0.4 + h*PI;
  float star = sin(a2*6.0)*0.5 + 0.5;
  float starMask = smoothstep(r-0.18, r-0.3, d) * star * 0.3;
  return clamp(ring + fill*0.65 + glow + starMask, 0.0, 1.0);
}

// ── Pattern 4: Fractal ─────────────────────────────────────────────────────

float fractal(vec2 p, float t) {
  p *= 1.8;
  vec2 c = vec2(0.44 + sin(t*0.052)*0.12, 0.28 + cos(t*0.068)*0.09);
  float v = 0.0, w = 1.0;
  for (int i = 0; i < 8; i++) {
    float r2 = dot(p, p);
    if (r2 < 1e-6) break;
    p = abs(p)/r2 - c;
    v += w * smoothstep(0.5, 0.0, length(p));
    w *= 0.58;
  }
  return clamp(v, 0.0, 1.0);
}

// ── Pattern 5: Swarm ──────────────────────────────────────────────────────

float swarm(vec2 p, float t) {
  float v = 0.0;
  for (int i = 0; i < 22; i++) {
    float fi = float(i);
    float phi = fi * 2.39996323;
    float orb = 0.07 + fract(fi*0.618) * 0.4;
    float spd = 0.09 + fract(fi*0.317) * 0.28;
    float ang = t*spd + phi;
    vec2 pos = vec2(cos(ang), sin(ang)) * orb;
    float d = length(p - pos);
    float sz = 0.011 + fract(fi*0.471) * 0.02;
    v += smoothstep(sz, 0.0, d);
    v += smoothstep(sz*5.5, sz, d) * 0.22;
    vec2 dir = normalize(pos + vec2(sin(ang+PI*0.5), cos(ang+PI*0.5)) * 0.001);
    float trail = length(p - pos + dir*sz*2.5);
    v += smoothstep(sz*3.0, 0.0, trail) * 0.18;
  }
  return clamp(v, 0.0, 1.0);
}

// ── Pattern 6: Liquid ─────────────────────────────────────────────────────

float liquid(vec2 p, float t) {
  const float S = 0.24;
  vec2 q = vec2(sin(p.x*2.1+t*0.22)+sin(p.y*1.8-t*0.28), cos(p.x*1.7-t*0.18)+cos(p.y*2.3+t*0.14))*S;
  vec2 r2 = vec2(sin((p.x+q.x)*1.9+t*0.14)+sin((p.y+q.y)*2.1), cos((p.x+q.x)*2.2)+cos((p.y+q.y)*1.8-t*0.19))*(S*0.65);
  vec2 wp = p + q + r2;
  float v = sin(wp.x*2.9+t*0.36)+sin(wp.y*2.5-t*0.29)+sin((wp.x+wp.y)*2.1+t*0.19)+sin(length(wp)*4.4-t*0.47);
  return smoothstep(-4.0, 4.0, v)*0.82 + 0.06;
}

// ── Pattern 7: Tunnel ─────────────────────────────────────────────────────

float tunnel(vec2 p, float t) {
  float r = length(p);
  if (r < 0.002) return 0.0;
  float a = atan(p.y, p.x);
  float u = a / PI;
  float v2 = 0.14 / max(r, 0.01) - t*0.6;
  float gu = abs(fract(u*9.0+0.5)-0.5);
  float gv = abs(fract(v2*9.0+0.5)-0.5);
  float grid = smoothstep(0.1, 0.022, min(gu, gv));
  float streakU = abs(fract(u*4.5 - v2*0.12 + 0.5) - 0.5);
  float streak = smoothstep(0.065, 0.0, streakU) * 0.35;
  float depthFade = smoothstep(0.62, 0.04, r);
  return clamp((grid + streak) * (0.35 + depthFade*0.65), 0.0, 1.0);
}

// ── Pattern 8: Wire Grid ──────────────────────────────────────────────────
// Holographic orthographic grid with depth lines and glowing intersections

float wireGrid(vec2 p, float t) {
  p *= 5.0;
  vec2 fp = fract(p);
  vec2 ip = floor(p);

  // Main grid lines
  float gx = smoothstep(0.055, 0.0, abs(fp.x - 0.5));
  float gy = smoothstep(0.055, 0.0, abs(fp.y - 0.5));
  float grid = max(gx, gy);

  // Intersection glow
  float node = smoothstep(0.16, 0.0, length(fp - 0.5));
  float nh = hash(ip);
  float pulse = sin(t*1.4 + nh*TAU) * 0.5 + 0.5;
  node *= 0.4 + 0.6*pulse;

  // Diagonal cross-lines every other cell
  float dh = hash(ip + vec2(5.5, 2.2));
  float diag = 0.0;
  if (dh > 0.55) {
    diag = smoothstep(0.04, 0.0, abs(fp.x - fp.y)) * 0.5;
  }

  // Data pulse that races along the x-axis
  float ph = hash(ip + vec2(0.0, ip.y));
  float travel = fract(p.x * 0.5 - t * (0.6 + ph*0.8));
  float dataPulse = smoothstep(0.08, 0.0, abs(fp.y - 0.5))
                  * smoothstep(0.04, 0.0, abs(travel - 0.5)) * 1.8;

  return clamp(grid*0.7 + node + diag + dataPulse, 0.0, 1.0);
}

// ── Pattern 9: Matrix Rain ────────────────────────────────────────────────
// Columns of falling glyphs — bright head with fading trail

float matrixRain(vec2 p, float t) {
  p *= vec2(9.0, 14.0);
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  // Each column has a different fall speed and phase
  float col = ip.x;
  float speed  = 0.8 + hash(vec2(col, 0.0)) * 2.2;
  float phase  = hash(vec2(col, 1.0)) * 8.0;
  float offset = hash(vec2(col, 2.0)) * 30.0;

  float head = fract(t*speed + phase);
  float headY = head * float(14);          // head position in glyph rows
  float rowY  = ip.y + offset;

  // Distance from head (wrapping)
  float dist = mod(headY - mod(rowY, 14.0), 14.0);

  // Bright head glyph
  float bright = smoothstep(2.0, 0.0, dist);
  // Fading trail
  float trail  = smoothstep(8.0, 0.0, dist) * 0.35;

  // Each glyph is a small rectangle
  float glyph = smoothstep(0.08, 0.0, abs(fp.x - 0.5))
              * smoothstep(0.1, 0.0, abs(fp.y - 0.5));

  // Random glyph flicker
  float flicker = step(0.35, hash(vec2(ip.x + floor(t*speed)*7.1, ip.y)));

  return clamp((bright + trail) * glyph * flicker, 0.0, 1.0);
}

// ── Pattern 10: Scanlines ─────────────────────────────────────────────────
// CRT/terminal sweep beams with interference patterns

float scanlines(vec2 p, float t) {
  float v = 0.0;

  // Primary scan beam
  float beam = sin(p.y*28.0 - t*4.5) * 0.5 + 0.5;
  beam = pow(beam, 4.0) * 0.9;

  // Secondary interference (different freq)
  float beam2 = sin(p.y*11.5 + t*1.8) * 0.5 + 0.5;
  beam2 = pow(beam2, 3.0) * 0.5;

  // Diagonal moiré
  float moire = sin((p.x + p.y)*18.0 + t*1.1) * 0.5 + 0.5;
  moire = pow(moire, 6.0) * 0.6;

  // Horizontal glitch lines
  float glitchSeed = hash(vec2(floor(p.y*22.0), floor(t*6.0)));
  float glitchLine = smoothstep(0.06, 0.0, abs(fract(p.y*22.0) - 0.5)) * step(0.82, glitchSeed);

  // Radial pulse from center
  float r = length(p);
  float radial = sin(r*16.0 - t*3.2) * 0.5 + 0.5;
  radial = pow(radial, 5.0) * 0.4;

  v = beam*0.45 + beam2*0.25 + moire*0.2 + glitchLine*0.8 + radial*0.2;
  return clamp(v, 0.0, 1.0);
}

// ── Pattern 11: Hex Mesh ──────────────────────────────────────────────────
// Dense wireframe hexagonal mesh with edge glow and data pulses

float hexMesh(vec2 p, float t) {
  p *= 5.5;

  // Hex grid dual-lattice
  vec2 hs = vec2(1.0, 1.732);
  vec2 a = mod(p, hs) - hs*0.5;
  vec2 b = mod(p - hs*0.5, hs) - hs*0.5;
  vec2 gv = dot(a,a) < dot(b,b) ? a : b;
  vec2 ip = (dot(a,a) < dot(b,b)) ? floor(p/hs) : floor((p - hs*0.5)/hs);

  float d = hexDist(gv);
  float hexR = 0.44;

  // Sharp wireframe edges only (no fill)
  float edge = smoothstep(0.035, 0.0, abs(d - hexR));

  // Inner division lines (Y axis)
  float innerY = smoothstep(0.025, 0.0, abs(gv.x)) * smoothstep(hexR, hexR-0.08, d) * 0.4;

  // Vertex nodes
  float corner = smoothstep(0.08, 0.0, length(gv) - hexR + 0.04) * 0.6;

  // Cell pulse
  float ch = hash(ip);
  float pulse = sin(t*1.1 + ch*TAU) * 0.5 + 0.5;
  float cellGlow = smoothstep(hexR-0.05, hexR-0.18, d) * pulse * 0.25;

  // Data packets travelling along edges
  float ePulse = fract(d*3.0 - t*(0.5 + ch*0.4));
  float packet = smoothstep(0.035, 0.0, abs(d - hexR)) * smoothstep(0.06, 0.0, abs(ePulse - 0.5)) * 1.2;

  return clamp(edge + innerY + corner + cellGlow + packet, 0.0, 1.0);
}

// ── Palette mapping ────────────────────────────────────────────────────────

vec3 paletteColor(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  int i = int(t);
  float f = fract(t);
  if (i == 0) return mix(uPalette[0], uPalette[1], f);
  if (i == 1) return mix(uPalette[1], uPalette[2], f);
  return mix(uPalette[2], uPalette[3], f);
}

// ── Main ───────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = vUv;

  // Glitch: horizontal slice displacement
  if (uGlitch > 0.01) {
    float sliceIdx = floor(uv.y * 26.0);
    float rnd = hash(vec2(sliceIdx, floor(uTime * 28.0)));
    float offset = (rnd - 0.5) * uGlitch * 0.08;
    if (rnd > 0.72) offset *= 3.2;
    uv.x = fract(uv.x + offset);
  }

  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  float r = length(p);
  float a = atan(p.y, p.x);

  if (uZoomPulse > 0.001) {
    r *= 1.0 + uZoomPulse * 0.3 * sin(uTime * 1.22);
  }

  a += uRotOffset;

  float segAngle = TAU / uSymmetry;
  float segIdx = floor(mod(a + TAU, TAU) / segAngle);
  a = mod(a, segAngle);
  if (a > segAngle * 0.5) a = segAngle - a;

  p = vec2(cos(a), sin(a)) * r;

  if (uWarp > 0.001) {
    float wt = uTime * 0.26;
    p.x += sin(p.y*3.1 + wt*0.82) * uWarp * 0.17;
    p.y += cos(p.x*2.8 - wt*0.61) * uWarp * 0.17;
  }

  float animTime = uTime * uSpeed;
  float v;
  if      (uShapeType == 0)  v = circuits(p, animTime);
  else if (uShapeType == 1)  v = crystals(p, animTime);
  else if (uShapeType == 2)  v = plasma(p, animTime);
  else if (uShapeType == 3)  v = geometric(p, animTime);
  else if (uShapeType == 4)  v = fractal(p, animTime);
  else if (uShapeType == 5)  v = swarm(p, animTime);
  else if (uShapeType == 6)  v = liquid(p, animTime);
  else if (uShapeType == 7)  v = tunnel(p, animTime);
  else if (uShapeType == 8)  v = wireGrid(p, animTime);
  else if (uShapeType == 9)  v = matrixRain(p, animTime);
  else if (uShapeType == 10) v = scanlines(p, animTime);
  else                       v = hexMesh(p, animTime);

  vec3 col = paletteColor(v);

  if (uGlitch > 0.01) {
    float ca = uGlitch * 0.055;
    col.r = paletteColor(clamp(v + ca, 0.0, 1.0)).r;
    col.b = paletteColor(clamp(v - ca, 0.0, 1.0)).b;
  }

  if (uHueShift > 0.001) {
    float angle = segIdx / uSymmetry * TAU * uHueShift;
    col = hueRotate(col, angle);
  }

  if (abs(uHueAngle) > 0.001) {
    col = hueRotate(col, uHueAngle);
  }

  col = (col - 0.5) * uContrast + 0.5;
  col *= uBrightness;

  col = mix(uBgColor, col, smoothstep(0.0, 0.1, v));

  // Soft corner-only vignette
  col *= 1.0 - smoothstep(0.74, 1.08, r) * 0.28;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
