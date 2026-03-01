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

vec2 fbmGradient(vec2 p, float t) {
    float eps = 0.005;
    float cx = fbm(p + vec2(eps, 0.0) + t * 0.3) - fbm(p - vec2(eps, 0.0) + t * 0.3);
    float cy = fbm(p + vec2(0.0, eps) + t * 0.3) - fbm(p - vec2(0.0, eps) + t * 0.3);
    return vec2(cx, cy) / (2.0 * eps);
}

vec3 envMap(vec2 r, float t) {
    float e1 = fbm(r * 2.0 + t * 0.2);
    float e2 = fbm(r * 3.0 + vec2(10.0) + t * 0.15);
    float e3 = fbm(r * 1.5 + vec2(20.0) + t * 0.25);

    vec3 silver = vec3(0.85, 0.87, 0.9);
    vec3 steelBlue = vec3(0.5, 0.6, 0.8);
    vec3 dark = vec3(0.15, 0.15, 0.2);

    vec3 col = mix(dark, silver, e1);
    col = mix(col, steelBlue, e2 * 0.5);
    col += vec3(0.9, 0.95, 1.0) * pow(e3, 3.0) * 0.8;

    return col;
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
    vec2 grad = fbmGradient(uv * 4.0, t);
    vec2 normal2d = normalize(vec2(-grad.y, grad.x) + 0.001);

    vec2 ripple = vec2(
        sin(uv.y * 12.0 + t * 2.5) * cos(uv.x * 10.0 + t * 1.8),
        cos(uv.x * 11.0 + t * 2.2) * sin(uv.y * 9.0 + t * 1.5)
    ) * 0.02 * eff;

    vec2 reflectUV = uv + (grad * 0.06 + ripple) * eff * mask_effect;
    reflectUV = clamp(reflectUV, 0.002, 0.998);

    vec4 tex = texture(u_texture, reflectUV);

    vec3 env = envMap(uv + grad * 0.1, t);

    float fresnel = pow(1.0 - abs(dot(normalize(vec3(grad, 1.0)), vec3(0.0, 0.0, 1.0))), 2.5);
    fresnel = clamp(fresnel, 0.0, 1.0);

    vec3 chrome = mix(tex.rgb, env, fresnel * eff * 0.7);

    float specAngle = dot(normalize(grad + 0.001), normalize(vec2(0.5, 0.5)));
    float spec = pow(max(specAngle, 0.0), 16.0) * eff;

    chrome += vec3(0.95, 0.97, 1.0) * spec * 0.6;

    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    chrome = mix(chrome, chrome * vec3(0.75, 0.8, 0.95), (1.0 - lum) * eff * 0.4);

    float edgeHighlight = length(grad) * 0.3 * eff;
    chrome += vec3(0.8, 0.85, 1.0) * edgeHighlight;

    tex.rgb = chrome;

    fragColor = mix(orig, tex, mask_effect);
}
