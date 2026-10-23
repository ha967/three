/**
 * Three.js 资源释放工具。
 *
 * 为什么要专门做这件事？
 * Three.js 创建的几何体、材质、贴图、WebGL 上下文都占用 GPU 显存，
 * JavaScript 的垃圾回收管不到它们。React 组件卸载（以及 React StrictMode
 * 在开发环境下「挂载 → 卸载 → 再挂载」）时如果只移除 canvas，GPU 资源会残留。
 * 来回切换 demo 几次后，浏览器可能因为 WebGL 上下文数量超限而黑屏。
 *
 * 使用时机：组件卸载、切换路由、热更新之前。
 */

/**
 * 递归释放一棵 Object3D 子树上的几何体、材质和贴图。
 *
 * @param {import('three').Object3D} root 场景或任意物体
 */
export function disposeObject3D(root) {
  root.traverse((object) => {
    // 几何体描述顶点数据（位置、法线、UV……），每个都对应 GPU 上的缓冲区
    if (object.geometry) {
      object.geometry.dispose();
    }

    // 一个物体可能有一个材质，也可能是材质数组（多材质几何体）
    if (!object.material) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(disposeMaterial);
  });
}

/**
 * 释放单个材质。
 *
 * 材质上可能挂着贴图（map、normalMap、roughnessMap……），
 * 贴图本身也占显存，必须单独 dispose。
 * 简单直接的做法是遍历材质的所有属性，凡是 Texture 就释放。
 *
 * @param {import('three').Material} material
 */
function disposeMaterial(material) {
  Object.values(material).forEach((value) => {
    // isTexture 是 Three.js 给纹理实例打的标记位，比 instanceof 更可靠
    if (value && value.isTexture) {
      value.dispose();
    }
  });

  material.dispose();
}

/**
 * 释放渲染器。
 *
 * renderer.dispose() 会释放渲染器自己持有的 GPU 资源；
 * forceContextLoss() 则主动丢弃 WebGL 上下文，尽快把上下文名额还给浏览器。
 * 两者配合可以避免开发阶段反复挂载导致的「Too many active WebGL contexts」。
 *
 * @param {import('three').WebGLRenderer} renderer
 */
export function disposeRenderer(renderer) {
  renderer.dispose();
  renderer.forceContextLoss();
}
