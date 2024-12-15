import * as THREE from "three";
// import * as holdEvent from "hold-event";
import * as holdEvent from "https://unpkg.com/hold-event@0.2.0/dist/hold-event.module.js";
// import * as MW from "meshwalk";
import * as MW from '../../public/dist/meshwalk.module.js';
import CameraControls from "camera-controls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { Reflector } from "./Reflector";
import offset from "offset";
import Gravity from "./Gravity";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";

CameraControls.install({ THREE: THREE });

export class VRHall {
  /**
   * 外部传入的配置
   */
  _options = {
    debugger: false, // 开启调试模式
    maxSize: 20, // 画框的尺寸
    // 移动高度
    movieHight: 2,
    // 容器
    container: document.body,
    // 点击元素回调函数
    onClick: null,
    // 相机配置
    cameraOption: {
      position: { x: 0, y: 2, z: 0 },
      lookAt: { x: 2, y: 2, z: 2 },
    },
  };

  // 默认尺寸
  _size = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // 渲染器
  _renderer = null;
  // 相机
  _camera = null;
  // 场景
  _scene = null;
  // 时钟
  _clock = new THREE.Clock();
  // 控制器
  _controls = null;
  // 动画实例
  _requestAnimate = null;
  // 相机和视点的距离
  _EPS = 1e-5;
  // gltf加载器
  _gltfLoader = new GLTFLoader();
  // 屏幕射线
  _raycaster = new THREE.Raycaster();
  // 展厅模型
  _hallMesh = null;
  // 展厅地板名称
  _hallPlaneName = "plane";
  _planeMesh = null;
  // 加载器
  _textLoader = new THREE.TextureLoader();
  // 事件元素
  _eventMeshs = [];
  // 控制器
  _transfromControls = null;

  // 事件
  _events = {};

  // 展品数据
  _itemsData = [];

  // 动画
  _animates = [];

  // 重力感应实例
  gravity = null;

  // 当前使用的视角
  _viewNow = null;
  // 添加视角模式标志
  _viewMode = 'fps'; // 'fps' 或 'tps'

constructor(options) {
  Object.assign(this._options, options);
  this._size.width = this._options.container.clientWidth;
  this._size.height = this._options.container.clientHeight;
  this._init();
  this._bindEvent();
  this._lookat().then(() => {
    if (this._options.callback) {
      this._options.callback();
    }
  });
  this._animate();
  window.addEventListener("resize", this._resize.bind(this));
  // 调试用
  if (this._options.debugger) {
    this._initTransformControls();
    this._scene.add(new THREE.AxesHelper(1000));
  }
  this.gravity = new Gravity(this._controls);

  // 添加视角切换事件监听
  window.addEventListener('keydown', this._onKeyDown.bind(this));
}

// 添加键盘事件处理方法
_onKeyDown(event) {
  if (event.key.toLowerCase() === 't') {
      this._toggleViewMode();
  }
}

// 添加视角切换方法
_toggleViewMode() {
  if (this._viewMode === 'fps') {
      // 切换到第三人称
      this._viewMode = 'tps';
      this._viewNow = this._tpsCameraControls;
      
      // 设置相机位置到第三人称视角
      const position = this._camera.position.clone();
      this._camera.position.set(
          position.x - 5,
          position.y + 3,
          position.z - 5
      );
      
  } else {
      // 切换到第一人称
      this._viewMode = 'fps';
      this._viewNow = this._controls;
      
      // 设置相机位置到第一人称视角
      const playerPosition = this._playerObjectHolder.position.clone();
      this._camera.position.set(
          playerPosition.x,
          playerPosition.y + 2,
          playerPosition.z
      );
  }
}

initVRButton = (target = document.body) => {
  this._renderer.xr.enabled = true;
  this._renderer.xr.setReferenceSpaceType("local");
  target.appendChild(VRButton.createButton(this._renderer));

};

addAnimate(afun) {
  this._animates.push(afun);
}

// 加入到可点击元素
addClickEvent(mesh) {
  this._eventMeshs.push(mesh);
}

// 镜面反射
_reflectorPlane() {
  const size = 1000;
  // 镜面
  const geometry = new THREE.PlaneBufferGeometry(size, size);
  const verticalMirror = new Reflector(geometry, {
    opacity: 0.1,
    textureWidth: size,
    textureHeight: size,
    color: "#fff",
  });
  verticalMirror.material.side = THREE.DoubleSide;
  verticalMirror.material.transparent = true;
  verticalMirror.material.opacity = 0.1;
  verticalMirror.rotation.x = -Math.PI / 2;
  verticalMirror.position.y = this._planeMesh.position.y + 0.1;
  this._scene.add(verticalMirror);
}

