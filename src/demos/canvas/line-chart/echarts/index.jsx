import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import './index.css';

/**
 * 手写折线图（ECharts 实现）
 *
 * 和原生版的区别：
 * - 原生版自己算布局、比例尺、刻度和 tooltip；
 * - ECharts 版用配置描述「要什么」，布局、动画、坐标轴和交互由库完成。
 *
 * 这个 demo 重点观察：
 * 1. init 出来的实例需要和 DOM 生命周期绑定，卸载时 dispose；
 * 2. 容器尺寸变化要调用 chart.resize()，ECharts 不会自动监听；
 * 3. 数据更新通过 setOption；第二个参数 true 表示不合并旧配置。
 */

const MONTHS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

const FONT_FAMILY =
  '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif';

function makeSeries(base, spread) {
  return Array.from({ length: MONTHS.length }, (_, index) => {
    const wave = Math.sin(index * 0.7) * spread * 0.35;
    return Math.max(20, Math.round(base + wave + Math.random() * spread));
  });
}

function makeData() {
  return {
    visits: makeSeries(1800, 900),
    orders: makeSeries(520, 260),
  };
}

function buildOption(data) {
  return {
    color: ['#4f8cff', '#8b5cf6'],
    textStyle: {
      fontFamily: FONT_FAMILY,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e4e7ec',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#1f2937', fontSize: 12 },
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(148, 163, 184, 0.65)', type: 'dashed' },
      },
      valueFormatter: (value) => value.toLocaleString('zh-CN'),
    },
    legend: {
      top: 12,
      left: 16,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 20,
      textStyle: { color: '#667085', fontSize: 13 },
    },
    grid: {
      left: 12,
      right: 24,
      top: 54,
      bottom: 16,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: MONTHS,
      axisLine: { lineStyle: { color: '#e4e7ec' } },
      axisTick: { show: false },
      axisLabel: { color: '#98a2b3', fontSize: 12, margin: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eef1f5' } },
      axisLabel: {
        color: '#98a2b3',
        fontSize: 12,
        formatter: (value) =>
          value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value),
      },
    },
    series: [
      {
        name: '访问量',
        type: 'line',
        smooth: 0.35,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        emphasis: { focus: 'series' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79, 140, 255, 0.26)' },
            { offset: 1, color: 'rgba(79, 140, 255, 0)' },
          ]),
        },
        data: data.visits,
      },
      {
        name: '订单数',
        type: 'line',
        smooth: 0.35,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        emphasis: { focus: 'series' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(139, 92, 246, 0.2)' },
            { offset: 1, color: 'rgba(139, 92, 246, 0)' },
          ]),
        },
        data: data.orders,
      },
    ],
    animationDuration: 600,
    animationEasing: 'cubicOut',
  };
}

export default function LineChartEChartsDemo() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [data, setData] = useState(() => makeData());

  /**
   * 初始化图表实例。
   * 这里必须用原生 DOM 容器；ECharts 会在内部创建 canvas。
   * 卸载时 dispose，否则实例和事件监听会一直留在内存里。
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = echarts.init(container);
    chartRef.current = chart;

    // ECharts 不会自动响应容器尺寸，需要手动调用 resize
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  /** 数据更新：setOption 第二个参数为 true，表示完全替换而不是合并旧配置 */
  useEffect(() => {
    chartRef.current?.setOption(buildOption(data), true);
  }, [data]);

  return (
    <div className="chart-demo">
      <header className="chart-header">
        <p className="chart-eyebrow">CANVAS 2D · ECHARTS 实现</p>
        <h1>折线图（ECharts）</h1>
        <p className="chart-intro">
          同样的双系列折线图改用 ECharts：通过配置声明坐标轴、图例、渐变面积和
          tooltip，动画与交互由库处理。可以和原生版对照阅读。
        </p>
      </header>

      <div className="chart-toolbar">
        <span className="chart-toolbar__hint">悬停查看某个月的数据</span>
        <div className="chart-toolbar__end">
          <button
            type="button"
            className="chart-button"
            onClick={() => setData(makeData())}
          >
            刷新数据
          </button>
        </div>
      </div>

      <div className="chart-stage chart-echarts-stage" ref={containerRef} />

      <ul className="chart-notes">
        <li>ECharts 只负责“画”，实例生命周期仍要自己管理：init → setOption → resize → dispose。</li>
        <li>容器尺寸变化不会自动触发重绘，需要 ResizeObserver 调用 chart.resize()。</li>
        <li>渐变面积用 echarts.graphic.LinearGradient 描述，不需要创建 canvas 上下文。</li>
        <li>setOption 第二个参数为 true 时完全替换配置，适合整批数据刷新。</li>
      </ul>
    </div>
  );
}
