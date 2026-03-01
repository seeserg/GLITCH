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

float fbm(vec2 p, float t_offset) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * (snoise(p + vec2(0.0, t_offset)) * 0.5 + 0.5);
        p *= 2.0; a *= 0.5;
        t_offset *= 1.1;
    }
    return v;
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 2.2);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    vec2 uv = v_uv;
    float rise_speed = t * 2.5;

    float flame1 = fbm(vec2(uv.x * 4.0, uv.y * 3.0 - rise_speed), t * 0.3);
    float flame2 = fbm(vec2(uv.x * 6.0 + 10.0, uv.y * 4.0 - rise_speed * 1.3), t * 0.4);
    float flame3 = fbm(vec2(uv.x * 8.0 + 20.0, uv.y * 5.0 - rise_speed * 1.6), t * 0.5);

    float flame = flame1 * 0.5 + flame2 * 0.3 + flame3 * 0.2;

    float height_fade = smoothstep(0.0, 0.7, 1.0 - uv.y);
    float center_focus = 1.0 - pow(abs(uv.x - 0.5) * 2.0, 1.5);
    center_focus = max(0.0, center_focus);

    float fire_shape = flame * height_fade * center_focus;
    fire_shape = pow(fire_shape, 0.8);

    float warp_amt = fire_shape * eff * 0.12 * mask_effect;
    vec2 warp_uv = uv + vec2(
        snoise(uv * 5.0 + t * 1.5) * warp_amt,
        snoise(uv * 5.0 + t * 1.5 + 50.0) * warp_amt * 0.5
    );
    warp_uv = clamp(warp_uv, 0.002, 0.998);

    vec4 tex = texture(u_texture, warp_uv);
    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.3);

    vec3 fire_core = vec3(0.0, 1.0, 0.3);
    vec3 fire_mid  = vec3(0.0, 0.6, 0.15);
    vec3 fire_edge = vec3(0.15, 0.0, 0.35);
    vec3 fire_tip  = vec3(0.4, 0.0, 0.6);

    vec3 fire_color;
    float fc = fire_shape;
    if (fc > 0.6) fire_color = mix(fire_mid, fire_core, (fc - 0.6) / 0.4);
    else if (fc > 0.3) fire_color = mix(fire_edge, fire_mid, (fc - 0.3) / 0.3);
    else fire_color = mix(fire_tip, fire_edge, fc / 0.3);

    float fire_strength = fire_shape * eff * 1.5 * mask_effect;
    tex.rgb += fire_color * fire_strength;

    float ember = pow(snoise(v_uv * 12.0 + vec2(0.0, -t * 3.0)) * 0.5 + 0.5, 3.0);
    float ember_rise = smoothstep(0.3, 0.8, 1.0 - uv.y);
    tex.rgb += vec3(0.2, 1.0, 0.4) * ember * ember_rise * eff * 0.5 * mask_effect;

    float bloom_fire = pow(max(fire_shape - 0.3, 0.0) / 0.7, 2.0);
    tex.rgb += fire_core * bloom_fire * eff * 0.5 * mask_effect;

    fragColor = mix(orig, tex, mask_effect);
}
