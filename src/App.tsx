import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, extend, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, Float, Text } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry";

// 注册 TextGeometry
extend({ TextGeometry });

// ===========================
// Part 1: 基础 Hooks
// ===========================

const useAudioInput = () => {
  const [volume, setVolume] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const startListening = useCallback(async () => {
    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
      if (isListening) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      setIsListening(true);
    } catch (err) {
      console.error("麦克风错误:", err);
    }
  }, [isListening]);

  useEffect(() => {
    if (!isListening) return;
    const analyze = () => {
      if (!analyserRef.current) return;
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      const normVolume = Math.min(1, average / 50);
      setVolume((prev) => prev * 0.8 + normVolume * 0.2);
      rafIdRef.current = requestAnimationFrame(analyze);
    };
    analyze();
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isListening]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return { volume, startListening, isListening };
};

// ===========================
// Part 2: 视觉组件
// ===========================

const OrbitingBubbles = () => {
  const count = 120;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const radius = 6 + Math.random() * 12;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 15;
      const speed = 0.1 + Math.random() * 0.4;
      const size = 0.1 + Math.random() * 0.5;
      temp.push({ radius, angle, y, speed, size, offset: Math.random() * 100 });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (!mesh.current) return;
    const time = state.clock.elapsedTime;
    particles.forEach((p, i) => {
      const currentAngle = p.angle + time * p.speed * 0.2;
      const x = Math.cos(currentAngle) * p.radius;
      const z = Math.sin(currentAngle) * p.radius;
      const floatY = p.y + Math.sin(time + p.offset) * 0.5;
      dummy.position.set(x, floatY, z);
      dummy.scale.set(p.size, p.size, p.size);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial
        color="#FF69B4"
        emissive="#FF1493"
        emissiveIntensity={0.6}
        transparent
        opacity={0.7}
      />
    </instancedMesh>
  );
};

const RotatingContainer = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.15;
  });
  return <group ref={ref}>{children}</group>;
};

type CandleState = "LIT" | "BLOWING" | "EXTINGUISHED";

const SimpleFlame = ({
  state,
  volume,
  position,
}: {
  state: CandleState;
  volume: number;
  position: [number, number, number];
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((stateThree, delta) => {
    if (!groupRef.current || !lightRef.current) return;
    const targetScale =
      state === "EXTINGUISHED" ? 0 : state === "BLOWING" ? 0.85 : 1;
    groupRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      delta * 4
    );
    const shake =
      state === "BLOWING" ? (Math.random() - 0.5) * volume * 0.5 : 0;
    groupRef.current.position.x = position[0] + shake;
    groupRef.current.position.z = position[2] + shake;
    lightRef.current.intensity = THREE.MathUtils.lerp(
      lightRef.current.intensity,
      state === "EXTINGUISHED" ? 0 : 1.2,
      delta * 3
    );
  });
  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.15, 0]}>
        <coneGeometry args={[0.06, 0.3, 16]} />
        <meshStandardMaterial
          color="#FF4500"
          emissive="#FFD700"
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        distance={2}
        decay={2}
        color="#FFD700"
        intensity={1.2}
        position={[0, 0.2, 0]}
      />
    </group>
  );
};

const SampledParticles = ({
  geometry,
  count,
  color,
  scale,
  position,
  size = 0.02,
  emissiveIntensity = 0.6,
}: any) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => {
    const tempPositions = [];
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const sampler = new MeshSurfaceSampler(mesh).build();
    const tempPosition = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      sampler.sample(tempPosition);
      tempPositions.push(tempPosition.clone());
    }
    return tempPositions;
  }, [geometry, count]);
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    positions.forEach((pos, i) => {
      dummy.position.copy(pos);
      const s = scale * (0.6 + Math.random() * 0.8);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, dummy, scale]);
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      position={position}
    >
      <sphereGeometry args={[size, 6, 6]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        roughness={0.5}
      />
    </instancedMesh>
  );
};

