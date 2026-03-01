#version 330 core

uniform sampler2D u_texture;
uniform sampler2D u_mask;
uniform sampler2D u_feedback;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_frame_idx;
uniform int u_seed;
uniform float u_intensity;

in vec2 v_uv;
out vec4 fragColor;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) {
        v += a * (snoise(p) * 0.5 + 0.5);
        p *= 2.1; a *= 0.48;
    }
    return v;
}

float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

float charGlyph(vec2 p, float seed) {
    vec2 g = floor(p * 5.0);
    return step(0.45, hash(g.x * 7.3 + g.y * 13.7 + seed * 91.1));
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 1.2);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    vec2 uv = v_uv;
    float numCols = 40.0;
    float col = floor(uv.x * numCols);
    float colCenter = (col + 0.5) / numCols;

    float speed = 0.3 + 0.7 * fract(sin(col * 127.1) * 43758.5453);
    float colOffset = fract(sin(col * 311.7) * 43758.5453);
    float head = fract(t * speed * 0.3 + colOffset);

    float trailLen = 0.3 + 0.2 * fract(sin(col * 53.3) * 43758.5453);
    float dist = fract(head - uv.y);
    float trail = smoothstep(trailLen, 0.0, dist);

    float leadEdge = smoothstep(0.03, 0.0, dist) * 2.0;

    float charCell = floor(uv.y * numCols);
    float charSeed = floor(t * speed * 4.0 + colOffset);
    float glyph = hash(col * 17.3 + charCell * 31.7 + charSeed * 7.1);
    float charBright = step(0.35, glyph);

    float brightness = trail * charBright * eff;
    brightness += leadEdge * eff;

    float flicker = 0.8 + 0.2 * sin(t * 15.0 + col * 3.7);
    brightness *= flicker;

    float nv = snoise(vec2(col * 0.5, uv.y * 20.0 + t * 2.0));
    brightness += max(nv * 0.15, 0.0) * trail * eff;

    vec3 darkGreen = vec3(0.0, 0.15, 0.05);
    vec3 brightGreen = vec3(0.1, 0.9, 0.3);
    vec3 cyan = vec3(0.5, 1.0, 0.9);
    vec3 white = vec3(0.9, 1.0, 0.95);

    vec3 rainColor = mix(darkGreen, brightGreen, trail);
    rainColor = mix(rainColor, cyan, leadEdge * 0.6);
    rainColor = mix(rainColor, white, leadEdge * 0.3);

    vec4 tex = orig;
    tex.rgb = mix(tex.rgb, tex.rgb * 0.4, eff * mask_effect * 0.6);
    tex.rgb += rainColor * brightness * mask_effect;

    float scanline = 0.95 + 0.05 * sin(uv.y * u_resolution.y * 3.14159);
    tex.rgb *= scanline;

    fragColor = mix(orig, tex, mask_effect);
}
