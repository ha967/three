import { useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 粒子背景（原生 Canvas 2D 实现）
 *
 * 这个 demo 练的是「渲染循环 + 每帧状态更新」：
 * 1. 每个粒子有位置、速度、半径、颜色；
 * 2. 每帧按 delta 时间更新位置，撞到边界反弹；
 * 3. 鼠标靠近时给粒子一个反向的力；
 * 4. 距离足够近的粒子之间连线，距离越近线越亮；
 * 5. 用 requestAnimationFrame 驱动，页面隐藏或手动暂停时停止循环。
 *
 * 性能提示：
 * - 连线检测是 O(n²)，粒子数量要控制住；
 * - 用一个 Path2D 把同亮度的线段合并后一次 stroke，比每条线 stroke 一次快很多。
 */

const COLORS = ['#4f8cff', '#8b5cf6', '#38bdf8', '#22c55e', '#f59e0b'];
const LINK_DISTANCE = 120;
const MOUSE_RADIUS = 140;
const MAX_SPEED = 1.7;

function createParticle(width, height) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.15 + Math.random() * 0.45;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 1 + Math.random() * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 0.45 + Math.random() * 0.5,
  };
}

export default function ParticleBackgroundNativeDemo() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  // 从 state 同步给渲染循环读取的配置
  const densityRef = useRef(90);
  const linksRef = useRef(true);
  const pausedRef = useRef(false);
  // 由初始化 effect 赋值的控制函数，供其他 effect 调用
  const rebuildRef = useRef(() => {});
  const startRef = useRef(() => {});
  const stopRef = useRef(() => {});

  const [density, setDensity] = useState(90);
  const [showLinks, setShowLinks] = useState(true);
  const [paused, setPaused] = useState(false);

  /**
   * 画布、粒子数据、渲染循环都放在同一个 effect 里：
   * 这些对象只属于当前画布实例，组件卸载时一起销毁，不需要参与 React 渲染。
   */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const size = { width: 0, height: 0, dpr: 1 };
    let particles = [];
    let frame = 0;
    let lastTime = 0;
    const mouse = { x: 0, y: 0, active: false };

    /** 根据当前尺寸和粒子数重新生成粒子 */
    const buildParticles = () => {
      if (size.width < 1 || size.height < 1) return;

      particles = Array.from({ length: densityRef.current }, () =>
        createParticle(size.width, size.height),
      );
    };

    /**
     * 绘制当前这一帧。
     * 先画连线（在粒子下面），再画粒子。
     */
    const renderFrame = () => {
      const context = canvas.getContext('2d');
      const { width, height, dpr } = size;
      if (width < 1 || height < 1) return;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      if (linksRef.current) {
        /*
         * 把连线按距离分成三档，每档一个 Path2D。
         * 这样整帧只需要 3 次 stroke，而不是几千次。
         */
        const nearPath = new Path2D();
        const midPath = new Path2D();
        const farPath = new Path2D();

        for (let i = 0; i < particles.length; i += 1) {
          const a = particles[i];
          for (let j = i + 1; j < particles.length; j += 1) {
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distance = Math.hypot(dx, dy);
            if (distance > LINK_DISTANCE) continue;

            const ratio = distance / LINK_DISTANCE;
            const path = ratio < 0.33 ? nearPath : ratio < 0.66 ? midPath : farPath;
            path.moveTo(a.x, a.y);
            path.lineTo(b.x, b.y);
          }
        }

        context.lineWidth = 1;
        context.strokeStyle = 'rgba(79, 140, 255, 0.22)';
        context.stroke(nearPath);
        context.strokeStyle = 'rgba(79, 140, 255, 0.13)';
        context.stroke(midPath);
        context.strokeStyle = 'rgba(79, 140, 255, 0.07)';
        context.stroke(farPath);
      }

      for (const particle of particles) {
        context.globalAlpha = particle.alpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    /**
     * 每帧更新粒子位置，然后绘制。
     * delta 以 60fps 为基准归一化，这样 120Hz 屏幕上速度不会翻倍。
     */
    const tick = (now) => {
      const previous = lastTime || now;
      lastTime = now;
      const delta = Math.min(32, now - previous) / 16.67;

      for (const particle of particles) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;

        // 撞到边界反弹
        if (particle.x < particle.radius) {
          particle.x = particle.radius;
          particle.vx = Math.abs(particle.vx);
        } else if (particle.x > size.width - particle.radius) {
          particle.x = size.width - particle.radius;
          particle.vx = -Math.abs(particle.vx);
        }

        if (particle.y < particle.radius) {
          particle.y = particle.radius;
          particle.vy = Math.abs(particle.vy);
        } else if (particle.y > size.height - particle.radius) {
          particle.y = size.height - particle.radius;
          particle.vy = -Math.abs(particle.vy);
        }

        // 鼠标斥力：越靠近，推力越大
        if (mouse.active) {
          const dx = particle.x - mouse.x;
          const dy = particle.y - mouse.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0.01 && distance < MOUSE_RADIUS) {
            const force = ((MOUSE_RADIUS - distance) / MOUSE_RADIUS) * 0.5 * delta;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        // 限制最大速度，避免鼠标推得太猛后粒子飞出画面
        const speed = Math.hypot(particle.vx, particle.vy);
        if (speed > MAX_SPEED) {
          particle.vx = (particle.vx / speed) * MAX_SPEED;
          particle.vy = (particle.vy / speed) * MAX_SPEED;
        }
      }

      renderFrame();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame) return;
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    // 暴露给「粒子数」「暂停」等 effect 使用
    rebuildRef.current = () => {
      buildParticles();
      renderFrame();
    };
    startRef.current = start;
    stopRef.current = stop;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (size.width === width && size.height === height && size.dpr === dpr) {
        return;
      }

      size.width = width;
      size.height = height;
      size.dpr = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      buildParticles();
      renderFrame();
    };

    const handlePointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
    };

    const handlePointerLeave = () => {
      mouse.active = false;
    };

    // 页面切到后台时停止循环，回来后按用户是否暂停决定是否恢复
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (!pausedRef.current) {
        start();
      }
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibility);

    start();

    return () => {
      stop();
      observer.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
      rebuildRef.current = () => {};
      startRef.current = () => {};
      stopRef.current = () => {};
    };
  }, []);

  // 粒子数量变化时重建
  useEffect(() => {
    densityRef.current = density;
    rebuildRef.current();
  }, [density]);

  // 连线开关只影响绘制，不需要重建粒子
  useEffect(() => {
    linksRef.current = showLinks;
  }, [showLinks]);

  // 暂停 / 继续
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      stopRef.current();
    } else {
      startRef.current();
    }
  }, [paused]);

  return (
    <div className="particle-demo">
      <header className="particle-header">
        <p className="particle-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>粒子背景</h1>
        <p className="particle-intro">
          粒子在画面中漂浮，距离较近时自动连线；鼠标靠近会产生斥力。
          全部由原生 Canvas 2D 逐帧绘制，重点观察 delta 时间、对象复用和 O(n²) 连线的取舍。
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

      <div className="particle-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="particle-native-canvas" aria-label="粒子背景动画" />
      </div>

      <ul className="particle-notes">
        <li>每帧用 deltaTime 归一化速度，不同刷新率下动画速度保持一致。</li>
        <li>连线按距离分三档合并成 3 个 Path2D，避免每条线单独 stroke。</li>
        <li>鼠标斥力有最大速度限制，防止粒子被推飞后不再回来。</li>
        <li>标签页隐藏或手动暂停时停止 rAF，避免后台空转。</li>
      </ul>
    </div>
  );
}