const TieredCakeWithCandles = ({
  candleState,
  volume,
}: {
  candleState: CandleState;
  volume: number;
}) => {
  const bottomGeo = useMemo(
    () => new THREE.CylinderGeometry(1.8, 1.8, 0.8, 64),
    []
  );
  const middleGeo = useMemo(
    () => new THREE.CylinderGeometry(1.3, 1.3, 0.8, 64),
    []
  );
  const topGeo = useMemo(
    () => new THREE.CylinderGeometry(0.8, 0.8, 0.8, 64),
    []
  );
  const candleGeo = useMemo(
    () => new THREE.CylinderGeometry(0.04, 0.04, 0.5, 32),
    []
  );
  const candlePositions = useMemo(() => {
    const pos = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      pos.push([Math.cos(angle) * 0.5, 2.45, Math.sin(angle) * 0.5]);
    }
    return pos;
  }, []);
  return (
    <group position={[0, -1.2, 0]}>
      <SampledParticles
        geometry={bottomGeo}
        count={5000}
        color="#FFC0CB"
        scale={1}
        position={[0, 0.4, 0]}
      />
      <SampledParticles
        geometry={middleGeo}
        count={3500}
        color="#FF69B4"
        scale={1}
        position={[0, 1.2, 0]}
      />
      <SampledParticles
        geometry={topGeo}
        count={2000}
        color="#FF1493"
        scale={1}
        position={[0, 2.0, 0]}
      />
      {candlePositions.map((pos, idx) => (
        <group key={idx}>
          <SampledParticles
            geometry={candleGeo}
            count={300}
            color="#FFF8DC"
            scale={0.6}
            position={pos}
            emissiveIntensity={0.2}
          />
          <SimpleFlame
            state={candleState}
            volume={volume}
            position={[
              pos[0] as number,
              (pos[1] as number) + 0.25,
              pos[2] as number,
            ]}
          />
        </group>
      ))}
    </group>
  );
};

