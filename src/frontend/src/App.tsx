import { Billboard, Sky, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { create } from "zustand";
import type { backendInterface } from "./backend";
import { useActor } from "./hooks/useActor";

// ─── Backend Context ──────────────────────────────────────────────────────────

const BackendContext = createContext<backendInterface | null>(null);
function useBackend() {
  return useContext(BackendContext);
}

// ─── Game State ──────────────────────────────────────────────────────────────

type GameStatus = "playing" | "respawning" | "won";

interface CheckpointDef {
  index: number;
  position: [number, number, number];
}

interface GameStore {
  status: GameStatus;
  checkpoint: number;
  checkpointPosition: [number, number, number];
  activatedCheckpoints: Set<number>;
  setStatus: (s: GameStatus) => void;
  setCheckpoint: (index: number, pos: [number, number, number]) => void;
  activateCheckpoint: (index: number) => void;
  reset: () => void;
}

const CHECKPOINT_DEFS: CheckpointDef[] = [
  { index: 1, position: [0, 1, -30] },
  { index: 2, position: [0, 3, -60] },
  { index: 3, position: [4, 5, -90] },
  { index: 4, position: [0, 7, -120] },
  { index: 5, position: [0, 9, -180] },
];

const START_POSITION: [number, number, number] = [0, 3, 0];

const useGameStore = create<GameStore>((set) => ({
  status: "playing",
  checkpoint: 0,
  checkpointPosition: START_POSITION,
  activatedCheckpoints: new Set(),
  setStatus: (status) => set({ status }),
  setCheckpoint: (index, position) =>
    set({ checkpoint: index, checkpointPosition: position }),
  activateCheckpoint: (index) =>
    set((state) => ({
      activatedCheckpoints: new Set([...state.activatedCheckpoints, index]),
    })),
  reset: () =>
    set({
      status: "playing",
      checkpoint: 0,
      checkpointPosition: START_POSITION,
      activatedCheckpoints: new Set(),
    }),
}));

// ─── Platform Definitions ────────────────────────────────────────────────────

interface PlatformDef {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  moving?: boolean;
  moveAxis?: "x" | "z";
  moveRange?: number;
  spinning?: boolean;
  phaseOffset?: number;
}

const PLATFORMS: PlatformDef[] = [
  // 1. Start platform
  { position: [0, 0, 0], size: [12, 1, 12], color: "#2ecc71" },
  { position: [0, 0, -8], size: [10, 1, 6], color: "#27ae60" },

  // 2. Wide stepping stones
  { position: [0, 0, -18], size: [4, 1, 4], color: "#3498db" },
  { position: [3, 0, -24], size: [4, 1, 4], color: "#e74c3c" },
  { position: [-3, 0, -30], size: [4, 1, 4], color: "#f39c12" },
  { position: [0, 0, -36], size: [5, 1, 5], color: "#9b59b6" },

  // 3. Narrow planks
  { position: [0, 1, -43], size: [2, 1, 8], color: "#e67e22" },
  { position: [0, 1, -52], size: [8, 1, 2], color: "#1abc9c" },
  { position: [0, 1, -57], size: [2, 1, 6], color: "#e91e63" },

  // 4. Staircase up
  { position: [-2, 2, -63], size: [4, 1, 3], color: "#3498db" },
  { position: [0, 3, -67], size: [4, 1, 3], color: "#e74c3c" },
  { position: [2, 4, -71], size: [4, 1, 3], color: "#2ecc71" },
  { position: [0, 5, -75], size: [5, 1, 4], color: "#f39c12" },

  // 5. Gap jumps
  { position: [0, 5, -81], size: [3, 1, 3], color: "#9b59b6" },
  { position: [3, 5, -87], size: [3, 1, 3], color: "#e67e22" },
  { position: [-2, 5, -93], size: [3, 1, 3], color: "#3498db" },
  { position: [2, 5, -99], size: [3, 1, 3], color: "#e74c3c" },
  { position: [0, 5, -105], size: [4, 1, 4], color: "#1abc9c" },

  // 6. Moving platforms
  {
    position: [0, 6, -111],
    size: [4, 1, 4],
    color: "#e91e63",
    moving: true,
    moveAxis: "x",
    moveRange: 4,
    phaseOffset: 0,
  },
  {
    position: [0, 6, -117],
    size: [4, 1, 4],
    color: "#f39c12",
    moving: true,
    moveAxis: "x",
    moveRange: 5,
    phaseOffset: 1.0,
  },
  {
    position: [0, 7, -122],
    size: [4, 1, 4],
    color: "#9b59b6",
    moving: true,
    moveAxis: "x",
    moveRange: 3,
    phaseOffset: 2.1,
  },

  // 7. Spinning platform area
  { position: [0, 7, -128], size: [5, 1, 5], color: "#3498db" },
  {
    position: [0, 7, -133],
    size: [5, 1, 2],
    color: "#e74c3c",
    spinning: true,
  },
  { position: [0, 7, -137], size: [5, 1, 5], color: "#2ecc71" },

  // 8. Narrow zigzag
  { position: [0, 7, -143], size: [2, 1, 4], color: "#f39c12" },
  { position: [3, 7, -148], size: [2, 1, 4], color: "#e67e22" },
  { position: [-3, 7, -153], size: [2, 1, 4], color: "#9b59b6" },
  { position: [3, 7, -158], size: [2, 1, 4], color: "#e91e63" },
  { position: [0, 7, -163], size: [3, 1, 3], color: "#1abc9c" },

  // 9. Long jump section
  { position: [0, 8, -169], size: [3, 1, 2], color: "#3498db" },
  { position: [0, 8, -175], size: [2, 1, 2], color: "#e74c3c" },

  // 10. Victory platform (gold)
  { position: [0, 9, -182], size: [10, 1, 10], color: "#ffd700" },
  { position: [0, 9, -190], size: [8, 1, 8], color: "#ffd700" },
];

// ─── Physics Constants ────────────────────────────────────────────────────────

const GRAVITY = 30;
const JUMP_FORCE = 11;
const MOVE_SPEED = 7;
const PLAYER_HEIGHT = 1.3;
const PLAYER_RADIUS = 0.5;

// ─── Static Platform Component ────────────────────────────────────────────────

function StaticPlatform({ position, size, color }: PlatformDef) {
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

// ─── Moving Platform Component ────────────────────────────────────────────────

function MovingPlatform({
  position,
  size,
  color,
  moveAxis = "x",
  moveRange = 4,
  phaseOffset = 0,
}: PlatformDef) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    const t = Date.now() / 1000;
    const offset = Math.sin(t * 0.8 + phaseOffset) * moveRange;
    if (moveAxis === "x") {
      meshRef.current.position.set(
        position[0] + offset,
        position[1],
        position[2],
      );
    } else {
      meshRef.current.position.set(
        position[0],
        position[1],
        position[2] + offset,
      );
    }
  });

  return (
    <mesh ref={meshRef} position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.4}
        metalness={0.1}
        emissive={color}
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

