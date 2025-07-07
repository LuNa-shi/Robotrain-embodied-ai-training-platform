import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import URDFLoader from 'urdf-loader';

const RobotSimulation = forwardRef(({ urdfUrl, onLoad }, ref) => {
  const mountRef = useRef(null);
  const robotInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

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
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    const camera = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // 创建光照系统
    const createLightingSystem = () => {
      // 环境光 - 提供基础照明
      const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
      scene.add(ambientLight);

      // 主方向光 - 从正上方照射
      const mainDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      mainDirectionalLight.position.set(0, 10, 0); // 正上方
      mainDirectionalLight.target.position.set(0, 0, 0); // 指向底座中心
      mainDirectionalLight.castShadow = true;

      // 优化阴影设置
      mainDirectionalLight.shadow.mapSize.width = 4096;
      mainDirectionalLight.shadow.mapSize.height = 4096;
      mainDirectionalLight.shadow.camera.near = 0.5;
      mainDirectionalLight.shadow.camera.far = 20;
      mainDirectionalLight.shadow.camera.left = -5;
      mainDirectionalLight.shadow.camera.right = 5;
      mainDirectionalLight.shadow.camera.top = 5;
      mainDirectionalLight.shadow.camera.bottom = -5;
      mainDirectionalLight.shadow.bias = -0.0001;
      mainDirectionalLight.shadow.normalBias = 0.05;

      scene.add(mainDirectionalLight);
      scene.add(mainDirectionalLight.target);

      return { mainDirectionalLight };
    };

    const lights = createLightingSystem();

    // 创建地面和网格
    const createGround = () => {
      const groundGeometry = new THREE.PlaneGeometry(20, 20);
      const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2c3e50,
        transparent: true,
        opacity: 0.8
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.1;
      ground.receiveShadow = true;
      scene.add(ground);

      const gridHelper = new THREE.GridHelper(20, 40, 0x444444, 0x333333);
      gridHelper.position.y = 0;
      scene.add(gridHelper);
    };

    createGround();

    // 创建后处理效果
    const createPostProcessing = () => {
      const composer = new EffectComposer(renderer);
      
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3,
        0.4,
        0.85
      );
      composer.addPass(bloomPass);

      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * renderer.getPixelRatio());
      fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * renderer.getPixelRatio());
      composer.addPass(fxaaPass);

      return composer;
    };

    const composer = createPostProcessing();

    const loader = new URDFLoader();
    loader.load(
        urdfUrl, 
        (robot) => {
            console.log('URDF模型加载成功:', robot);
            
            robot.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (child.material) {
                  if (child.material.type === 'MeshBasicMaterial') {
                    child.material = new THREE.MeshPhongMaterial({
                      color: child.material.color,
                      shininess: 50,
                      specular: 0x555555
                    });
                  } else if (child.material.type === 'MeshLambertMaterial') {
                    child.material = new THREE.MeshPhongMaterial({
                      color: child.material.color,
                      shininess: 50,
                      specular: 0x555555
                    });
                  }
                  
                  child.material.envMapIntensity = 0.5;
                  child.material.needsUpdate = true;
                }
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
        (progress) => {
            if (progress && progress.total > 0) {
                const percent = (progress.loaded / progress.total * 100);
                setLoadingProgress(percent);
                console.log('加载进度:', percent.toFixed(2) + '%');
            }
        }, 
        (err) => {
            console.error('URDF加载错误:', err);
            const errorMessage = err.message || (err.target && err.target.src ? `无法加载文件: ${err.target.src}` : '未知错误');
            setError(`加载机器人模型失败: ${errorMessage}`);
            setIsLoading(false);
        }
    );

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      composer.render();
    };
    animate();

    const handleResize = () => {
      if (currentMount) {
        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        renderer.setSize(width, height);
        composer.setSize(width, height);
        
        const fxaaPass = composer.passes.find(pass => pass.material && pass.material.uniforms && pass.material.uniforms.resolution);
        if (fxaaPass) {
          fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * renderer.getPixelRatio());
          fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * renderer.getPixelRatio());
        }
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
      composer.dispose();
    };
  }, [urdfUrl]);

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