  /**
   * 初始化
   */
  async _init() {
  // 初始化渲染器
  this._renderer = new THREE.WebGLRenderer({
    antialias: true, // 抗锯齿
    alpha: true,
    transparent: true,
    logarithmicDepthBuffer: true, // 解决部分Z-Fighting问题，会消耗性能, 安卓开启
  });
  this._renderer.setPixelRatio(window.devicePixelRatio);
  this._renderer.sortObjects = true;
  // this._renderer.outputEncoding = THREE.sRGBEncoding;
  this._renderer.setSize(this._size.width, this._size.height);
  this._options.container.innerHTML = "";
  this._options.container.appendChild(this._renderer.domElement);

  const { width, height } = this._size;

  this._scene = new THREE.Scene();

  // 相机
  this._camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 10000);
  this._scene.add(this._camera);

  // 光
  this._scene.add(new THREE.AmbientLight(0xffffff, 1));
  // 平行光
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(5, 5, 5);
  this._scene.add(dirLight);

  // 控制器，第一人称视角
  this._controls = new CameraControls(
    this._camera,
    this._renderer.domElement
  );
  this._controls.maxDistance = this._EPS;
  this._controls.minZoom = 0.5;
  this._controls.maxZoom = 5;
  this._controls.dragToOffset = false;
  this._controls.distance = 1;
  this._controls.dampingFactor = 0.01; // 阻尼运动
  this._controls.truckSpeed = 0.01; // 拖动速度
  this._controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
  this._controls.mouseButtons.right = CameraControls.ACTION.NONE;
  this._controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM;
  this._controls.touches.three = CameraControls.ACTION.NONE;

  // 初始化键盘控制
  const KEYCODE = {
    W: 87,
    A: 65,
    S: 83,
    D: 68,
    ARROW_LEFT: 37,
    ARROW_UP: 38,
    ARROW_RIGHT: 39,
    ARROW_DOWN: 40,
  };

  // 移动速度
  const moveSpeed = 0.005;
  const cameraControls = this._controls;
  const wKey = new holdEvent.KeyboardKeyHold(KEYCODE.W, 16.666);
  const aKey = new holdEvent.KeyboardKeyHold(KEYCODE.A, 16.666);
  const sKey = new holdEvent.KeyboardKeyHold(KEYCODE.S, 16.666);
  const dKey = new holdEvent.KeyboardKeyHold(KEYCODE.D, 16.666);
  aKey.addEventListener('holding', function (event) { cameraControls.truck(- moveSpeed * event.deltaTime, 0, false) });
  dKey.addEventListener('holding', function (event) { cameraControls.truck(moveSpeed * event.deltaTime, 0, false) });
  wKey.addEventListener('holding', function (event) { cameraControls.forward(moveSpeed * event.deltaTime, false) });
  sKey.addEventListener('holding', function (event) { cameraControls.forward(- moveSpeed * event.deltaTime, false) });

