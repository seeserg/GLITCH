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

float hash1(float n) {
    return fract(sin(n) * 43758.5453);
}

vec3 quantize(vec3 col, float levels) {
    return floor(col * levels + 0.5) / levels;
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
    vec2 blockSize = vec2(8.0) / u_resolution;
    vec2 blockIdx = floor(uv / blockSize);
    vec2 blockUV = blockIdx * blockSize;

    float corruptSeed = floor(t * 3.0);
    float corruptNoise = hash(blockIdx + corruptSeed * 17.3);
    float corruptThreshold = 1.0 - eff * 0.7;
    bool isCorrupt = corruptNoise > corruptThreshold;

    float blockType = hash(blockIdx * 3.7 + corruptSeed * 11.1);

    vec4 tex = orig;

    if (isCorrupt) {
        if (blockType < 0.3) {
            vec2 shiftR = blockUV + vec2(blockSize.x * hash(blockIdx + 1.0) * 4.0, 0.0);
            vec2 shiftB = blockUV + vec2(0.0, blockSize.y * hash(blockIdx + 2.0) * 4.0);
            vec2 localUV = fract(uv / blockSize) * blockSize;
            tex.r = texture(u_texture, clamp(shiftR + localUV, 0.0, 1.0)).r;
            tex.g = orig.g;
            tex.b = texture(u_texture, clamp(shiftB + localUV, 0.0, 1.0)).b;
        } else if (blockType < 0.55) {
            float qLevels = 2.0 + floor(hash(blockIdx + 5.0) * 4.0);
            tex.rgb = quantize(orig.rgb, qLevels);
        } else if (blockType < 0.8) {
            vec2 srcBlock = floor(vec2(
                hash(blockIdx + corruptSeed * 7.0) * u_resolution.x / 8.0,
                hash(blockIdx + corruptSeed * 13.0) * u_resolution.y / 8.0
            ));
            vec2 srcUV = srcBlock * blockSize + fract(uv / blockSize) * blockSize;
            tex = texture(u_texture, clamp(srcUV, 0.0, 1.0));
        } else {
            float shift = (hash(blockIdx + 9.0) - 0.5) * 0.3;
            tex.rgb = orig.rgb + vec3(shift, -shift * 0.5, shift * 0.8);
        }

        vec2 withinBlock = fract(uv / blockSize);
        float edge = 1.0 - step(0.05, withinBlock.x) * step(0.05, withinBlock.y)
                    * (1.0 - step(0.95, withinBlock.x)) * (1.0 - step(0.95, withinBlock.y));
        tex.rgb += vec3(0.08) * edge;
    }

    float lineNoise = hash(vec2(floor(uv.y * u_resolution.y), corruptSeed));
    float glitchLine = step(1.0 - eff * 0.05, lineNoise);
    if (glitchLine > 0.5) {
        float lineShift = (hash(vec2(floor(uv.y * u_resolution.y * 2.0), corruptSeed + 3.0)) - 0.5) * 0.08 * eff;
        vec2 shiftedUV = vec2(uv.x + lineShift, uv.y);
        tex = texture(u_texture, clamp(shiftedUV, 0.0, 1.0));
        tex.rgb += vec3(0.05, -0.02, 0.03) * eff;
    }

    float macroblock = snoise(blockIdx * 0.5 + corruptSeed) * 0.5 + 0.5;
    if (macroblock > (1.0 - eff * 0.2)) {
        tex.rgb = mix(tex.rgb, quantize(tex.rgb, 3.0), 0.5 * eff);
    }

    fragColor = mix(orig, tex, mask_effect);
}
