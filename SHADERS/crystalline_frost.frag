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

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float voronoi_frost(vec2 uv, float t) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    float d1 = 10.0, d2 = 10.0;
    vec2 nearest_id = vec2(0.0);

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 n = vec2(float(x), float(y));
            vec2 p = vec2(hash(i + n), hash(i + n + 100.0));
            p = 0.5 + 0.45 * sin(t * 0.15 + 6.28 * p);
            float d = length(f - n - p);
            if (d < d1) {
                d2 = d1; d1 = d;
                nearest_id = i + n;
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    return d2 - d1;
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.8 + 0.2 * sin(t * 0.8);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    vec2 center = vec2(0.5);
    float dist_edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
    float edge_frost = smoothstep(0.3 + eff * 0.15, 0.0, dist_edge);

    float noise_spread = snoise(v_uv * 4.0 + t * 0.05) * 0.5 + 0.5;
    float frost_coverage = edge_frost * (0.5 + noise_spread * 0.5);

    float v1 = voronoi_frost(v_uv * 8.0, t);
    float v2 = voronoi_frost(v_uv * 16.0 + 10.0, t * 1.3);
    float v3 = voronoi_frost(v_uv * 24.0 + 20.0, t * 0.7);

    float crystal = pow(v1, 0.5) * 0.5 + pow(v2, 0.6) * 0.3 + pow(v3, 0.7) * 0.2;
    float crystal_edge = smoothstep(0.02, 0.0, v1) * 0.8;

    float dendrite = snoise(v_uv * 20.0 + t * 0.1) * 0.5 + 0.5;
    dendrite *= snoise(v_uv * 30.0 - t * 0.08) * 0.5 + 0.5;
    dendrite = pow(dendrite, 1.5);
    float branch = smoothstep(0.4, 0.6, dendrite) * frost_coverage;

    float frost_mask = max(frost_coverage * crystal, branch) * eff * 2.0;
    frost_mask = min(frost_mask, 1.0);

    float refract_amt = frost_mask * eff * 0.06 * mask_effect;
    vec2 refract_dir = vec2(
        snoise(v_uv * 10.0 + t * 0.2),
        snoise(v_uv * 10.0 + t * 0.2 + 50.0)
    );
    vec2 refracted_uv = clamp(v_uv + refract_dir * refract_amt, 0.002, 0.998);

    vec4 tex = texture(u_texture, refracted_uv);
    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.15);

    vec3 ice_white = vec3(0.9, 0.95, 1.0);
    vec3 ice_blue = vec3(0.6, 0.8, 1.0);
    vec3 ice_deep = vec3(0.3, 0.5, 0.8);

    vec3 frost_color = mix(ice_deep, ice_blue, crystal);
    frost_color = mix(frost_color, ice_white, crystal_edge);

    float frost_strength = frost_mask * mask_effect;
    tex.rgb = mix(tex.rgb, frost_color, frost_strength * 0.6);
    tex.rgb = mix(tex.rgb, tex.rgb * vec3(0.85, 0.9, 1.1), frost_strength * 0.4);

    float sparkle = pow(snoise(v_uv * 40.0 + t * 3.0) * 0.5 + 0.5, 6.0);
    tex.rgb += vec3(0.8, 0.9, 1.0) * sparkle * frost_mask * eff * 0.6 * mask_effect;

    tex.rgb += frost_color * crystal_edge * eff * 0.5 * mask_effect * frost_coverage;

    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    tex.rgb = mix(tex.rgb, vec3(lum) * vec3(0.85, 0.92, 1.0), frost_strength * 0.25);

    fragColor = mix(orig, tex, mask_effect);
}
