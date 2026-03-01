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

float lightning_branch(vec2 uv, float t, float seed_offset) {
    float y_pos = uv.y;
    float x_target = 0.5 + snoise(vec2(seed_offset, t * 0.5)) * 0.3;
    float path_x = x_target;

    float jitter = 0.0;
    float freq = 8.0;
    float amp = 0.15;
    for (int i = 0; i < 5; i++) {
        jitter += snoise(vec2(y_pos * freq + seed_offset, t * 3.0 + float(i) * 10.0)) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    path_x += jitter;

    float dist = abs(uv.x - path_x);
    float thickness = 0.008 + 0.004 * snoise(vec2(y_pos * 20.0, t * 5.0));
    float core = smoothstep(thickness, 0.0, dist);
    float glow = smoothstep(thickness * 8.0, 0.0, dist) * 0.3;
    return core + glow;
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.6 + 0.4 * sin(t * 3.0);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    vec4 tex = texture(u_texture, v_uv);
    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.2);

    float strobe = step(0.6, snoise(vec2(t * 4.0, 0.0)) * 0.5 + 0.5);
    float bolt_active = max(0.4, strobe);

    float arc1 = lightning_branch(v_uv, t, 0.0);
    float arc2 = lightning_branch(v_uv, t * 1.1, 30.0) * 0.7;
    float arc3 = lightning_branch(v_uv, t * 0.9, 60.0) * 0.5;

    float sub1 = lightning_branch(vec2(v_uv.x * 1.5, v_uv.y * 0.8 + 0.1), t * 1.3, 90.0) * 0.3;
    float sub2 = lightning_branch(vec2(v_uv.x * 0.8 + 0.1, v_uv.y * 1.2), t * 0.8, 120.0) * 0.25;

    float total_arc = (arc1 + arc2 + arc3 + sub1 + sub2) * bolt_active;

    vec3 arc_core = vec3(0.7, 0.85, 1.0);
    vec3 arc_glow = vec3(0.3, 0.5, 1.0);
    vec3 arc_outer = vec3(0.15, 0.2, 0.6);

    vec3 arc_color;
    if (total_arc > 0.8) arc_color = arc_core;
    else if (total_arc > 0.3) arc_color = mix(arc_glow, arc_core, (total_arc - 0.3) / 0.5);
    else arc_color = mix(arc_outer, arc_glow, total_arc / 0.3);

    tex.rgb += arc_color * total_arc * eff * 2.0 * mask_effect;

    float plasma = snoise(v_uv * 8.0 + t * 1.5) * 0.5 + 0.5;
    plasma *= snoise(v_uv * 12.0 - t * 1.0) * 0.5 + 0.5;
    plasma = pow(plasma, 1.5);
    tex.rgb += vec3(0.1, 0.15, 0.4) * plasma * eff * 0.5 * mask_effect;

    float flash = pow(max(total_arc - 0.4, 0.0) * 1.7, 2.0);
    tex.rgb += vec3(0.5, 0.6, 1.0) * flash * eff * 0.4 * mask_effect;

    fragColor = mix(orig, tex, mask_effect);
}