  const leftKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_LEFT, 100);
  const rightKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_RIGHT, 100);
  const upKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_UP, 100);
  const downKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_DOWN, 100);
  leftKey.addEventListener('holding', function (event) { cameraControls.rotate(- 0.1 * THREE.MathUtils.DEG2RAD * event.deltaTime, 0, true) });
  rightKey.addEventListener('holding', function (event) { cameraControls.rotate(0.1 * THREE.MathUtils.DEG2RAD * event.deltaTime, 0, true) });
  upKey.addEventListener('holding', function (event) { cameraControls.rotate(0, - 0.05 * THREE.MathUtils.DEG2RAD * event.deltaTime, true) });
  downKey.addEventListener('holding', function (event) { cameraControls.rotate(0, 0.05 * THREE.MathUtils.DEG2RAD * event.deltaTime, true) });

  // 逆向控制
  this._controls.azimuthRotateSpeed = -0.5; // 方位角旋转速度。
  this._controls.polarRotateSpeed = -0.5; // 极旋转的速度。
  this._controls.saveState();

  // 初始化第三人称，使用meshwalk实现
  this._world = new MW.World();
  this._octree = new MW.Octree();
  this._world.add(this._octree);

  this._playerObjectHolder = new THREE.Object3D();
  this._scene.add(this._playerObjectHolder);

  const playerRadius = .75;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(playerRadius, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
  );
  sphere.position.y = playerRadius;
  this._playerObjectHolder.add(sphere);

  this._playerController = new MW.CharacterController(this._playerObjectHolder, playerRadius);
  this._playerController.teleport(0, 10, 0);
  this._playerController.jumpDuration = 500;
  this._world.add(this._playerController);

  this._tpsCameraControls = new MW.TPSCameraControls(
    this._camera, // three.js camera
    this._playerObjectHolder, // tracking object
    this._world,
    this._renderer.domElement
  );
  // bind events
  this._keyInputControl = new MW.KeyInputControl();
  this._keyInputControl.addEventListener('movekeyon', () => this._playerController.isRunning = true);
  this._keyInputControl.addEventListener('movekeyoff', () => this._playerController.isRunning = false);
  this._keyInputControl.addEventListener('jumpkeypress', () => this._playerController.jump());

  // synk with keybord input and camera control input
  this._keyInputControl.addEventListener('movekeychange', () => {

    var cameraFrontAngle = this._tpsCameraControls.frontAngle;
    var characterFrontAngle = this._keyInputControl.frontAngle;
    this._playerController.direction = cameraFrontAngle + characterFrontAngle;
  });

  // 'updated' event is fired by `tpsCameraControls.update()`
  this._tpsCameraControls.addEventListener('update', () => {
    if (!this._playerController.isRunning) return;

    const cameraFrontAngle = this._tpsCameraControls.frontAngle;
    const characterFrontAngle = this._keyInputControl.frontAngle;
    this._playerController.direction = cameraFrontAngle + characterFrontAngle;

  });

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(14, 1, 5),
    new THREE.MeshNormalMaterial()
  );
  box.position.set(- 3, 7.5, - 13);
  this._scene.add(box);
  this._octree.addGraphNode(box);

  const characterGltf = await new GLTFLoader().loadAsync('./assets/gltfs/miku.glb');
  this._playerObjectHolder.add(characterGltf.scene);

  this._animationController = new MW.AnimationController(characterGltf.scene, characterGltf.animations);
  this._animationController.motion.jump.setLoop(THREE.LoopOnce, 0);
  this._animationController.motion.slide.setLoop(THREE.LoopOnce, 0);
  this._animationController.motion.jump.clampWhenFinished = true;
  this._animationController.motion.slide.clampWhenFinished = true;


  // player motion
  this._playerController.addEventListener('startIdling', () => this._animationController.play('idle'));
  this._playerController.addEventListener('startWalking', () => this._animationController.play('run'));
  this._playerController.addEventListener('startJumping', () => this._animationController.play('jump'));
  this._playerController.addEventListener('startSliding', () => this._animationController.play('slide'));
  this._playerController.addEventListener('startFalling', () => this._animationController.play('slide'));
  this._animationController.play('slide');

  // 一开始默认第一人称视角t
  this._viewNow = this._controls;

}

