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
uniform float uZoomPulse;
uniform float uRotOffset;
uniform float uWarp;
uniform float uBreath;
uniform vec2  uResolution;
uniform float uTunnelDir;

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
    float fi  = float(i);
    float phi = fi * 2.39996323;
    float orb = 0.07 + fract(fi*0.618) * 0.4;
    float spd = 0.09 + fract(fi*0.317) * 0.28;
    float ang = t*spd + phi;
    vec2  pos = vec2(cos(ang), sin(ang)) * orb;
    float sz  = 0.011 + fract(fi*0.471) * 0.02;

    // Use squared distance to avoid sqrt for core + halo tests
    vec2  dp  = p - pos;
    float d2  = dot(dp, dp);
    float sz2 = sz * sz;
    v += smoothstep(sz2,       0.0,        d2);
    v += smoothstep(sz2*30.25, sz2,        d2) * 0.22;  // 5.5^2 = 30.25

    // Trail: tangent direction is just the perpendicular to the radial vector —
    // no normalize needed, derive it analytically from ang
    vec2 tangent = vec2(-sin(ang), cos(ang));            // unit tangent, no normalize
    vec2 trailDp = dp + tangent * (sz * 2.5);
    float trail2 = dot(trailDp, trailDp);
    v += smoothstep(sz2*9.0, 0.0, trail2) * 0.18;       // 3^2 = 9
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
  float v2 = 0.14 / max(r, 0.01) - t*0.6*uTunnelDir;
  float gu = abs(fract(u*9.0+0.5)-0.5);
  float gv = abs(fract(v2*9.0+0.5)-0.5);
  float grid = smoothstep(0.1, 0.022, min(gu, gv));
  float streakU = abs(fract(u*4.5 - v2*0.12 + 0.5) - 0.5);
  float streak = smoothstep(0.065, 0.0, streakU) * 0.35;
  float depthFade = smoothstep(0.62, 0.04, r);
  return clamp((grid + streak) * (0.35 + depthFade*0.65), 0.0, 1.0);
}

// Shared: axis-aligned box SDF
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// ── Pattern 8: Wire Boxes ─────────────────────────────────────────────────
// Nested hollow rectangle outlines scrolling inward — neon Tron corridor

float wireGrid(vec2 p, float t) {
  float v  = 0.0;
  float px = 1.0 / uResolution.y;  // 1 screen pixel in normalized units
  float W  = 1.8 * px;             // ~1.8px core stroke
  float GW = W * 7.0;              // glow radius

  float scroll = fract(t * 0.14);
  for (int i = 0; i < 8; i++) {
    float scale = fract(float(i) / 8.0 + scroll);
    float ry  = 0.04 + scale * 0.45;
    float rx  = ry * 1.3;
    float d   = sdBox(p, vec2(rx, ry));
    float br  = 0.35 + (1.0 - scale) * 0.65;
    float ad  = abs(d);

    // Core + glow
    v += (smoothstep(W,  0.0, ad) + smoothstep(GW, W, ad) * 0.4) * br;

    // Corner nodes
    float cd = 3.5 * px;
    float cg = cd * 5.0;
    vec2 c0 = vec2( rx,  ry), c1 = vec2(-rx,  ry),
         c2 = vec2( rx, -ry), c3 = vec2(-rx, -ry);
    for (int j = 0; j < 4; j++) {
      vec2 cp = j==0 ? c0 : j==1 ? c1 : j==2 ? c2 : c3;
      float cl = length(p - cp);
      v += (smoothstep(cd, 0.0, cl) + smoothstep(cg, cd, cl) * 0.4) * br * 0.9;
    }
  }

  // Center axis connectors
  float aw = 1.5 * px;
  v += (smoothstep(aw, 0.0, abs(p.x)) + smoothstep(aw*6.0, aw, abs(p.x)) * 0.35)
     * smoothstep(0.52, 0.0, abs(p.y)) * 0.55;
  v += (smoothstep(aw, 0.0, abs(p.y)) + smoothstep(aw*6.0, aw, abs(p.y)) * 0.35)
     * smoothstep(0.68, 0.0, abs(p.x)) * 0.55;

  return clamp(v, 0.0, 1.0);
}

// ── Pattern 9: Wire Sphere ────────────────────────────────────────────────
// Orthographic wireframe globe — latitude rings + slowly spinning longitudes

float matrixRain(vec2 p, float t) {
  float R  = 0.41;
  float r2 = dot(p, p);
  float R2 = R * R;
  float r  = sqrt(r2);
  float px = 1.0 / uResolution.y;

  // Outer stroke ring
  float oW      = 1.8 * px;
  float oAD     = abs(r - R);
  float outline = smoothstep(oW, 0.0, oAD) + smoothstep(oW*7.0, oW, oAD) * 0.4;
  if (r2 >= R2) return clamp(outline, 0.0, 1.0);

  float z = sqrt(R2 - r2);

  // ── Latitude lines ────────────────────────────────────────────────────
  float sinPhi  = clamp(p.y / R, -1.0, 1.0);
  float lat     = asin(sinPhi);
  float latStep = PI / 8.0;
  float modLat  = mod(lat + PI * 0.5, latStep);
  float lW      = 2.2 * px;
  float lD      = min(modLat, latStep - modLat);
  float latLine = smoothstep(lW, 0.0, lD) + smoothstep(lW*6.0, lW, lD) * 0.35;

  // ── Longitude lines ───────────────────────────────────────────────────
  float lon       = atan(p.x, z) + t * 0.16;
  float lonStep   = PI / 9.0;
  float modLon    = mod(lon, lonStep);
  float cosFactor = max(0.12, sqrt(1.0 - sinPhi * sinPhi));
  float lonW      = 2.2 * px / cosFactor;
  float lonD      = min(modLon, lonStep - modLon);
  float lonLine   = smoothstep(lonW, 0.0, lonD) + smoothstep(lonW*6.0, lonW, lonD) * 0.35;

  return clamp(outline + latLine + lonLine, 0.0, 1.0);
}

