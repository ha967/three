import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { LoadModel } from "../utils/importModel";

const loadModelUtil = new LoadModel();

const clock = new THREE.Clock();

// 1.创建渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
const WIDTH = 700;
const HEIGHT = 700;
renderer.pixelRatio = window.devicePixelRatio;
renderer.setSize(WIDTH, HEIGHT);
document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;

// 2.创建场景
const scene = new THREE.Scene();
// 3.创建物体
const geometry = new THREE.BoxGeometry(4, 4, 4);
// 4.创建材质
const material = new THREE.MeshStandardMaterial({ color: 0xfff0000 });
const cube = new THREE.Mesh(geometry, material);
cube.castShadow = true;

// 5.创建相机
const camera = new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.1, 1000);

// 环境光
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 0, 10);
directionalLight.castShadow = true;

// 新建一个平面 该平面能够接受投射过来的阴影效果
const planeGeometry = new THREE.PlaneGeometry(20, 20);
const planMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
const planeMesh = new THREE.Mesh(planeGeometry, planMaterial);
planeMesh.rotation.x = -0.5 * Math.PI;
planeMesh.position.set(0, -3, 0);
planeMesh.receiveShadow = true;
scene.add(planeMesh);

// 方向光的辅助线
const directionalLightHelper = new THREE.DirectionalLightHelper(
  directionalLight
);

loadModelUtil.init(scene);
scene.add(directionalLightHelper);

scene.add(directionalLight);

camera.position.set(5, 5, 10);
camera.lookAt(0, 0, 0);

// 创建坐标系
const axis = new THREE.AxesHelper(5);

scene.add(axis);
scene.add(cube);

const controls = new OrbitControls(camera, renderer.domElement);
controls.update();

function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  cube.rotation.y = elapsedTime * Math.PI;
  renderer.render(scene, camera);
}
// 渲染
renderer.render(scene, camera);
animate();
