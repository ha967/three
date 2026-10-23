import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import './index.css';

/**
 * 粒子背景（PixiJS 实现）
 *
 * 和原生版的区别：
 * - 原生版每帧清空 canvas，再用 Canvas 2D API 画圆和线；
 * - PixiJS 版把每个粒子做成 Sprite，由 WebGL 批量渲染，
 *   连线用 Graphics 逐帧重画，页面上的对象由 Pixi 管理。
 *
 * 这个 demo 重点观察：
 * 1. Pixi Application 是异步初始化的（await app.init）；
 * 2. Sprite 共享同一张贴图，只有位置、颜色、大小不同；
 * 3. ticker 提供 deltaMS，用它更新位置可以适配不同刷新率；
 * 4. React StrictMode 下 effect 会执行两次，异步初始化必须处理取消。
 */

// Pixi 使用 16 进制数字表示颜色
const COLORS = [0x4f8cff, 0x8b5cf6, 0x38bdf8, 0x22c55e, 0xf59e0b];
const LINK_DISTANCE = 120;
const MOUSE_RADIUS = 140;
const MAX_SPEED = 1.7;
const LINK_ALPHAS = [0.24, 0.14, 0.08];

export default function ParticleBackgroundPixiDemo() {
  const wrapRef = useRef(null);
  const appRef = useRef(null);
  // 由 effect 内部赋值，供“粒子数”滑块触发重建
  const rebuildRef = useRef(() => {});
  // 配置的 ref 镜像，ticker 回调里读取它们
  const densityRef = useRef(90);
  const linksRef = useRef(true);
  const pausedRef = useRef(false);

  const [density, setDensity] = useState(90);
  const [showLinks, setShowLinks] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = wrapRef.current;
    if (!host) return undefined;

    let disposed = false;
    let app;
    let initialized = false;
    let resizeObserver;
    let cleanupCanvasListeners = () => {};
    let rebuild = () => {};

    const init = async () => {
      app = new Application();
      await app.init({
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
        backgroundAlpha: 0,
        antialias: true,
        // 高分屏按 DPR 渲染，autoDensity 负责把 CSS 尺寸对应回去
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      initialized = true;

      // 如果组件在 await 期间被卸载，直接销毁，不再操作 DOM。
      // 注意：初始化完成前不要 destroy，否则 Pixi 内部插件还没准备好，会报错。
      if (disposed) {
        app.destroy(true, { children: true, texture: true });
        app = null;
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.className = 'particle-pixi-canvas';
      appRef.current = app;

      // ── 用 Graphics 画一个白色圆，生成一张可复用的粒子贴图 ──
      const circle = new Graphics();
      circle.circle(0, 0, 4).fill(0xffffff);
      const texture = app.renderer.generateTexture({
        target: circle,
        resolution: 2,
        antialias: true,
      });
      circle.destroy();

      // 连线分三档，分别画在三个 Graphics 里，减少绘制状态切换
      const linkLayers = LINK_ALPHAS.map(() => new Graphics());
      const particleLayer = new Container();
      app.stage.addChild(...linkLayers, particleLayer);

      const particles = [];
      const mouse = { x: 0, y: 0, active: false };

      /** 按当前尺寸和密度重建粒子 */
      rebuild = () => {
        particleLayer.removeChildren().forEach((child) => child.destroy());
        particles.length = 0;

        const width = app.screen.width;
        const height = app.screen.height;

        for (let index = 0; index < densityRef.current; index += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.15 + Math.random() * 0.45;
          const sprite = new Sprite(texture);

          sprite.anchor.set(0.5);
          sprite.tint = COLORS[Math.floor(Math.random() * COLORS.length)];
          sprite.alpha = 0.45 + Math.random() * 0.5;
          // 贴图本身是 8×8，缩放后得到不同大小的粒子
          sprite.scale.set(0.8 + Math.random() * 0.8);
          sprite.x = Math.random() * width;
          sprite.y = Math.random() * height;

          particleLayer.addChild(sprite);
          particles.push({
            sprite,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 4 * sprite.scale.x,
          });
        }
      };

      rebuild();
      rebuildRef.current = rebuild;

      /** 每帧更新位置、应用鼠标斥力、重画连线 */
      const update = (ticker) => {
        const delta = Math.min(32, ticker.deltaMS) / 16.67;
        const width = app.screen.width;
        const height = app.screen.height;

        for (const particle of particles) {
          const sprite = particle.sprite;
          sprite.x += particle.vx * delta;
          sprite.y += particle.vy * delta;

          if (sprite.x < particle.radius) {
            sprite.x = particle.radius;
            particle.vx = Math.abs(particle.vx);
          } else if (sprite.x > width - particle.radius) {
            sprite.x = width - particle.radius;
            particle.vx = -Math.abs(particle.vx);
          }

          if (sprite.y < particle.radius) {
            sprite.y = particle.radius;
            particle.vy = Math.abs(particle.vy);
          } else if (sprite.y > height - particle.radius) {
            sprite.y = height - particle.radius;
            particle.vy = -Math.abs(particle.vy);
          }

          if (mouse.active) {
            const dx = sprite.x - mouse.x;
            const dy = sprite.y - mouse.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0.01 && distance < MOUSE_RADIUS) {
              const force = ((MOUSE_RADIUS - distance) / MOUSE_RADIUS) * 0.5 * delta;
              particle.vx += (dx / distance) * force;
              particle.vy += (dy / distance) * force;
            }
          }

          const speed = Math.hypot(particle.vx, particle.vy);
          if (speed > MAX_SPEED) {
            particle.vx = (particle.vx / speed) * MAX_SPEED;
            particle.vy = (particle.vy / speed) * MAX_SPEED;
          }
        }

        linkLayers.forEach((layer) => layer.clear());
        if (!linksRef.current) return;

        // 按距离收集线段，分到三个亮度档位
        const segments = [[], [], []];

        for (let i = 0; i < particles.length; i += 1) {
          const a = particles[i].sprite;
          for (let j = i + 1; j < particles.length; j += 1) {
            const b = particles[j].sprite;
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (distance > LINK_DISTANCE) continue;

            const ratio = distance / LINK_DISTANCE;
            const bucket = ratio < 0.33 ? 0 : ratio < 0.66 ? 1 : 2;
            segments[bucket].push(a.x, a.y, b.x, b.y);
          }
        }

        segments.forEach((points, index) => {
          const graphics = linkLayers[index];
          for (let i = 0; i < points.length; i += 4) {
            graphics.moveTo(points[i], points[i + 1]);
            graphics.lineTo(points[i + 2], points[i + 3]);
          }
          graphics.stroke({
            width: 1,
            color: 0x4f8cff,
            alpha: LINK_ALPHAS[index],
          });
        });
      };

      app.ticker.add(update);

      // 如果用户提前点了暂停，初始化完成后保持暂停
      if (pausedRef.current) {
        app.ticker.stop();
      }

      const handlePointerMove = (event) => {
        const rect = app.canvas.getBoundingClientRect();
        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;
        mouse.active = true;
      };

      const handlePointerLeave = () => {
        mouse.active = false;
      };

      app.canvas.addEventListener('pointermove', handlePointerMove);
      app.canvas.addEventListener('pointerleave', handlePointerLeave);
      cleanupCanvasListeners = () => {
        app.canvas.removeEventListener('pointermove', handlePointerMove);
        app.canvas.removeEventListener('pointerleave', handlePointerLeave);
      };

      // 容器尺寸变化时同步 renderer 尺寸并重建粒子
      resizeObserver = new ResizeObserver(() => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        if (app.screen.width === width && app.screen.height === height) return;

        app.renderer.resize(width, height);
        rebuild();
      });
      resizeObserver.observe(host);
    };

    init().catch((initError) => {
      console.error(initError);
      setError('PixiJS 初始化失败，可能是当前浏览器不支持 WebGL。');
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      cleanupCanvasListeners();
      // 只销毁已经完成 init 的实例；还在初始化中的实例会在 await 之后自行销毁
      if (app && initialized) {
        app.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, []);

  // 粒子数量变化时重建（应用可能还没初始化完，重建函数会先等待赋值）
  useEffect(() => {
    densityRef.current = density;
    rebuildRef.current();
  }, [density]);

  // 连线开关
  useEffect(() => {
    linksRef.current = showLinks;
  }, [showLinks]);

  // 暂停 / 继续 Pixi 的 ticker
  useEffect(() => {
    pausedRef.current = paused;
    const app = appRef.current;
    if (!app) return;

    if (paused) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  }, [paused]);

  // 后台标签页暂停，返回时恢复（用户手动暂停时不恢复）
  useEffect(() => {
    const handleVisibility = () => {
      const app = appRef.current;
      if (!app) return;

      if (document.hidden) {
        app.ticker.stop();
      } else if (!pausedRef.current) {
        app.ticker.start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className="particle-demo">
      <header className="particle-header">
        <p className="particle-eyebrow">CANVAS 2D · PIXIJS 实现</p>
        <h1>粒子背景（PixiJS）</h1>
        <p className="particle-intro">
          同样的效果改用 PixiJS：粒子是共享贴图的 Sprite，由 WebGL 批量绘制；
          位置更新仍然在 ticker 回调用普通 JavaScript 完成。可以和原生版对照性能与代码组织。
        </p>
      </header>

      <div className="particle-toolbar">
        <label className="particle-slider">
          <span>粒子数</span>
          <input
            type="range"
            min={30}
            max={180}
            step={10}
            value={density}
            onChange={(event) => setDensity(Number(event.target.value))}
          />
          <span className="particle-slider-value">{density}</span>
        </label>

        <label className="particle-check">
          <input
            type="checkbox"
            checked={showLinks}
            onChange={(event) => setShowLinks(event.target.checked)}
          />
          显示连线
        </label>

        <div className="particle-toolbar__end">
          <button
            type="button"
            className="particle-button particle-button--primary"
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? '继续' : '暂停'}
          </button>
        </div>
      </div>

      {error && <p className="particle-error">{error}</p>}

      <div className="particle-stage" ref={wrapRef} />

      <ul className="particle-notes">
        <li>Application.init 是异步的，await 之后才能拿到 app.canvas 和 renderer。</li>
        <li>所有粒子共享同一张圆形贴图，用 tint 设置颜色，显存占用更小。</li>
        <li>连线仍然逐帧重画，使用三个 Graphics 分档，避免逐条线切换透明度。</li>
        <li>StrictMode 下 effect 会执行两次，异步初始化完成后要检查是否已被取消。</li>
      </ul>
    </div>
  );
}
