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

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 2.5);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    float scanline_freq = 200.0 + eff * 100.0;
    float scanline = sin(v_uv.y * scanline_freq + t * 15.0) * 0.5 + 0.5;
    scanline = pow(scanline, 0.5);
    float scanline_dark = 0.8 + 0.2 * scanline;

    float glitch_trigger = step(0.75, snoise(vec2(t * 2.0, 0.0)) * 0.5 + 0.5);
    float glitch_band_y = snoise(vec2(0.0, t * 3.0)) * 0.5 + 0.5;
    float glitch_band = smoothstep(0.06, 0.0, abs(v_uv.y - glitch_band_y)) * glitch_trigger;

    float jitter_x = snoise(vec2(v_uv.y * 50.0, t * 8.0)) * eff * 0.03 * glitch_band;
    vec2 uv_glitched = v_uv + vec2(jitter_x, 0.0);
    uv_glitched = clamp(uv_glitched, 0.002, 0.998);

    float chroma_spread = eff * 0.012 * (1.0 + glitch_band * 3.0);
    float r = texture(u_texture, uv_glitched + vec2(chroma_spread, 0.0)).r;
    float g = texture(u_texture, uv_glitched).g;
    float b = texture(u_texture, uv_glitched - vec2(chroma_spread, 0.0)).b;
    vec4 tex = vec4(r, g, b, 1.0);

    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.2);

    tex.rgb *= scanline_dark;

    float angle = v_uv.y * 3.14159 * 2.0 + t * 0.5;
    float interference = sin(angle * 30.0 + v_uv.x * 20.0) * 0.5 + 0.5;
    interference *= sin(angle * 45.0 - v_uv.x * 15.0 + t) * 0.5 + 0.5;
    vec3 holo_rainbow;
    float phase = fract(interference + t * 0.05);
    holo_rainbow.r = sin(phase * 6.28) * 0.5 + 0.5;
    holo_rainbow.g = sin(phase * 6.28 + 2.09) * 0.5 + 0.5;
    holo_rainbow.b = sin(phase * 6.28 + 4.18) * 0.5 + 0.5;

    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    tex.rgb = mix(tex.rgb, tex.rgb * holo_rainbow, eff * 0.65 * mask_effect);

    float dropout = step(0.88, snoise(vec2(v_uv.y * 5.0, t * 4.0)) * 0.5 + 0.5);
    dropout *= step(0.75, snoise(vec2(t * 6.0, 0.0)) * 0.5 + 0.5);
    tex.rgb = mix(tex.rgb, vec3(0.0), dropout * eff * 0.5 * mask_effect);

    float static_noise = snoise(v_uv * 100.0 + t * 20.0) * 0.5 + 0.5;
    tex.rgb += vec3(static_noise) * 0.04 * eff * mask_effect;

    float edge_flicker = 0.9 + 0.1 * sin(t * 12.0 + v_uv.y * 30.0);
    tex.rgb *= edge_flicker;

    fragColor = mix(orig, tex, mask_effect);
}