const Explosion = ({ color, position, delay }: any) => {
  const count = 150;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [start, setStart] = useState(false);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        )
          .normalize()
          .multiplyScalar(Math.random() * 0.3 + 0.2),
        pos: new THREE.Vector3(0, 0, 0),
        life: 1.0,
        scaleBase: Math.random() * 0.5 + 0.5,
      })),
    []
  );
  useEffect(() => {
    const t = setTimeout(() => setStart(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  useFrame((state, delta) => {
    if (!start || !mesh.current) return;
    particles.forEach((p, i) => {
      if (p.life > 0) {
        p.pos.add(p.velocity);
        p.velocity.y -= delta * 0.4;
        p.life -= delta * 0.8;
        const s = Math.max(0, p.life * p.scaleBase);
        dummy.position.copy(p.pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.current!.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.set(0, 0, 0);
        mesh.current!.setMatrixAt(i, dummy.matrix);
      }
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (!start) return null;
  return (
    <group position={position}>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <dodecahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={8}
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
};

const TypewriterText = ({
  text,
  speed = 80,
}: {
  text: string;
  speed?: number;
}) => {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    setDisplayedText("");
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText((prev) => prev + text.charAt(index));
        index++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return (
    <div style={{ whiteSpace: "pre-wrap", textAlign: "justify" }}>
      {displayedText}
    </div>
  );
};

// ===========================
// Part 3: 蓝色稀疏星尘粒子数字
// ===========================

const ParticleNumber = ({
  num,
  onComplete,
}: {
  num: number;
  onComplete: () => void;
}) => {
  const particleCount = 350;

  const font = useLoader(
    FontLoader,
    "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json"
  );
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    const textGeo = new TextGeometry(String(num), {
      font: font,
      size: 4,
      height: 0.5,
      curveSegments: 6,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.05,
      bevelOffset: 0,
      bevelSegments: 3,
    });
    textGeo.center();

    const sampler = new MeshSurfaceSampler(
      new THREE.Mesh(textGeo, new THREE.MeshBasicMaterial())
    ).build();
    const tempPosition = new THREE.Vector3();
    const data = [];

    for (let i = 0; i < particleCount; i++) {
      sampler.sample(tempPosition);
      data.push({
        target: tempPosition.clone(),
        current: new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 20 + 20
        ),
        velocity: new THREE.Vector3(0, 0, 0),
        speed: 0.03 + Math.random() * 0.04,
        jitter: Math.random() * 0.2,
      });
    }
    return data;
  }, [font, num]);

  const [time, setTime] = useState(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const t = time + delta;
    setTime(t);

    particles.forEach((p, i) => {
      if (t < 0.8) {
        p.current.lerp(p.target, p.speed * 3.5);
      } else if (t < 1.5) {
        p.current.x = p.target.x + Math.sin(t * 5 + i) * 0.1;
        p.current.y = p.target.y + Math.cos(t * 5 + i) * 0.1;
      } else {
        if (p.velocity.lengthSq() === 0) {
          p.velocity
            .copy(p.current)
            .normalize()
            .multiplyScalar(Math.random() * 0.6 + 0.3);
          p.velocity.z += 0.8;
        }
        p.current.add(p.velocity);
      }

      dummy.position.copy(p.current);
      let scale = 0.12 * (0.5 + Math.random() * 0.5);
      if (t < 0.5) scale *= t * 2;
      else if (t > 1.5) scale *= Math.max(0, 1 - (t - 1.5) * 1.5);

      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (t > 2.0) onComplete();
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        color="#00BFFF"
        emissive="#00BFFF"
        emissiveIntensity={4}
        toneMapped={false}
        transparent
        opacity={0.9}
      />
    </instancedMesh>
  );
};

const ParticleCountdown = ({ onFinished }: { onFinished: () => void }) => {
  const [count, setCount] = useState(3);
  const handleNext = () => {
    if (count > 1) {
      setCount((c) => c - 1);
    } else {
      onFinished();
    }
  };
  return (
    <group position={[0, 0, 0]}>
      <React.Suspense fallback={null}>
        <ParticleNumber key={count} num={count} onComplete={handleNext} />
      </React.Suspense>
    </group>
  );
};

// ===========================
// Part 4: 可爱 Loading 界面
// ===========================

const CuteLoadingScreen = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 1;
      });
    }, 15);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 600,
        background: "#0a000a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Noto Serif SC', serif",
      }}
    >
      <div
        style={{
          color: "#FFB7C5",
          fontSize: "1.5rem",
          marginBottom: "20px",
          letterSpacing: "2px",
          animation: "pulse 1.5s infinite",
        }}
      >
        {progress < 100 ? "✨ 正在收集魔法能量..." : "能量充满！"}
      </div>

      <div
        style={{
          width: "300px",
          height: "12px",
          background: "rgba(255,255,255,0.1)",
          borderRadius: "20px",
          overflow: "hidden",
          padding: "2px",
          boxShadow: "0 0 10px rgba(255,105,180,0.2)",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #FF69B4, #8A2BE2)",
            borderRadius: "20px",
            transition: "width 0.1s linear",
            position: "relative",
            boxShadow: "0 0 15px #FF69B4",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translate(50%, -50%)",
              width: "10px",
              height: "10px",
              background: "#fff",
              borderRadius: "50%",
              boxShadow: "0 0 10px #fff",
            }}
          />
        </div>
      </div>

      <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
    </div>
  );
};

// ===========================
// Part 5: 其他组件 (信件、手势、引导)
// ===========================

