/**
 * Interactive water surface.
 * Ping-pong 2D wave simulation + lit refraction render, driven by pointer motion.
 */

const SIM_SIZE = 512;

const VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
const vec2 UV[3] = vec2[3](vec2(0.0,0.0), vec2(2.0,0.0), vec2(0.0,2.0));
out vec2 vUv;
void main() {
  vUv = UV[gl_VertexID];
  gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
}`;

const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec3 uDrop;
uniform float uRadius;
uniform float uDamping;
out vec4 fragColor;

float decode(float v) { return v - 0.5; }

void main() {
  vec2 uv = vUv;
  vec4 state = texture(uState, uv);
  float prev = decode(state.g);
  float left  = decode(texture(uState, uv - vec2(uTexel.x, 0.0)).r);
  float right = decode(texture(uState, uv + vec2(uTexel.x, 0.0)).r);
  float up    = decode(texture(uState, uv + vec2(0.0, uTexel.y)).r);
  float down  = decode(texture(uState, uv - vec2(0.0, uTexel.y)).r);
  float height = (left + right + up + down) * 0.5 - prev;
  height *= uDamping;

  if (uDrop.z > 0.0) {
    float dist = length(uv - uDrop.xy);
    height += exp(-dist * dist * uRadius) * uDrop.z;
  }

  fragColor = vec4(height + 0.5, state.r, 0.0, 1.0);
}`;

const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
out vec4 fragColor;

vec3 poolTiles(vec2 uv) {
  vec2 tileUV = uv * vec2(28.0, 18.0);
  vec2 tile = fract(tileUV);
  vec2 tileId = floor(tileUV);

  float groutX = smoothstep(0.02, 0.07, tile.x) * smoothstep(0.98, 0.93, tile.x);
  float groutY = smoothstep(0.02, 0.07, tile.y) * smoothstep(0.98, 0.93, tile.y);
  float grout = groutX * groutY;

  float n = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 tileA = vec3(0.07, 0.36, 0.50);
  vec3 tileB = vec3(0.05, 0.30, 0.44);
  vec3 tileColor = mix(tileA, tileB, n);
  vec3 groutColor = vec3(0.03, 0.12, 0.20);
  return mix(groutColor, tileColor, grout);
}

vec3 poolDepth(vec2 uv) {
  float vignette = 1.0 - length((uv - 0.5) * vec2(1.05, 0.85)) * 0.34;
  float depth = mix(0.42, 1.0, clamp(uv.y * 0.92 + vignette * 0.28, 0.0, 1.0));
  return poolTiles(uv) * depth;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  float hL = texture(uHeight, uv - vec2(uTexel.x, 0.0)).r - 0.5;
  float hR = texture(uHeight, uv + vec2(uTexel.x, 0.0)).r - 0.5;
  float hD = texture(uHeight, uv - vec2(0.0, uTexel.y)).r - 0.5;
  float hU = texture(uHeight, uv + vec2(0.0, uTexel.y)).r - 0.5;

  vec3 N = normalize(vec3((hL - hR) * 22.0, (hD - hU) * 22.0, 1.0));
  vec2 duv = N.xy * 0.048;
  vec2 sampleUV = clamp(uv + duv, 0.002, 0.998);

  vec3 floorR = poolDepth(clamp(sampleUV + duv * 0.018, 0.002, 0.998));
  vec3 floorG = poolDepth(sampleUV);
  vec3 floorB = poolDepth(clamp(sampleUV - duv * 0.018, 0.002, 0.998));
  vec3 water = vec3(floorR.r, floorG.g, floorB.b);

  float absorb = mix(0.58, 0.82, uv.y);
  water = mix(water, water * vec3(0.55, 0.86, 1.0), absorb);

  vec3 L = normalize(vec3(-0.25, 0.55, 0.8));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float NdotL = clamp(dot(N, L), 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);

  water += vec3(0.10, 0.22, 0.32) * NdotL * 0.20;

  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 130.0);
  float specSoft = pow(clamp(dot(N, H), 0.0, 1.0), 30.0);
  water += vec3(0.82, 0.94, 1.0) * spec * 0.50;
  water += vec3(0.62, 0.82, 0.98) * specSoft * 0.10;

  vec3 skyReflect = vec3(0.50, 0.78, 0.98);
  water = mix(water, skyReflect * 0.55 + water * 0.45, fresnel * 0.38);

  float ripple = abs(hL) + abs(hR) + abs(hD) + abs(hU);
  float caustic = sin((sampleUV.x + sampleUV.y) * 52.0 + uTime * 1.4 + ripple * 80.0) * 0.5 + 0.5;
  water += vec3(0.40, 0.72, 0.90) * caustic * ripple * 0.14;

  vec2 p = (uv - uPointer);
  p.x *= aspect;
  float ring = abs(length(p) - 0.016);
  water += vec3(0.78, 0.90, 1.0) * smoothstep(0.01, 0.0, ring) * 0.16;
  water += vec3(0.94, 0.98, 1.0) * spec * fresnel * 0.10;

  fragColor = vec4(water, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Shader compile failed");
  }
  return shader;
}

