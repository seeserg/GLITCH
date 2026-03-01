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

vec3 spectral_color(float t) {
    vec3 r = vec3(1.0, 0.0, 0.0);
    vec3 o = vec3(1.0, 0.5, 0.0);
    vec3 y = vec3(1.0, 1.0, 0.0);
    vec3 g = vec3(0.0, 1.0, 0.2);
    vec3 c = vec3(0.0, 0.8, 1.0);
    vec3 b = vec3(0.1, 0.2, 1.0);
    vec3 v = vec3(0.5, 0.0, 1.0);

    t = fract(t) * 6.0;
    if (t < 1.0) return mix(r, o, t);
    if (t < 2.0) return mix(o, y, t - 1.0);
    if (t < 3.0) return mix(y, g, t - 2.0);
    if (t < 4.0) return mix(g, c, t - 3.0);
    if (t < 5.0) return mix(c, b, t - 4.0);
    return mix(b, v, t - 5.0);
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 1.5);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    vec2 center = vec2(0.5);
    vec2 delta = v_uv - center;
    float dist = length(delta);
    vec2 dir = normalize(delta + 0.001);

    float turb = snoise(v_uv * 4.0 + t * 0.3) * 0.3;
    float n_bands = 5.0 + eff * 3.0;
    float band_offset = snoise(v_uv * 2.0 + t * 0.15) * 0.5;

    float r_sample = texture(u_texture, v_uv + dir * dist * eff * 0.08).r;
    float g_sample = texture(u_texture, v_uv).g;
    float b_sample = texture(u_texture, v_uv - dir * dist * eff * 0.08).b;
    vec4 tex = vec4(r_sample, g_sample, b_sample, 1.0);

    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.25);

    float prism_angle = atan(delta.y, delta.x) / 6.283 + 0.5;
    float prism_phase = fract(prism_angle * n_bands + t * 0.08 + band_offset + turb);
    vec3 rainbow = spectral_color(prism_phase);

    float edge_factor = smoothstep(0.05, 0.35, dist) * smoothstep(0.9, 0.5, dist);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float bright_factor = smoothstep(0.2, 0.7, lum);

    float rainbow_strength = eff * 0.7 * mask_effect * edge_factor * (0.4 + bright_factor * 0.6);
    tex.rgb = mix(tex.rgb, tex.rgb * rainbow * 1.3, rainbow_strength);

    float flare = pow(max(1.0 - dist * 1.5, 0.0), 3.0) * eff * 0.15;
    tex.rgb += rainbow * flare * mask_effect;

    float sparkle = pow(snoise(v_uv * 15.0 + t * 2.0) * 0.5 + 0.5, 5.0);
    tex.rgb += vec3(1.0) * sparkle * eff * 0.2 * mask_effect * edge_factor;

    fragColor = mix(orig, tex, mask_effect);
}