// 初始调试用的变换控制器
_initTransformControls() {
  // 变换控制器
  this._transformControls = new TransformControls(
    this._camera,
    this._renderer.domElement
  );

  this._transformControls.setSpace("local"); // 本地坐标

  // 操作变换控制器时, 停止相机控制器
  this._transformControls.addEventListener("mouseDown", () => {
    this._controls.enabled = false;
  });

  // 停止变换控制器时, 恢复相机控制器
  this._transformControls.addEventListener("mouseUp", () => {
    this._controls.enabled = true;
  });

  // 变换控制改变时打印位置信息
  this._transformControls.addEventListener("objectChange", (e) => {
    const { position, scale, rotation } = this._transformControls.object;
    console.log(
      `position:{x:${position.x},y:${position.y},z:${position.z}},scale:{x:${scale.x},y:${scale.y},z:${scale.z}},rotation:{x:${rotation.x},y:${rotation.y},z:${rotation.z}}`
    );
  });

  // q 移动 w旋转 e缩放
  window.addEventListener("keydown", (e) => {
    e.key === "q" && this._transformControls.setMode("translate");
    e.key === "w" && this._transformControls.setMode("rotate");
    e.key === "e" && this._transformControls.setMode("scale");
  });

  this._scene.add(this._transformControls);
}

/**
 * 重新设置大小
 */
_resize() {
  this._size.width = this._options.container.clientWidth;
  this._size.height = this._options.container.clientHeight;
  this._renderer.setSize(this._size.width, this._size.height);
  // 更新相机的宽高比
  this._camera.aspect = this._size.width / this._size.height;
  this._camera.updateProjectionMatrix();
}

createAnimate(
  gltf,
  { animateIndex, duration } = { animateIndex: 0, duration: 10 }
) {
  // 调用动画
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const ani = gltf.animations[animateIndex];
  const AnimationAction = mixer.clipAction(ani);
  AnimationAction.setDuration(duration).play();
  mixer.update(0);
  // 加入动画
  this.addAnimate((d) => {
    mixer.update(d);
  });

  return mixer;
}

// 查看作品
viewItem(id) {
  const item = this._itemsData.find((d) => d.id === id);
  if (item) {
    this.moveTo(item.view, item.position);
  } else {
    console.error("id不存在", id);
  }
}

/**
 * 移动动画
 * @param {*} to
 * @param {*} lookat
 * @param {*} duration
 */
moveTo(position, lookat, duration) {
  this._controls.saveState();
  const lookatV3 = new THREE.Vector3(position.x, position.y, position.z);
  lookatV3.lerp(new THREE.Vector3(lookat.x, lookat.y, lookat.z), this._EPS);

  // 获取当前的lookAt参数
  const fromPosition = new THREE.Vector3();
  const fromLookAt = new THREE.Vector3();
  this._controls.getPosition(fromPosition);
  this._controls.getTarget(fromLookAt);

  const lookatV32 = new THREE.Vector3(position.x, position.y, position.z);
  lookatV32.lerp(new THREE.Vector3(lookat.x, lookat.y, lookat.z), this._EPS);

  this._controls.setLookAt(
    position.x,
    position.y,
    position.z,
    lookatV3.x,
    lookatV3.y,
    lookatV3.z,
    true
  );
}

_findParentOdata(mesh) {
  if (mesh.odata) {
    console.log(mesh);
    return mesh;
  } else {
    if (mesh.parent) {
      return this._findParentOdata.bind(this)(mesh.parent);
    } else {
      return null;
    }
  }
}

/**
 * 传入坐标，返回当前的raycaster屏幕坐标
 * x, y 是画布相对坐标
 */
