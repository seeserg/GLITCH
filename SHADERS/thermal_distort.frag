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
    m = m * m;
    m = m * m;
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

float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * (snoise(p) * 0.5 + 0.5);
        p *= 2.2;
        a *= 0.5;
    }
    return v;
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);

    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 2.0);
    float inten = u_intensity * pulse;

    float wave1 = sin(v_uv.y * 14.0 + t * 3.5) * sin(v_uv.y * 9.0 + t * 2.5);
    float wave2 = sin(v_uv.y * 22.0 + t * 4.0) * 0.4;
    float turb = fbm3(v_uv * 8.0 + t * 0.6);
    float disp = (wave1 + wave2 + turb * 0.8) * inten * 0.08 * mask_effect;

    float vert_disp = snoise(v_uv * 5.0 + t * 0.8) * 0.5 + 0.5;
    vert_disp *= inten * 0.03 * mask_effect;

    vec2 uv_r = clamp(v_uv + vec2(disp * 1.4, vert_disp), 0.002, 0.998);
    vec2 uv_g = clamp(v_uv + vec2(disp, vert_disp * 0.5), 0.002, 0.998);
    vec2 uv_b = clamp(v_uv + vec2(disp * 0.6, -vert_disp), 0.002, 0.998);

    float r = texture(u_texture, uv_r).r;
    float g = texture(u_texture, uv_g).g;
    float b = texture(u_texture, uv_b).b;
    vec4 tex = vec4(r, g, b, 1.0);

    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, inten * 0.3);

    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));

    vec3 cool_heat = vec3(0.2, 0.3, 1.0);
    vec3 warm_heat = vec3(1.0, 0.7, 0.2);
    vec3 hot_heat = vec3(1.0, 0.25, 0.0);
    vec3 white_heat = vec3(1.0, 0.95, 0.8);
    vec3 heat_col;
    if (lum < 0.5) {
        heat_col = mix(cool_heat, warm_heat, lum * 2.0);
    } else {
        heat_col = mix(warm_heat, hot_heat, (lum - 0.5) * 2.0);
    }
    heat_col = mix(heat_col, white_heat, pow(lum, 3.0) * 0.4);
    tex.rgb = mix(tex.rgb, heat_col, inten * 0.55 * mask_effect);

    float shimmer = pow(snoise(v_uv * 5.0 + t * 0.9) * 0.5 + 0.5, 1.5);
    float flicker = 0.8 + 0.2 * sin(t * 8.0 + v_uv.x * 20.0);
    tex.rgb += vec3(1.0, 0.65, 0.25) * shimmer * flicker * inten * 0.4 * mask_effect;

    float m1 = snoise(vec2(v_uv.x * 3.0, t * 1.5)) * 0.5 + 0.5;
    float m2 = snoise(vec2(v_uv.x * 7.0, t * 2.0)) * 0.5 + 0.5;
    float mirage = m1 * m2;
    tex.rgb += vec3(1.0, 0.9, 0.7) * mirage * inten * 0.2 * mask_effect;

    fragColor = mix(orig, tex, mask_effect);
}
