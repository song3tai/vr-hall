import * as THREE from "three";

export default class Robot {
  constructor(vr, gltf, options = {}) {
    this._vr = vr;
    this.gltf = gltf;
    this._options = {
        followDistance: 5,   // 跟随距离
        moveSpeed: 0.1,     // 降低移动速度使运动更平滑
        rotateSpeed: 0.1,    // 旋转速度 
        heightOffset: -1.5,     // 高度偏移量，可以微调机器人相对于相机的高度
        ...options
    };

    this.gltf.scene.odata = { id: "robot" };
    this._vr.addClickEvent(this.gltf.scene);
    // 创建动画混合器
    this.mixer = this._vr.createAnimate(gltf, { animateIndex: 0, duration: 5 });
    // 添加更新函数到动画循环
    this._vr.addAnimate(this.update.bind(this));
  }

  update(delta) {
    // 获取相机位置
    const cameraPosition = new THREE.Vector3();
    this._vr._camera.getWorldPosition(cameraPosition);
    
    // 计算机器人到相机的向量
    const robotToCamera = this.gltf.scene.position.clone().sub(cameraPosition);
    
    // 如果距离小于目标距离，机器人远离摄像机，如果距离大于目标距离，机器人靠近摄像机
    const currentDistance = robotToCamera.length();
    let distanceToGo = currentDistance - this._options.followDistance;
    if (currentDistance < this._options.followDistance) {
        distanceToGo = this._options.followDistance;
    }
     // 标准化向量并设置目标距离
     robotToCamera.normalize().multiplyScalar(distanceToGo);
     // 计算新的目标位置
     const targetPosition = cameraPosition.clone().add(robotToCamera);
     // 保持相同的高度
     targetPosition.y = cameraPosition.y + this._options.heightOffset;
     // 平滑移动
     this.gltf.scene.position.lerp(targetPosition, this._options.moveSpeed);
    
    // 始终让机器人面向相机
    const targetAngle = Math.atan2(
      cameraPosition.x - this.gltf.scene.position.x,
      cameraPosition.z - this.gltf.scene.position.z
    );
    
    // 平滑旋转
    let currentRotation = this.gltf.scene.rotation.y;
    const angleDiff = targetAngle - currentRotation;
    
    // 处理角度差超过PI的情况
    if (angleDiff > Math.PI) {
      currentRotation += Math.PI * 2;
    } else if (angleDiff < -Math.PI) {
      currentRotation -= Math.PI * 2;
    }
    
    this.gltf.scene.rotation.y += (targetAngle - currentRotation) * this._options.rotateSpeed;
  }

  destroy() {
    // 清理资源
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this._vr._scene.remove(this.gltf.scene);
    this.gltf.scene = null;
    this._vr = null;
  }
}