_getBoxRaycaster({ x, y }, meshes) {
  // 射线计算
  const container = this._options.container;
  this._mouse = new THREE.Vector2();
  this._mouse.set(
    (x / container.clientWidth) * 2 - 1,
    -(y / container.clientHeight) * 2 + 1
  );
  this._raycaster.setFromCamera(this._mouse, this._camera);
  const intersects = this._raycaster.intersectObjects(
    [...meshes, ...this._eventMeshs],
    true
  );
  const intersect = intersects[0];
  if (intersect) {
    const v3 = intersects[0].point;
    const lookat = this._camera.position.lerp(v3, 1 + this._EPS);
    // 点击元素
    const mesh = intersect.object;

    // 因为被点击的元素可能是子元素，所以要溯源，找到父元素的odata
    const odataMesh = this._findParentOdata(mesh);

    // 如果点击的是画框，初始化控制器
    if (this._options.debugger && odataMesh && this._transformControls) {
      this._transformControls.attach(odataMesh);
    }

    // 元素点击事件
    if (odataMesh && this._options.onClick) {
      this._options.onClick(odataMesh.odata);
    }

    return { position: v3, lookat, mesh };
  } else {
    console.log("点击空气？");
  }

  return false;
}

  /**
   * 初始化视角
   * @returns
   */
  async _lookat() {
  if (!this._options.cameraOption) {
    return;
  }
  const { position, lookAt } = this._options.cameraOption;
  const lookatV3 = new THREE.Vector3(position.x, position.y, position.z);
  lookatV3.lerp(new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z), this._EPS);
  this._controls.zoomTo(0.8);
  await this._controls.setLookAt(
    position.x,
    position.y,
    position.z,
    lookatV3.x,
    lookatV3.y,
    lookatV3.z,
    false
  );
}

/**
 * 动画
 */
_animate() {
  const delta = this._clock.getDelta();
  if (this._viewNow) {
    this._viewNow.update(delta);
  }

  if (this._renderer) {
    this._renderer.render(this._scene, this._camera);
  }

  if (this._animates) {
    this._animates.forEach((afun) => {
      afun(delta);
    });
  }

  if (this._world) {
    this._world.fixedUpdate();
  }

  if (this._animationController) {
    this._animationController.update(delta);
  }

  this._requestAnimate = requestAnimationFrame(this._animate.bind(this));
}

_mouseDown(event) {
  this._events.startXY = { x: event.clientX, y: event.clientY };
}

_mouseUp(event) {
  // x, y 偏移
  const { top, left } = offset(this._options.container);
  const { x, y } = this._events.startXY;
  const offsetPoor = 2;

  // 判断是否点击事件，如果偏移量小于2就是点击事件
  if (
    Math.abs(event.clientX - x) > offsetPoor ||
    Math.abs(event.clientY - y) > offsetPoor
  ) {
    return;
  }

  const rayRes = this._getBoxRaycaster(
    {
      x: event.clientX - left,
      y: event.clientY - top,
    },
    [this._hallMesh]
  );

  if (rayRes) {
    const { position, lookat, mesh } = rayRes;
    // 点击地面移动
    console.log("rayRes", mesh, rayRes, position, {
      x: event.clientX - left,
      y: event.clientY - top,
    });
    if (mesh.name === this._hallPlaneName) {
      // 移动
      this.moveTo(
        { x: position.x, y: this._options.movieHight, z: position.z },
        { x: lookat.x, y: this._options.movieHight, z: lookat.z },
        3
      );
    }
  }
}

/**
 * 事件绑定
 */
_bindEvent() {
  this._options.container.addEventListener(
    "mousedown",
    this._mouseDown.bind(this)
  );
  this._options.container.addEventListener(
    "mouseup",
    this._mouseUp.bind(this)
  );
}

/**
 * 加载模型
 * url 模型URL
 * position 模型摆放位置
 * rotation 模型旋转角度
 * scale 模型缩放大小
 * onProgress 模型加载进度 progress => void;
 * callback 回调函数 mesh => void;
 * animate 动画函数 () => void;
 * @param {*} url
 */