// ─── Spinning Platform Component ──────────────────────────────────────────────

function SpinningPlatform({ position, size, color }: PlatformDef) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta * 1.2;
    if (meshRef.current) {
      meshRef.current.rotation.y = timeRef.current;
    }
  });

  return (
    <mesh ref={meshRef} position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.4}
        metalness={0.3}
        emissive={color}
        emissiveIntensity={0.25}
      />
    </mesh>
  );
}

// ─── Checkpoint Component ─────────────────────────────────────────────────────

interface CheckpointProps {
  index: number;
  position: [number, number, number];
  ocid: string;
}

function Checkpoint({ index, position, ocid }: CheckpointProps) {
  const { activatedCheckpoints } = useGameStore();
  const isActive = activatedCheckpoints.has(index);
  const topMeshRef = useRef<THREE.Mesh>(null!);
  const flagMeshRef = useRef<THREE.Mesh>(null!);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (topMeshRef.current) {
      topMeshRef.current.rotation.y = timeRef.current * 1.5;
    }
    if (flagMeshRef.current) {
      flagMeshRef.current.position.y =
        position[1] + 3.5 + Math.sin(timeRef.current * 2) * 0.15;
    }
  });

  const activeColor = "#ffd700";
  const inactiveColor = "#888888";
  const color = isActive ? activeColor : inactiveColor;
  const emissiveIntensity = isActive ? 0.8 : 0.1;

  return (
    <group data-ocid={ocid}>
      {/* Pole */}
      <mesh position={[position[0], position[1] + 2, position[2]]}>
        <cylinderGeometry args={[0.1, 0.12, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Flag */}
      <mesh
        ref={flagMeshRef}
        position={[position[0] + 0.6, position[1] + 3.5, position[2]]}
      >
        <boxGeometry args={[1.2, 0.8, 0.05]} />
        <meshStandardMaterial
          color={isActive ? "#ffd700" : "#cccccc"}
          emissive={isActive ? "#ffaa00" : "#444444"}
          emissiveIntensity={isActive ? 1.2 : 0.2}
        />
      </mesh>

      {/* Spinning star on top */}
      <mesh
        ref={topMeshRef}
        position={[position[0], position[1] + 4.5, position[2]]}
      >
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity * 1.5}
          metalness={0.9}
          roughness={0.05}
        />
      </mesh>

      {/* Base platform */}
      <mesh position={[position[0], position[1] + 0.1, position[2]]}>
        <cylinderGeometry args={[1.0, 1.2, 0.3, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.5 : 0.05}
          metalness={0.7}
          roughness={0.2}
        />
      </mesh>

      {/* Glow ring when active */}
      {isActive && (
        <mesh
          position={[position[0], position[1] + 0.2, position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[1.3, 2.0, 32]} />
          <meshStandardMaterial
            color="#ffd700"
            emissive="#ffd700"
            emissiveIntensity={2}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── Player Component ─────────────────────────────────────────────────────────

interface PlayerProps {
  spawnPosition: [number, number, number];
  onFall: () => void;
}

function Player({ spawnPosition, onFall }: PlayerProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const isGrounded = useRef(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const fallFiredRef = useRef(false);
  const spawnRef = useRef(spawnPosition);
  const { camera } = useThree();

  const texture = useTexture(
    "/assets/generated/tung-tung-character-transparent.dim_256x256.png",
  );

  // Track spawn position changes
  useEffect(() => {
    spawnRef.current = spawnPosition;
    if (groupRef.current) {
      groupRef.current.position.set(
        spawnPosition[0],
        spawnPosition[1] + 1,
        spawnPosition[2],
      );
      velocity.current.set(0, 0, 0);
      isGrounded.current = false;
      fallFiredRef.current = false;
    }
  }, [spawnPosition]);

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      // prevent page scroll on space/arrows
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const backendActor = useBackend();
  const {
    activatedCheckpoints,
    activateCheckpoint,
    setCheckpoint,
    setStatus,
    status,
  } = useGameStore();

  // Keep stable refs to avoid stale closures in useFrame
  const activatedCheckpointsRef = useRef(activatedCheckpoints);
  const statusRef = useRef(status);
  useEffect(() => {
    activatedCheckpointsRef.current = activatedCheckpoints;
  }, [activatedCheckpoints]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const clampedDelta = Math.min(delta, 0.05);
    const pos = groupRef.current.position;
    const vel = velocity.current;

    // ── 1. Apply gravity ──────────────────────────────────────────────────
    vel.y -= GRAVITY * clampedDelta;
    if (vel.y < -40) vel.y = -40;

    // ── 2. Movement input ─────────────────────────────────────────────────
    if (statusRef.current === "playing") {
      const keys = keysRef.current;
      const fwd =
        keys.KeyW || keys.ArrowUp ? 1 : keys.KeyS || keys.ArrowDown ? -1 : 0;
      const side =
        keys.KeyA || keys.ArrowLeft ? 1 : keys.KeyD || keys.ArrowRight ? -1 : 0;

      if (fwd !== 0 || side !== 0) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        const right = new THREE.Vector3()
          .crossVectors(camDir, new THREE.Vector3(0, 1, 0))
          .normalize();

        const moveDir = new THREE.Vector3();
        moveDir.addScaledVector(camDir, fwd);
        moveDir.addScaledVector(right, -side);
        moveDir.normalize();

        vel.x = moveDir.x * MOVE_SPEED;
        vel.z = moveDir.z * MOVE_SPEED;

        // Face movement direction
        const angle = Math.atan2(moveDir.x, moveDir.z);
        groupRef.current.rotation.y = angle;
      } else {
        // Friction
        vel.x *= 0.8;
        vel.z *= 0.8;
      }

      // Jump
      if (keys.Space && isGrounded.current) {
        vel.y = JUMP_FORCE;
        isGrounded.current = false;
      }
    }

    // ── 3. Integrate position ────────────────────────────────────────────
    pos.x += vel.x * clampedDelta;
    pos.y += vel.y * clampedDelta;
    pos.z += vel.z * clampedDelta;

    // ── 4. Platform collision ────────────────────────────────────────────
    isGrounded.current = false;
    const t = Date.now() / 1000;

    for (const plat of PLATFORMS) {
      let platX = plat.position[0];
      let platZ = plat.position[2];
      const platY = plat.position[1];

      // Compute moving platform current position using same formula as visual
      if (plat.moving) {
        const range = plat.moveRange ?? 4;
        const phase = plat.phaseOffset ?? 0;
        const offset = Math.sin(t * 0.8 + phase) * range;
        if (plat.moveAxis === "x" || !plat.moveAxis) {
          platX = plat.position[0] + offset;
        } else {
          platZ = plat.position[2] + offset;
        }
      }

      // For spinning platforms, use a generous collision box (no rotation applied)
      const sw = plat.size[0];
      const sh = plat.size[1];
      const sd = plat.size[2];

      // For spinning platforms expand hitbox a bit
      const expandFactor = plat.spinning ? 1.4 : 1.0;

      const halfW = (sw * expandFactor) / 2 + PLAYER_RADIUS;
      const halfD = (sd * expandFactor) / 2 + PLAYER_RADIUS;

      const overlapX = Math.abs(pos.x - platX) < halfW;
      const overlapZ = Math.abs(pos.z - platZ) < halfD;
      const platTop = platY + sh / 2;
      const playerBottom = pos.y - PLAYER_HEIGHT / 2;

      if (overlapX && overlapZ) {
        // Landing on top
        if (
          vel.y <= 0.5 &&
          playerBottom <= platTop + 0.5 &&
          playerBottom >= platTop - 1.0
        ) {
          pos.y = platTop + PLAYER_HEIGHT / 2;
          vel.y = 0;
          isGrounded.current = true;

          // Carry player on moving platforms
          if (plat.moving) {
            const range = plat.moveRange ?? 4;
            const phase = plat.phaseOffset ?? 0;
            // velocity contribution from platform movement
            const tNow = Date.now() / 1000;
            const dtSmall = 0.016;
            const offsetNow = Math.sin(tNow * 0.8 + phase) * range;
            const offsetNext = Math.sin((tNow + dtSmall) * 0.8 + phase) * range;
            const platVelX = (offsetNext - offsetNow) / dtSmall;
            if (plat.moveAxis === "x" || !plat.moveAxis) {
              vel.x += platVelX * 0.3;
            } else {
              vel.z += platVelX * 0.3;
            }
          }
        }
        // Side collision (push out)
        else if (
          pos.y - PLAYER_HEIGHT / 2 < platTop + sh / 2 &&
          pos.y + PLAYER_HEIGHT / 2 > platY - sh / 2
        ) {
          const dX = pos.x - platX;
          const dZ = pos.z - platZ;
          const overlapXAmt = halfW - Math.abs(dX);
          const overlapZAmt = halfD - Math.abs(dZ);
          if (overlapXAmt < overlapZAmt) {
            pos.x += dX > 0 ? overlapXAmt : -overlapXAmt;
            vel.x = 0;
          } else {
            pos.z += dZ > 0 ? overlapZAmt : -overlapZAmt;
            vel.z = 0;
          }
        }
      }
    }

    // ── 5. Fall detection ────────────────────────────────────────────────
    if (pos.y < -8) {
      if (!fallFiredRef.current && statusRef.current === "playing") {
        fallFiredRef.current = true;
        onFall();
      }
      return;
    }
    if (pos.y > -8) {
      fallFiredRef.current = false;
    }

    // ── 6. Checkpoint detection ──────────────────────────────────────────
    if (statusRef.current === "playing") {
      for (const cp of CHECKPOINT_DEFS) {
        if (activatedCheckpointsRef.current.has(cp.index)) continue;
        const dx = pos.x - cp.position[0];
        const dz = pos.z - cp.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5) {
          activateCheckpoint(cp.index);
          setCheckpoint(cp.index, cp.position);
          if (backendActor) {
            backendActor.saveProgress(BigInt(cp.index)).catch(console.error);
          }
          if (cp.index === 5) {
            setStatus("won");
            if (backendActor) {
              backendActor.completeCourse().catch(console.error);
            }
          }
        }
      }
    }

    // ── 7. Camera follow ──────────────────────────────────────────────────
    const camTarget = new THREE.Vector3(pos.x, pos.y + 6, pos.z + 10);
    camera.position.lerp(camTarget, 0.08);
    camera.lookAt(pos.x, pos.y + 1, pos.z);
  });

  return (
    <group
      ref={groupRef}
      position={[spawnPosition[0], spawnPosition[1] + 1, spawnPosition[2]]}
    >
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.5]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>

      {/* Head with Tung Tung texture */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial map={texture} roughness={0.4} />
      </mesh>

      {/* Left arm */}
      <mesh position={[-0.55, 0.05, 0]} castShadow>
        <boxGeometry args={[0.25, 0.7, 0.3]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>

      {/* Right arm */}
      <mesh position={[0.55, 0.05, 0]} castShadow>
        <boxGeometry args={[0.25, 0.7, 0.3]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>

      {/* Left leg */}
      <mesh position={[-0.22, -0.75, 0]} castShadow>
        <boxGeometry args={[0.28, 0.6, 0.3]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.5} />
      </mesh>

      {/* Right leg */}
      <mesh position={[0.22, -0.75, 0]} castShadow>
        <boxGeometry args={[0.28, 0.6, 0.3]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Player Fallback ──────────────────────────────────────────────────────────

interface PlayerFallbackProps {
  spawnPosition: [number, number, number];
}

function PlayerFallback({ spawnPosition }: PlayerFallbackProps) {
  return (
    <group
      position={[spawnPosition[0], spawnPosition[1] + 1, spawnPosition[2]]}
    >
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.7, 0.9, 0.5]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial color="#ffcc88" roughness={0.4} />
      </mesh>
      <mesh position={[-0.55, 0.05, 0]}>
        <boxGeometry args={[0.25, 0.7, 0.3]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>
      <mesh position={[0.55, 0.05, 0]}>
        <boxGeometry args={[0.25, 0.7, 0.3]} />
        <meshStandardMaterial color="#ff6b35" roughness={0.5} />
      </mesh>
      <mesh position={[-0.22, -0.75, 0]}>
        <boxGeometry args={[0.28, 0.6, 0.3]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.5} />
      </mesh>
      <mesh position={[0.22, -0.75, 0]}>
        <boxGeometry args={[0.28, 0.6, 0.3]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Sky Image ────────────────────────────────────────────────────────────────

function SkyImage() {
  const texture = useTexture("/assets/generated/tung-tung-sky.dim_512x512.png");
  return (
    <Billboard position={[0, 40, -90]}>
      <mesh>
        <planeGeometry args={[45, 45]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} />
      </mesh>
    </Billboard>
  );
}

// ─── Scene Component ──────────────────────────────────────────────────────────

interface GameSceneProps {
  spawnPosition: [number, number, number];
  onFall: () => void;
}

function GameScene({ spawnPosition, onFall }: GameSceneProps) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[20, 40, 20]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={300}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <pointLight position={[0, 20, -90]} intensity={1.0} color="#ffd700" />

      {/* Sky dome */}
      <Sky sunPosition={[100, 20, 100]} turbidity={1} rayleigh={0.5} />

      {/* Tung Tung sky image */}
      <Suspense fallback={null}>
        <SkyImage />
      </Suspense>

      {/* Platforms */}
      {PLATFORMS.map((p) => {
        const stableKey = `${p.position[0]}_${p.position[1]}_${p.position[2]}`;
        if (p.moving) {
          return <MovingPlatform key={stableKey} {...p} />;
        }
        if (p.spinning) {
          return <SpinningPlatform key={stableKey} {...p} />;
        }
        return <StaticPlatform key={stableKey} {...p} />;
      })}

      {/* Checkpoints */}
      {CHECKPOINT_DEFS.map((cp) => (
        <Checkpoint
          key={cp.index}
          index={cp.index}
          position={cp.position}
          ocid={`checkpoint.item.${cp.index}`}
        />
      ))}

      {/* Player */}
      <Suspense fallback={<PlayerFallback spawnPosition={spawnPosition} />}>
        <Player spawnPosition={spawnPosition} onFall={onFall} />
      </Suspense>
    </>
  );
}

// ─── HUD Component ────────────────────────────────────────────────────────────

interface HUDProps {
  onRestart: () => void;
}

function HUD({ onRestart }: HUDProps) {
  const { status, activatedCheckpoints } = useGameStore();
  const isRespawning = status === "respawning";
  const isWon = status === "won";

  return (
    <div className="game-hud absolute inset-0 pointer-events-none">
      {/* Checkpoint Counter */}
      <div
        data-ocid="hud.checkpoint.panel"
        className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm border-2 border-yellow-400 rounded-xl px-4 py-3"
      >
        <div className="text-yellow-400 font-bricolage font-black text-xs uppercase tracking-widest mb-1.5">
          Checkpoints
        </div>
        <div className="flex gap-1.5 items-center mb-1">
          {CHECKPOINT_DEFS.map((cp) => (
            <div
              key={cp.index}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-black transition-all duration-300 ${
                activatedCheckpoints.has(cp.index)
                  ? "bg-yellow-400 border-yellow-200 text-black scale-110 shadow-[0_0_8px_rgba(255,215,0,0.8)]"
                  : "bg-gray-700/80 border-gray-500 text-gray-400"
              }`}
            >
              {cp.index}
            </div>
          ))}
        </div>
        <div className="text-white font-bricolage font-bold text-base">
          <span className="text-yellow-400">{activatedCheckpoints.size}</span>
          <span className="text-gray-400"> / 5</span>
        </div>
      </div>

      {/* Title Banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm rounded-full px-6 py-2 border border-yellow-400/30">
          <span className="font-bricolage font-black text-xl tracking-tight bg-gradient-to-r from-red-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent">
            🥁 TUNG TUNG OBBY
          </span>
        </div>
      </div>

      {/* Controls hint */}
      <div
        data-ocid="hud.controls.panel"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm border border-white/20 rounded-full px-6 py-2"
      >
        <span className="text-white/80 font-mona text-sm">
          <kbd className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-mono mr-1">
            WASD
          </kbd>
          /
          <kbd className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-mono mx-1">
            ↑↓←→
          </kbd>
          move ·
          <kbd className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-mono mx-1">
            Space
          </kbd>
          jump
        </span>
      </div>

      {/* Respawning flash */}
      {isRespawning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="animate-flash bg-red-600/40 rounded-2xl px-10 py-6 border-2 border-red-400/60">
            <div className="text-white font-bricolage font-black text-4xl text-center drop-shadow-2xl">
              💀 Respawning...
            </div>
          </div>
        </div>
      )}

      {/* Win Screen */}
      {isWon && (
        <div
          data-ocid="win.panel"
          className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-auto"
        >
          <div className="animate-bounce-in text-center">
            <div className="bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 p-1 rounded-3xl shadow-2xl">
              <div className="bg-gray-950 rounded-[calc(1.5rem-4px)] px-12 py-10">
                <div className="text-7xl mb-4">🎉</div>
                <div className="text-yellow-400 font-bricolage font-black text-5xl mb-3 drop-shadow-lg">
                  YOU WIN!
                </div>
                <div className="text-white/70 font-mona text-lg mb-1">
                  You conquered the Tung Tung Obby!
                </div>
                <div className="text-yellow-300 font-bricolage font-bold text-xl mb-8">
                  ✓ All 5 Checkpoints Cleared
                </div>
                <button
                  type="button"
                  data-ocid="win.restart.button"
                  onClick={onRestart}
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-black font-bricolage font-black text-xl px-10 py-4 rounded-2xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  🔄 Play Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Backend Bridge ───────────────────────────────────────────────────────────

function BackendBridge({
  children,
  onProgressLoaded,
}: {
  children: React.ReactNode;
  onProgressLoaded: (checkpoint: number) => void;
}) {
  const { actor } = useActor();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!actor || loadedRef.current) return;
    loadedRef.current = true;

    actor
      .getProgress()
      .then((progress) => {
        const cpIndex = Number(progress.checkpoint);
        if (cpIndex > 0 && cpIndex <= 5) {
          onProgressLoaded(cpIndex);
        }
      })
      .catch(console.error);
  }, [actor, onProgressLoaded]);

  return (
    <BackendContext.Provider value={actor}>{children}</BackendContext.Provider>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const { status, reset, setStatus, activateCheckpoint, setCheckpoint } =
    useGameStore();
  const [spawnPosition, setSpawnPosition] = useState<[number, number, number]>([
    ...START_POSITION,
  ]);
  const respawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProgressLoaded = useCallback(
    (cpIndex: number) => {
      const cp = CHECKPOINT_DEFS.find((c) => c.index === cpIndex);
      if (cp) {
        setCheckpoint(cpIndex, cp.position);
        activateCheckpoint(cpIndex);
        for (let i = 1; i < cpIndex; i++) {
          activateCheckpoint(i);
        }
        setSpawnPosition([...cp.position]);
      }
    },
    [setCheckpoint, activateCheckpoint],
  );

  const handleFall = useCallback(() => {
    if (status === "respawning" || status === "won") return;
    setStatus("respawning");

    if (respawnTimerRef.current) clearTimeout(respawnTimerRef.current);
    respawnTimerRef.current = setTimeout(() => {
      const cp = useGameStore.getState().checkpointPosition;
      setSpawnPosition([cp[0], cp[1], cp[2]]);
      setStatus("playing");
    }, 1200);
  }, [status, setStatus]);

  const handleRestart = useCallback(() => {
    reset();
    setSpawnPosition([...START_POSITION]);
  }, [reset]);

  return (
    <BackendBridge onProgressLoaded={handleProgressLoaded}>
      <div
        className="w-full h-screen relative overflow-hidden"
        style={{ background: "#87CEEB" }}
      >
        {/* 3D Canvas */}
        <div data-ocid="game.canvas_target" className="w-full h-full">
          <Canvas
            shadows
            camera={{ position: [0, 8, 12], fov: 60, near: 0.1, far: 500 }}
            gl={{ antialias: true, alpha: false }}
            style={{ background: "#87CEEB" }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x87ceeb);
            }}
          >
            <color attach="background" args={["#87CEEB"]} />
            <GameScene spawnPosition={spawnPosition} onFall={handleFall} />
          </Canvas>
        </div>

        {/* HUD overlay */}
        <HUD onRestart={handleRestart} />

        {/* Footer */}
        <div className="absolute bottom-0 right-4 text-white/25 text-xs font-mona pb-2 pointer-events-none">
          © {new Date().getFullYear()}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/50 transition-colors pointer-events-auto"
          >
            caffeine.ai
          </a>
        </div>
      </div>
    </BackendBridge>
  );
}
