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

float crack_pattern(vec2 uv, float t) {
    float crack = 0.0;
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 origin = vec2(
            0.3 + 0.4 * hash(vec2(fi, 0.0)),
            0.3 + 0.4 * hash(vec2(0.0, fi))
        );
        vec2 delta = uv - origin;
        float angle = atan(delta.y, delta.x);
        float dist = length(delta);

        float branch_noise = snoise(vec2(angle * 3.0 + fi * 20.0, t * 0.3)) * 0.5 + 0.5;
        float crack_width = 0.008 + 0.004 * branch_noise;
        float crack_line = snoise(vec2(angle * 8.0 + fi * 10.0, dist * 15.0 + t * 0.5));

        float line_mask = smoothstep(crack_width, 0.0, abs(crack_line) * 0.1);
        float dist_fade = smoothstep(0.5, 0.1, dist);
        crack += line_mask * dist_fade * (0.5 + 0.5 * branch_noise);
    }
    return min(crack, 1.0);
}

void main() {
    float mask_val = texture(u_mask, v_uv).r;
    vec4 orig = texture(u_texture, v_uv);
    float mask_effect = 1.0 - smoothstep(0.3, 0.7, mask_val);
    if (mask_effect < 0.001) { fragColor = orig; return; }

    float t = u_time + float(u_frame_idx) * 0.15;
    float pulse = 0.7 + 0.3 * sin(t * 1.0);
    float inten = u_intensity * pulse;
    float eff = inten + 0.15;

    float crack = crack_pattern(v_uv, t);

    float edge_glow_width = 0.15 + inten * 0.1;
    float edge_glow = smoothstep(edge_glow_width, 0.0, abs(crack - 0.5) * 2.0);
    edge_glow *= step(0.1, crack);

    float warp_strength = crack * eff * 0.18 * mask_effect;
    vec2 warp_dir = vec2(
        snoise(v_uv * 6.0 + t * 0.5),
        snoise(v_uv * 6.0 + t * 0.5 + 40.0)
    );
    vec2 warped_uv = clamp(v_uv + warp_dir * warp_strength, 0.002, 0.998);

    vec4 tex = texture(u_texture, warped_uv);
    vec4 feedback = texture(u_feedback, v_uv);
    tex = mix(tex, feedback, eff * 0.25);

    vec3 void_color = vec3(0.01, 0.0, 0.02);
    float star_field = hash(floor(v_uv * 200.0 + t * 0.1));
    star_field = step(0.995, star_field);
    float twinkle = sin(t * 3.0 + hash(floor(v_uv * 200.0)) * 20.0) * 0.5 + 0.5;
    vec3 void_content = void_color + vec3(star_field * twinkle * 0.8);

    float nebula = snoise(v_uv * 3.0 + t * 0.1) * 0.5 + 0.5;
    nebula *= snoise(v_uv * 5.0 - t * 0.15) * 0.5 + 0.5;
    void_content += vec3(0.1, 0.0, 0.15) * nebula * 0.5;

    float crack_interior = smoothstep(0.2, 0.5, crack);
    tex.rgb = mix(tex.rgb, void_content, crack_interior * eff * 1.2 * mask_effect);

    vec3 rim_cyan = vec3(0.0, 0.8, 1.0);
    vec3 rim_magenta = vec3(0.8, 0.0, 1.0);
    float rim_phase = snoise(v_uv * 4.0 + t * 0.3) * 0.5 + 0.5;
    vec3 rim_color = mix(rim_cyan, rim_magenta, rim_phase);
    tex.rgb += rim_color * edge_glow * eff * 1.2 * mask_effect;

    float refract_strength = edge_glow * eff * 0.08 * mask_effect;
    vec2 refract_uv = clamp(v_uv + warp_dir * refract_strength, 0.002, 0.998);
    vec3 refracted = texture(u_texture, refract_uv).rgb;
    tex.rgb = mix(tex.rgb, refracted, edge_glow * 0.3 * (1.0 - crack_interior));

    fragColor = mix(orig, tex, mask_effect);
}