loadGLTF(params) {
  return new Promise((resolve) => {
    const {
      url,
      position,
      scale = 1,
      rotation,
      onProgress,
      animate,
      autoLight, // 自动增亮
    } = params;
    this._gltfLoader.load(
      url,
      (gltf) => {
        const mesh = gltf.scene;
        const box = new THREE.Box3()
          .setFromObject(mesh)
          .getSize(new THREE.Vector3());
        console.log("box模型大小", url, box, mesh);

        if (autoLight) {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              // child.frustumCulled = false;
              //模型阴影，开启阴影比较消耗性能
              child.castShadow = true;
              //模型自发光
              child.material.emissive = child.material.color;
              child.material.emissiveMap = child.material.map;
            }
          });
        }

        mesh.scale.set(scale, scale, scale);
        if (position) {
          mesh.position.y = position.y;
          mesh.position.x = position.x;
          mesh.position.z = position.z;
        }
        if (rotation) {
          mesh.rotation.y = rotation.y;
          mesh.rotation.x = rotation.x;
          mesh.rotation.z = rotation.z;
        }
        this._scene.add(mesh);
        if (animate) {
          mesh.animations = animate;
        }
        resolve(gltf);
      },
      (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      },
      (err) => {
        console.error(err);
      }
    );
  });
}

  /**
   * 载入展厅模型
   * url 模型URL
   * planeName 地板名称
   * position 模型摆放位置
   * rotation 模型旋转角度
   * scale 模型缩放大小
   * onProgress 模型加载进度
   * callback 回调函数
   */
  async loadHall(params) {
  this._hallPlaneName = params.planeName;
  return await this.loadGLTF({ ...params }).then((gltf) => {
    this._hallMesh = gltf.scene;
    gltf.scene.traverse((mesh) => {
      if (mesh.name === params.planeName) {
        this._planeMesh = mesh;
        this._octree.addGraphNode(mesh);
      }
    });
    return gltf;
  });
}

/**
 * 载入展品数据
 */
loadItems(data) {
  this._itemsData = data;
  const { maxSize } = this._options;
  data.forEach(async (item) => {
    const texture = await this._textLoader.loadAsync(item.url);
    if (texture.image.width > maxSize) {
      item.width = maxSize;
      item.height = (maxSize / texture.image.width) * texture.image.height;
    } else {
      item.height = MAX;
      item.width = (maxSize / texture.image.height) * texture.image.width;
    }

    const geometry = new THREE.BoxGeometry(
      item.width,
      item.height,
      item.depth ? item.depth : 2
    );
    const materialBorder = new THREE.MeshBasicMaterial({
      color: item.color ? item.color : "#ffffff",
      map: this._textLoader.load("./assets/room1/wall.png"),
    });
    const material = new THREE.MeshBasicMaterial({
      color: item.color ? item.color : "#ffffff",
      map: texture,
    });
    const cube = new THREE.Mesh(geometry, [
      materialBorder,
      materialBorder,
      materialBorder,
      materialBorder,
      materialBorder,
      material,
    ]);
    cube.name = item.name;
    cube.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
    cube.scale.set(item.scale.x, item.scale.y, item.scale.z);
    cube.position.set(item.position.x, item.position.y, item.position.z);
    cube.odata = item;
    this._scene.add(cube);
    this._eventMeshs.push(cube);
  });
}

/**
 * 销毁
 */
destroy() {
  this._options.container.removeEventListener(
    "mousedown",
    this._mouseDown.bind(this)
  );
  this._options.container.removeEventListener(
    "mouseup",
    this._mouseUp.bind(this)
  );
  window.removeEventListener("resize", this._resize.bind(this));

  // 重力感应实例
  this.gravity = null;
  this.gravity.destroy();

  this._renderer.dispose();

  this._options = null;
  // 渲染器
  this._renderer = null;
  // 相机
  this._camera = null;
  // 场景
  this._scene = null;
  // 时钟
  this._clock = null;
  // 控制器
  this._controls = null;
  // 动画实例
  cancelAnimationFrame(this._requestAnimate);
  this._requestAnimate = null;
  // gltf加载器
  this._gltfLoader = null;
  // 屏幕射线
  this._raycaster = null;
  // 展厅模型
  this._hallMesh = null;
  // 展厅地板名称
  this._planeMesh = null;
  // 加载器
  this._textLoader = null;
  // 事件元素
  this._eventMeshs = null;
  // 控制器
  this._transfromControls = null;

  // 事件
  this._events = null;

  // 展品数据
  this._itemsData = null;

  // 动画
  this._animates = null;
}
}