function program(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "Program link failed");
  }
  return p;
}

function makeTarget(gl, size, halfFloat, linear) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const internal = halfFloat ? gl.RGBA16F : gl.RGBA;
  const type = halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, size, size, 0, gl.RGBA, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return null;
  }
  return { tex, fbo, size };
}

function clearTarget(gl, target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.size, target.size);
  gl.clearColor(0.5, 0.5, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

export class WaterSurface {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.gl = null;
    this.running = false;
    this.pointer = { x: 0.5, y: 0.55, px: 0.5, py: 0.55, inside: false };
    this.queue = [];
    this.radius = 800;
    this.time = 0;
    this.last = 0;
    this.ambientAcc = 0;
    this.raf = 0;
    this.fallbackRipples = [];
    this.ctx2d = null;
    this.host = options.host || canvas.parentElement || canvas;

    if (this.reducedMotion) {
      this._initFallback();
      return;
    }

    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });

    if (!this.gl) {
      this._initFallback();
      return;
    }

    try {
      this._initGL();
    } catch (err) {
      console.warn("WebGL water unavailable, using canvas fallback.", err);
      this._initFallback();
    }
  }

  _initGL() {
    const gl = this.gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("EXT_color_buffer_half_float");
    gl.getExtension("OES_texture_float_linear");
    gl.getExtension("OES_texture_half_float_linear");

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.simProgram = program(gl, VERT, SIM_FRAG);
    this.renderProgram = program(gl, VERT, RENDER_FRAG);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.simUniforms = {
      uState: gl.getUniformLocation(this.simProgram, "uState"),
      uTexel: gl.getUniformLocation(this.simProgram, "uTexel"),
      uDrop: gl.getUniformLocation(this.simProgram, "uDrop"),
      uRadius: gl.getUniformLocation(this.simProgram, "uRadius"),
      uDamping: gl.getUniformLocation(this.simProgram, "uDamping"),
    };
    this.renderUniforms = {
      uHeight: gl.getUniformLocation(this.renderProgram, "uHeight"),
      uTexel: gl.getUniformLocation(this.renderProgram, "uTexel"),
      uResolution: gl.getUniformLocation(this.renderProgram, "uResolution"),
      uPointer: gl.getUniformLocation(this.renderProgram, "uPointer"),
      uTime: gl.getUniformLocation(this.renderProgram, "uTime"),
    };

    let half = true;
    this.read = makeTarget(gl, SIM_SIZE, true, false);
    this.write = makeTarget(gl, SIM_SIZE, true, false);
    if (!this.read || !this.write) {
      half = false;
      this.read = makeTarget(gl, SIM_SIZE, false, false);
      this.write = makeTarget(gl, SIM_SIZE, false, false);
    }
    if (!this.read || !this.write) {
      throw new Error("Could not allocate simulation buffers");
    }
    this.halfFloat = half;

    clearTarget(gl, this.read);
    clearTarget(gl, this.write);
    this.mode = "webgl";
    this._bindPointer();
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _initFallback() {
    if (this.gl && this.gl.getExtension) {
      const lose = this.gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
    this.gl = null;
    this.mode = "canvas";
    this.ctx2d = this.canvas.getContext("2d");
    this._bindPointer();
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _drawPoolFallback(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a4a62");
    grad.addColorStop(0.45, "#083d54");
    grad.addColorStop(1, "#052a3a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const tile = 28;
    for (let y = 0; y < h + tile; y += tile) {
      for (let x = 0; x < w + tile; x += tile) {
        const shade = ((x / tile + y / tile) % 2) * 0.04;
        ctx.fillStyle = `rgba(${Math.round(18 + shade * 255)}, ${Math.round(92 + shade * 80)}, ${Math.round(128 + shade * 60)}, 0.22)`;
        ctx.fillRect(x, y, tile - 2, tile - 2);
      }
    }
  }

  _bindPointer() {
    const host = this.host;
    const map = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    };

    host.addEventListener("pointermove", (event) => {
      const p = map(event);
      this.pointer.inside = true;
      this.pointer.px = this.pointer.x;
      this.pointer.py = this.pointer.y;
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      const dx = p.x - this.pointer.px;
      const dy = p.y - this.pointer.py;
      const speed = Math.min(1, Math.hypot(dx, dy) * 22);
      this._disturb(p.x, p.y, 0.04 + speed * 0.08, 1400);
    });

    host.addEventListener("pointerenter", (event) => {
      const p = map(event);
      this.pointer.inside = true;
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this._disturb(p.x, p.y, 0.06, 1100);
    });

    host.addEventListener("pointerleave", () => {
      this.pointer.inside = false;
    });
  }

  _disturb(x, y, strength, radius) {
    this.queue.push({ x, y, strength, radius });
    if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 8);
    if (this.mode === "canvas") {
      this.fallbackRipples.push({
        x,
        y,
        r: 2,
        max: 140 + strength * 900,
        alpha: 0.55 + strength * 2,
        width: 1.2 + strength * 8,
      });
    }
  }

  _resize() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this._tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _tick(dt) {
    this._resize();
    this.ambientAcc += dt;
    if (!this.reducedMotion && this.pointer.inside && this.ambientAcc > 0.045) {
      this.ambientAcc = 0;
      this._disturb(this.pointer.x, this.pointer.y, 0.038, 1300);
    }

    if (this.mode === "webgl") this._drawGL();
    else this._drawFallback(dt);
  }

  _drawGL() {
    const gl = this.gl;
    const texel = 1 / SIM_SIZE;
    const steps = Math.max(1, Math.min(3, this.queue.length));

    gl.useProgram(this.simProgram);
    gl.bindVertexArray(this.vao);

    for (let i = 0; i < steps; i += 1) {
      const drop = this.queue.shift() || { x: 0.5, y: 0.5, strength: 0, radius: this.radius };
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.write.fbo);
      gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
      gl.uniform1i(this.simUniforms.uState, 0);
      gl.uniform2f(this.simUniforms.uTexel, texel, texel);
      gl.uniform3f(this.simUniforms.uDrop, drop.x, drop.y, drop.strength);
      gl.uniform1f(this.simUniforms.uRadius, drop.radius);
      gl.uniform1f(this.simUniforms.uDamping, 0.985);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.read.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const tmp = this.read;
      this.read = this.write;
      this.write = tmp;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.renderProgram);
    gl.uniform1i(this.renderUniforms.uHeight, 0);
    gl.uniform2f(this.renderUniforms.uTexel, texel, texel);
    gl.uniform2f(this.renderUniforms.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.renderUniforms.uPointer, this.pointer.x, this.pointer.y);
    gl.uniform1f(this.renderUniforms.uTime, this.time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.read.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.read.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  _drawFallback(dt) {
    const ctx = this.ctx2d;
    const { width: w, height: h } = this.canvas;
    this._drawPoolFallback(ctx, w, h);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.fallbackRipples = this.fallbackRipples.filter((ripple) => {
      ripple.r += dt * 90;
      ripple.alpha *= 0.985;
      if (ripple.alpha < 0.02 || ripple.r > ripple.max) return false;
      const x = ripple.x * w;
      const y = (1 - ripple.y) * h;
      ctx.beginPath();
      ctx.arc(x, y, ripple.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(210, 230, 255, ${ripple.alpha * 0.55})`;
      ctx.lineWidth = ripple.width;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, ripple.r * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 248, 230, ${ripple.alpha * 0.22})`;
      ctx.lineWidth = ripple.width * 0.45;
      ctx.stroke();
      return true;
    });
    ctx.restore();
  }
}

// made by Firaol Dereje Tsegaye