// ── Pattern 10: Wire Rect Grid ────────────────────────────────────────────
// Tiled hollow squares — stroke only, glowing corners, per-cell pulse

float scanlines(vec2 p, float t) {
  p *= 4.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;

  float h     = hash(ip);
  float pulse = sin(t * 1.3 + h * TAU) * 0.5 + 0.5;
  float px    = 4.0 / uResolution.y;  // 1px in scaled space
  float W     = 2.0 * px;
  float GW    = W * 7.0;

  float d    = sdBox(fp, vec2(0.34, 0.34));
  float ad   = abs(d);
  float bright_mod = 0.3 + 0.7 * pulse;
  float stroke = (smoothstep(W, 0.0, ad) + smoothstep(GW, W, ad) * 0.4) * bright_mod;

  // Corner nodes
  float cd = 3.5 * px;
  float cg = cd * 5.0;
  vec2  p0 = vec2( 0.34,  0.34), p1 = vec2(-0.34,  0.34),
        p2 = vec2( 0.34, -0.34), p3 = vec2(-0.34, -0.34);
  float corners = 0.0;
  for (int j = 0; j < 4; j++) {
    vec2 cp = j==0 ? p0 : j==1 ? p1 : j==2 ? p2 : p3;
    float cl = length(fp - cp);
    corners += smoothstep(cd, 0.0, cl) + smoothstep(cg, cd, cl) * 0.4;
  }
  corners *= (0.4 + 0.6 * pulse) * 0.6;

  float highlight = step(0.85, h) * smoothstep(0.38, 0.0, ad) * 0.3;

  return clamp(stroke + corners + highlight, 0.0, 1.0);
}

// ── Pattern 11: Hex Mesh ──────────────────────────────────────────────────
// Pure stroke-only hexagonal lattice — neon edges, vertex nodes, data packets

float hexMesh(vec2 p, float t) {
  p *= 5.0;
  vec2 hs = vec2(1.0, 1.732);
  vec2 a  = mod(p, hs) - hs * 0.5;
  vec2 b  = mod(p - hs * 0.5, hs) - hs * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 ip = dot(a, a) < dot(b, b) ? floor(p / hs) : floor((p - hs * 0.5) / hs);

  float d  = hexDist(gv);
  float R  = 0.44;
  float px = 5.0 / uResolution.y;  // 1px in scaled space
  float W  = 1.6 * px;
  float GW = W * 7.0;

  // Core + glow hex edge
  float eAD = abs(d - R);
  float edge = smoothstep(W, 0.0, eAD) + smoothstep(GW, W, eAD) * 0.4;

  // Vertex nodes
  float vg = 0.0;
  float vW = 3.0 * px;
  float vG = vW * 5.0;
  for (int k = 0; k < 6; k++) {
    float ang = float(k) * PI / 3.0;
    float vd  = length(gv - vec2(cos(ang), sin(ang)) * R);
    vg += smoothstep(vW, 0.0, vd) + smoothstep(vG, vW, vd) * 0.4;
  }
  vg *= 0.5;

  float ch    = hash(ip);
  float pulse = sin(t * 1.0 + ch * TAU) * 0.5 + 0.5;

  // Data packet orbiting the hex edge
  float edgeAng = atan(gv.y, gv.x);
  float pW      = 2.5 * px;
  float packet  = (smoothstep(W, 0.0, eAD) + smoothstep(GW, W, eAD) * 0.3)
                * smoothstep(pW, 0.0, abs(mod(edgeAng / TAU - t * 0.28 * (0.5 + ch), 1.0) - 0.5)) * 1.4;

  return clamp(edge + vg * (0.4 + 0.6 * pulse) + packet, 0.0, 1.0);
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

  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  float r = length(p);
  float a = atan(p.y, p.x);

  if (uZoomPulse > 0.001) {
    r *= 1.0 + uZoomPulse * 0.3 * sin(uTime * 1.22);
  }
  if (uBreath > 0.001) {
    r *= 1.0 - uBreath * 0.32;
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

  if (uHueShift > 0.001) {
    float angle = segIdx / uSymmetry * TAU * uHueShift;
    col = hueRotate(col, angle);
  }

  if (abs(uHueAngle) > 0.001) {
    col = hueRotate(col, uHueAngle);
  }

  col = (col - 0.5) * uContrast + 0.5;
  col *= uBrightness;

  col *= smoothstep(0.0, 0.1, v);

  // Soft corner-only vignette
  col *= 1.0 - smoothstep(0.74, 1.08, r) * 0.28;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
