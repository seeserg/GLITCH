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

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) {
        v += a * (snoise(p) * 0.5 + 0.5);
        p *= 2.1;
        a *= 0.48;
    }
    return v;
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);

    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 1.8);
    float inten = u_intensity * pulse;

    vec2 uv = v_uv;
    vec2 q = vec2(
        fbm(uv * 3.5 + t * 0.35),
        fbm(uv * 3.5 + t * 0.25 + 50.0)
    );
    vec2 r = vec2(
        fbm(uv * 3.5 + q * 5.0 + t * 0.18),
        fbm(uv * 3.5 + q * 5.0 + t * 0.28 + 80.0)
    );
    uv += (r - 0.5) * inten * 0.15 * mask_effect;
    uv = clamp(uv, 0.002, 0.998);

    vec4 tex = texture(u_texture, uv);

    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, inten * 0.35);

    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float flow = fbm(uv * 2.5 + t * 0.12);
    float phase = fract(t * 0.12 + flow * 0.7);

    vec3 iri;
    float p6 = phase * 6.0;
    if      (p6 < 1.0) iri = mix(vec3(0.08, 0.0, 0.25), vec3(0.45, 0.05, 0.7),  p6);
    else if (p6 < 2.0) iri = mix(vec3(0.45, 0.05, 0.7),  vec3(0.7, 0.1, 0.55),  p6 - 1.0);
    else if (p6 < 3.0) iri = mix(vec3(0.7, 0.1, 0.55),   vec3(0.0, 0.55, 0.3),  p6 - 2.0);
    else if (p6 < 4.0) iri = mix(vec3(0.0, 0.55, 0.3),   vec3(0.0, 0.3, 0.5),   p6 - 3.0);
    else if (p6 < 5.0) iri = mix(vec3(0.0, 0.3, 0.5),    vec3(0.02, 0.02, 0.05), p6 - 4.0);
    else               iri = mix(vec3(0.02, 0.02, 0.05),  vec3(0.08, 0.0, 0.25), p6 - 5.0);

    float dark_bias = 0.3 + 0.7 * (1.0 - lum);
    float color_blend = inten * 0.75 * mask_effect * dark_bias;
    tex.rgb = mix(tex.rgb, iri, color_blend);

    tex.rgb *= 1.0 - inten * 0.2 * mask_effect;

    float vein = smoothstep(0.48, 0.52, fbm(v_uv * 8.0 + t * 0.3));
    tex.rgb += vec3(0.3, 0.0, 0.5) * vein * inten * 0.25 * mask_effect;

    fragColor = mix(orig, tex, mask_effect);
}
