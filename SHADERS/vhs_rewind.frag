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

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 rainbow(float phase) {
    return vec3(
        sin(phase) * 0.5 + 0.5,
        sin(phase + 2.094) * 0.5 + 0.5,
        sin(phase + 4.189) * 0.5 + 0.5
    );
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

    float rollSpeed = t * 2.5 * eff;
    uv.y = fract(uv.y + rollSpeed * 0.1);

    float smearAmount = sin(t * 8.0 + uv.y * 3.0) * 0.5 + 0.5;
    smearAmount *= eff * 0.15;
    uv.x += smearAmount * sin(t * 12.0 + uv.y * 20.0);

    float bandCount = 5.0;
    float bandPhase = t * 3.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float bandY = fract(fi * 0.237 + bandPhase * (0.1 + fi * 0.05));
        float bandWidth = 0.02 + 0.03 * sin(t * 2.0 + fi);
        float bandDist = abs(uv.y - bandY);
        float bandStrength = smoothstep(bandWidth, 0.0, bandDist);

        float displacement = snoise(vec2(t * 5.0 + fi * 10.0, uv.y * 30.0)) * 0.1 * eff;
        uv.x += displacement * bandStrength;
    }

    uv = clamp(uv, 0.002, 0.998);

    float redShift = eff * 0.008;
    float rUV = uv.x + redShift * sin(uv.y * 50.0 + t * 6.0);
    float bUV = uv.x - redShift * 0.5 * sin(uv.y * 40.0 + t * 5.0);

    vec4 tex;
    tex.r = texture(u_texture, clamp(vec2(rUV, uv.y), 0.002, 0.998)).r;
    tex.g = texture(u_texture, uv).g;
    tex.b = texture(u_texture, clamp(vec2(bUV, uv.y), 0.002, 0.998)).b;
    tex.a = 1.0;

    float staticNoise = hash(vec2(floor(uv.x * u_resolution.x), floor(uv.y * u_resolution.y) + t * 100.0));

    float bandStaticBoost = 0.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float bandY = fract(fi * 0.237 + t * 3.0 * (0.1 + fi * 0.05));
        float bandDist = abs(v_uv.y - bandY);
        bandStaticBoost += smoothstep(0.05, 0.0, bandDist) * 0.5;
    }
    float staticAmount = eff * (0.08 + bandStaticBoost);
    tex.rgb = mix(tex.rgb, vec3(staticNoise), staticAmount * mask_effect);

    float dispGrad = abs(uv.x - v_uv.x) * 20.0;
    vec3 fringe = rainbow(dispGrad * 6.28 + t * 2.0) * 0.3;
    tex.rgb += fringe * smoothstep(0.0, 0.01, abs(uv.x - v_uv.x)) * eff * mask_effect;

    float scanline = 0.92 + 0.08 * sin(v_uv.y * u_resolution.y * 3.14159);
    tex.rgb *= scanline;

    tex.rgb = mix(tex.rgb, tex.rgb * vec3(1.1, 1.0, 0.95), eff * 0.2);

    fragColor = mix(orig, tex, mask_effect);
}
