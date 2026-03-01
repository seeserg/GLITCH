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

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 1.2);
    float inten = u_intensity * pulse;

    vec2 uv = v_uv;
    vec2 center = vec2(0.5, 0.5);
    float dist_center = length(uv - center);

    vec2 q = vec2(fbm(uv * 3.0 + t * 0.2), fbm(uv * 3.0 + t * 0.15 + 40.0));
    vec2 r = vec2(fbm(uv * 3.0 + q * 4.0 + t * 0.1), fbm(uv * 3.0 + q * 4.0 + t * 0.2 + 60.0));
    vec2 s = vec2(fbm(uv * 3.0 + r * 3.0 + t * 0.08), fbm(uv * 3.0 + r * 3.0 + t * 0.12 + 80.0));

    float edge_creep = smoothstep(0.05, 0.4, dist_center);
    float eff = inten + 0.15;

    uv += (s - 0.5) * eff * 0.25 * mask_effect * edge_creep;
    uv = clamp(uv, 0.002, 0.998);

    vec4 tex = texture(u_texture, uv);
    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.4);

    float tendril = pow(fbm(v_uv * 6.0 + s * 3.0 + t * 0.15), 1.2);
    float vein = smoothstep(0.42, 0.58, fbm(v_uv * 10.0 + t * 0.25));
    float dark_tendril = tendril * edge_creep;

    vec3 void_black = vec3(0.02, 0.01, 0.03);
    vec3 tendril_purple = vec3(0.2, 0.03, 0.3);
    vec3 tendril_deep = vec3(0.08, 0.0, 0.15);

    float flow_phase = fract(t * 0.06 + tendril * 0.5);
    vec3 tendril_color = mix(tendril_deep, tendril_purple, flow_phase);

    tex.rgb = mix(tex.rgb, void_black, dark_tendril * eff * 1.5 * mask_effect);
    tex.rgb += tendril_color * vein * eff * 0.8 * mask_effect * edge_creep;

    float core_glow = pow(max(tendril - 0.3, 0.0) * 1.5, 2.0);
    tex.rgb += vec3(0.3, 0.0, 0.5) * core_glow * eff * 0.6 * mask_effect;

    tex.rgb *= 1.0 - eff * 0.2 * mask_effect * edge_creep;

    fragColor = mix(orig, tex, mask_effect);
}
