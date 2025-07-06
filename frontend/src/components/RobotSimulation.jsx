import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';

const RobotSimulation = forwardRef(({ urdfUrl, onLoad }, ref) => {
  const mountRef = useRef(null);
  const robotInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0); // 新增状态来显示进度

  useImperativeHandle(ref, () => ({
    setJointAngle: (jointName, angle) => {
      if (robotInstanceRef.current && robotInstanceRef.current.joints) {
        const joint = robotInstanceRef.current.joints[jointName];
        if (joint && typeof joint.setJointValue === 'function') {
          try {
            joint.setJointValue(angle);
          } catch (error) {
            console.warn(`设置关节 ${jointName} 角度失败:`, error);
          }
        } else {
          console.warn(`关节 ${jointName} 不存在或没有setJointValue方法`);
        }
      }
    },
    getJoints: () => {
      return robotInstanceRef.current ? robotInstanceRef.current.joints : null;
    },
    getRobot: () => robotInstanceRef.current,
  }));

  useEffect(() => {
    if (!mountRef.current || !urdfUrl) return;
    
    const currentMount = mountRef.current;
    let animationFrameId;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x282c34);

    const camera = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(1.5, 1.5, 1.5);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.shadowMap.enabled = true;
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(10, 20, 0x555555, 0x444444);
    scene.add(gridHelper);

    const loader = new URDFLoader();
    loader.load(
        urdfUrl, 
        (robot) => {
            console.log('URDF模型加载成功:', robot);
            
            robot.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            robot.rotation.x = -Math.PI / 2;
            
            scene.add(robot);
            robotInstanceRef.current = robot;
            
            if (onLoad) {
              onLoad(robot);
            }
            
            setIsLoading(false);
        }, 
        // =================================================================
        // [MODIFIED] 这是本次修正的核心：增加对progress对象的空值检查
        // =================================================================
        (progress) => {
            // 只有当progress对象有效时，才更新进度
            if (progress && progress.total > 0) {
                const percent = (progress.loaded / progress.total * 100);
                setLoadingProgress(percent);
                console.log('加载进度:', percent.toFixed(2) + '%');
            }
        }, 
        (err) => {
            console.error('URDF加载错误:', err);
            // 提供更友好的错误信息
            const errorMessage = err.message || (err.target && err.target.src ? `无法加载文件: ${err.target.src}` : '未知错误');
            setError(`加载机器人模型失败: ${errorMessage}`);
            setIsLoading(false);
        }
    );

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (currentMount) {
        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [urdfUrl]);

  // 使用新的 state 来显示更详细的加载信息
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {isLoading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <div>加载机器人模型中...</div>
          <div style={{ marginTop: '8px', fontSize: '12px' }}>{loadingProgress.toFixed(0)}%</div>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff4d4f', background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '8px' }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default RobotSimulation;