const InteractiveLetterSystem = ({
  available,
  isLetterOpen,
  setIsLetterOpen,
}: {
  available: boolean;
  isLetterOpen: boolean;
  setIsLetterOpen: (v: boolean) => void;
}) => {
  const letterContent = `亲爱的罗萱：

生日快乐！

当烟花亮起的时候，希望你也像它们一样耀眼。

这一刻的烛光、蛋糕和魔法，都是为你准备的。

愿你年年岁岁，平安喜乐。

(在此处继续输入你真挚的内容...)

2026.02.16
爱你的 XXX`;

  if (!available) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          pointerEvents: isLetterOpen ? "none" : "auto",
          opacity: isLetterOpen ? 0 : 1,
          transition: "opacity 0.3s",
        }}
      >
        <button
          onClick={() => setIsLetterOpen(true)}
          style={{
            padding: "12px 35px",
            background: "linear-gradient(45deg, #FFD700, #FFA500)",
            color: "#fff",
            border: "none",
            borderRadius: "50px",
            cursor: "pointer",
            boxShadow: "0 0 20px rgba(255, 215, 0, 0.6)",
            fontFamily: "'Noto Serif SC', serif",
            fontSize: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "pulse 2s infinite",
          }}
        >
          <span style={{ fontSize: "1.4rem" }}>✉️</span> 待查收的信件
          <style>{`@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }`}</style>
        </button>
      </div>

      {isLetterOpen && (
        <div
          onClick={() => setIsLetterOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 400,
            backdropFilter: "blur(3px)",
            animation: "fadeIn 0.3s forwards",
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }`}</style>
        </div>
      )}

      {isLetterOpen && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "85%",
            maxWidth: "600px",
            maxHeight: "75vh",
            overflowY: "auto",
            background: "#fffcf5",
            padding: "40px",
            borderRadius: "12px",
            boxShadow: "0 25px 50px rgba(0,0,0,0.8)",
            border: "2px solid #d4af37",
            fontFamily: "'Noto Serif SC', serif",
            color: "#5a4a42",
            zIndex: 500,
            animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <style>{`@keyframes slideUp { from { opacity:0; transform:translate(-50%, -40%); } to { opacity:1; transform:translate(-50%, -50%); } }`}</style>
          <button
            onClick={() => setIsLetterOpen(false)}
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              width: "32px",
              height: "32px",
              background: "transparent",
              border: "1px solid #c0a060",
              borderRadius: "50%",
              color: "#c0a060",
              fontSize: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ×
          </button>
          <h2
            style={{
              textAlign: "center",
              color: "#d4af37",
              margin: "0 0 30px 0",
              fontSize: "1.8rem",
            }}
          >
            致 罗萱
          </h2>
          <div style={{ fontSize: "1.15rem", lineHeight: "1.8" }}>
            <TypewriterText text={letterContent} speed={50} />
          </div>
        </div>
      )}
    </>
  );
};

const SceneController = ({ volume, candleState, setCandleState }: any) => {
  const blowDuration = useRef(0);
  const startTime = useRef(Date.now());
  useFrame((state, delta) => {
    if (candleState === "EXTINGUISHED") return;
    if (Date.now() - startTime.current < 3000) return;
    const isBlowing = volume > 0.35;
    if (isBlowing) {
      if (candleState !== "BLOWING") setCandleState("BLOWING");
      blowDuration.current += delta;
    } else {
      if (candleState === "BLOWING") setCandleState("LIT");
      blowDuration.current = Math.max(0, blowDuration.current - delta * 3);
    }
    if (blowDuration.current > 1.2 || volume > 0.9)
      setCandleState("EXTINGUISHED");
  });
  return null;
};

const IntroScreen = ({ onNext }: { onNext: () => void }) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 600,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: "'Noto Serif SC', serif",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "4rem",
          margin: "0 0 20px 0",
          color: "#FF69B4",
          textShadow: "0 0 20px #FF1493",
          fontFamily: "'Great Vibes', cursive",
        }}
      >
        Happy Birthday
      </h1>
      <p style={{ fontSize: "1.5rem", margin: "10px 0", letterSpacing: "2px" }}>
        对着镜头 举起双手 唤醒魔法
      </p>
      <p
        style={{
          fontSize: "1.5rem",
          margin: "10px 0",
          letterSpacing: "2px",
          color: "#FFB7C5",
        }}
      >
        持续吹气 许下心愿
      </p>
      <button
        onClick={onNext}
        style={{
          marginTop: "50px",
          padding: "15px 50px",
          fontSize: "1.3rem",
          borderRadius: "50px",
          border: "none",
          background: "linear-gradient(45deg, #FF1493, #8A2BE2)",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 0 30px rgba(255, 20, 147, 0.8)",
          fontWeight: "bold",
          letterSpacing: "2px",
        }}
      >
        进入奇幻世界
      </button>
    </div>
  );
};

const FakeGestureScreen = ({ onDetected }: { onDetected: () => void }) => {
  const [status, setStatus] = useState("SCANNING");

  useEffect(() => {
    const t1 = setTimeout(() => setStatus("DETECTED"), 3500);
    const t2 = setTimeout(onDetected, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDetected]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 500,
        background: "black",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "300px",
          height: "300px",
          border: "2px solid rgba(255, 105, 180, 0.3)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: "2px solid #FF1493",
            animation: "pulseRing 2s linear infinite",
            opacity: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "70%",
            height: "70%",
            borderRadius: "50%",
            border: "1px solid #FF69B4",
            animation: "pulseRing 2s linear infinite 0.5s",
            opacity: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, #FF1493, transparent)",
            top: "50%",
            animation: "scanLine 2s ease-in-out infinite",
          }}
        />
        <div
          style={{
            fontSize: "4rem",
            color: status === "SCANNING" ? "#555" : "#FFD700",
            transition: "color 0.5s",
          }}
        >
          {status === "SCANNING" ? "✋" : "✨"}
        </div>
      </div>
      <style>{`
                @keyframes pulseRing { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
                @keyframes scanLine { 0% { top: 0%; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
            `}</style>
      <div
        style={{
          marginTop: "40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "white",
          fontFamily: "'Noto Serif SC', serif",
          zIndex: 501,
        }}
      >
        <h2
          style={{
            fontSize: "3rem",
            margin: 0,
            color: status === "SCANNING" ? "white" : "#FFD700",
            textShadow: "0 0 20px #FF1493",
          }}
        >
          {status === "SCANNING" ? "举起双手" : "魔法已确认!"}
        </h2>
        <p
          style={{
            fontSize: "1.2rem",
            marginTop: "10px",
            letterSpacing: "3px",
            color: "#ccc",
          }}
        >
          {status === "SCANNING" ? "正在感应魔法波动..." : "能量连接成功"}
        </p>
      </div>
    </div>
  );
};

// ===========================
// Part 6: 主程序
// ===========================
type AppStage = "INTRO" | "LOADING" | "GESTURE" | "COUNTDOWN" | "MAIN_CAKE";

export default function App() {
  const [stage, setStage] = useState<AppStage>("INTRO");
  const { volume, startListening, isListening } = useAudioInput();
  const [candleState, setCandleState] = useState<CandleState>("LIT");
  const [showGreeting, setShowGreeting] = useState(false);
  const [fireworksTriggered, setFireworksTriggered] = useState(false);
  const [letterAvailable, setLetterAvailable] = useState(false);
  const [isLetterOpen, setIsLetterOpen] = useState(false);

  const goLoading = () => {
    setStage("LOADING");
    // Loading 动画 1.5s 后跳转
    setTimeout(() => setStage("GESTURE"), 1500);
  };

  const goCountdown = () => {
    setStage("COUNTDOWN");
  };

  const goMainCake = () => {
    setStage("MAIN_CAKE");
    startListening();
  };

  useEffect(() => {
    if (candleState === "EXTINGUISHED") {
      setTimeout(() => {
        setShowGreeting(true);
        setTimeout(() => {
          setFireworksTriggered(true);
          setTimeout(() => {
            setLetterAvailable(true);
          }, 4000);
        }, 300);
      }, 500);
    }
  }, [candleState]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a000a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Great+Vibes&display=swap');`}</style>

      {stage === "INTRO" && <IntroScreen onNext={goLoading} />}
      {stage === "LOADING" && <CuteLoadingScreen />}
      {stage === "GESTURE" && <FakeGestureScreen onDetected={goCountdown} />}

      <Canvas
        shadows
        camera={{ position: [0, 4, 16], fov: 45 }}
        gl={{ toneMappingExposure: 1.0 }}
      >
        <OrbitControls
          makeDefault
          minDistance={8}
          maxDistance={30}
          maxPolarAngle={Math.PI / 1.1}
          minPolarAngle={0}
          enablePan={true}
          enabled={stage === "MAIN_CAKE"}
        />

        <color attach="background" args={["#0a000a"]} />
        <fog attach="fog" args={["#0a000a", 15, 50]} />

        <OrbitingBubbles />
        <ambientLight intensity={0.1} />

        {stage === "COUNTDOWN" && <ParticleCountdown onFinished={goMainCake} />}

        <group visible={stage === "MAIN_CAKE"}>
          {candleState !== "EXTINGUISHED" && (
            <pointLight position={[0, 5, 0]} intensity={0.6} color="#FFD700" />
          )}

          <RotatingContainer>
            <TieredCakeWithCandles candleState={candleState} volume={volume} />
          </RotatingContainer>

          <Html
            position={[0, 5, 0]}
            center
            style={{
              pointerEvents: "none",
              zIndex: 100,
              width: "100%",
              opacity: showGreeting && !isLetterOpen ? 1 : 0,
              transform: `scale(${showGreeting && !isLetterOpen ? 1 : 0.5})`,
              transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div
              style={{
                fontFamily: "'Noto Serif SC', serif",
                color: "#FFF",
                textShadow: "0 0 30px #FF1493",
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              <h1
                style={{
                  fontSize: "4rem",
                  margin: "0 0 15px 0",
                  letterSpacing: "0.3rem",
                  lineHeight: 1,
                }}
              >
                生日快乐，罗萱
              </h1>
              <p
                style={{
                  fontSize: "1.6rem",
                  margin: 0,
                  color: "#FFB7C5",
                  letterSpacing: "0.5rem",
                  fontFamily: "sans-serif",
                }}
              >
                2026.02.16
              </p>
            </div>
          </Html>

          {fireworksTriggered && (
            <group>
              <Explosion position={[0, 7, 0]} color="#FFD700" delay={0} />
              <Explosion position={[0, 8, 1]} color="#FF4500" delay={300} />
              <Explosion position={[-5, 7, -3]} color="#FF1493" delay={600} />
              <Explosion position={[5, 9, 2]} color="#00BFFF" delay={900} />
              <Explosion position={[-6, 10, 3]} color="#FF69B4" delay={1200} />
              <Explosion position={[6, 8, -4]} color="#9400D3" delay={1500} />
              <Explosion position={[0, 12, 0]} color="#FFFFFF" delay={1800} />
            </group>
          )}

          {isListening && (
            <SceneController
              volume={volume}
              candleState={candleState}
              setCandleState={setCandleState}
            />
          )}
        </group>

        <EffectComposer disableNormalPass>
          {/* 修复：移除了 toneMapped 参数，手动修正类型 */}
          <Bloom
            luminanceThreshold={0.1}
            mipmapBlur
            intensity={3.5}
            radius={0.7}
          />
          {/* @ts-ignore */}
          <ChromaticAberration offset={[0.002, 0.002]} />
          {/* @ts-ignore */}
          <Vignette eskil={false} offset={0.3} darkness={1.2} />
        </EffectComposer>
      </Canvas>

      <InteractiveLetterSystem
        available={letterAvailable}
        isLetterOpen={isLetterOpen}
        setIsLetterOpen={setIsLetterOpen}
      />

      {stage === "COUNTDOWN" && (
        <button
          onClick={goMainCake}
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            zIndex: 999,
            padding: "10px",
            background: "rgba(255,255,255,0.2)",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          跳过动画 &gt;&gt;
        </button>
      )}

      {stage === "MAIN_CAKE" &&
        isListening &&
        candleState !== "EXTINGUISHED" && (
          <div
            style={{
              position: "absolute",
              bottom: "5%",
              width: "100%",
              textAlign: "center",
              color: "rgba(255,182,193, 0.8)",
              fontSize: "1.2rem",
              pointerEvents: "none",
              fontFamily: "'Noto Serif SC', serif",
              letterSpacing: "2px",
              textShadow: "0 0 10px #FF1493",
            }}
          >
            {volume > 0.2
              ? "✨ 魔法能量汇聚中..."
              : "请对着麦克风持续吹气，许下心愿..."}
          </div>
        )}
    </div>
  );
}
