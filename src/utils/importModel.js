import { GLTFLoader } from "three/examples/jsm/Addons.js";

class LoadModel {
    constructor() {
        this.loader = new GLTFLoader();
    }

    init(scene) {
        this.loader.load(('/city/scene.gltf'), function (gltf) {
            scene.add(gltf.scene)
        }, undefined, function (err) {
            console.log('err', err);
        });
    }
}

export { LoadModel}