import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildScene } from "../lib/garmentScene";

export default function Garment3DPreview({ pieces, embroidery }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const groupRef = useRef(null);
  const framedPiecesRef = useRef(null);
  const [color, setColor] = useState("#33475B");
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(null);

  // One-time scene/camera/renderer/controls setup. WebGL isn't
  // guaranteed everywhere (locked-down browsers, remote desktops,
  // old hardware) — renderer creation can throw, and with no error
  // boundary anywhere in this app that would otherwise blank the
  // whole order page, not just this panel.
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = 520;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false });
    } catch (e) {
      setWebglError(e.message || "WebGL is unavailable in this browser");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1e21);
    scene.fog = new THREE.Fog(0x1b1e21, 260, 480);

    const camera = new THREE.PerspectiveCamera(32, width / height, 1, 800);
    camera.position.set(20, 58, 195);

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 30, 0);
    controls.enableDamping = true;
    controls.minDistance = 60;
    controls.maxDistance = 500;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
    controls.update();

    // Soft sky/ground ambient plus a modest key/fill/rim trio reads
    // much closer to a simple studio photo than flat ambient light —
    // the mannequin actually looks like it has volume instead of a
    // uniformly-lit cutout.
    scene.add(new THREE.HemisphereLight(0xdfe6ea, 0x35322c, 0.55));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.05);
    key.position.set(90, 160, 130);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.32);
    fill.position.set(-120, 70, -60);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(-40, 120, -160);
    scene.add(rim);

    const grid = new THREE.GridHelper(320, 32, 0x33393e, 0x24282c);
    grid.position.y = -76;
    scene.add(grid);

    let frameId;
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    }
    window.addEventListener("resize", handleResize);

    sceneRef.current = { scene, camera, renderer, controls };
    setReady(true);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Rebuild the garment+mannequin group whenever pieces or color change.
  useEffect(() => {
    if (!ready || !sceneRef.current || !pieces?.length) return;
    const { scene, camera, controls } = sceneRef.current;
    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    const group = buildScene(pieces, color, embroidery);
    scene.add(group);
    groupRef.current = group;

    // Auto-fit the camera to whatever this garment kind's actual
    // bounds are — a fixed camera position cropped taller figures
    // (a skirt+legs stack is much taller than a shirt) and needed
    // hand-tuning per garment type otherwise. Only refit when the
    // pieces themselves changed, not on a color tweak, so recoloring
    // doesn't reset whatever angle the user rotated to.
    if (framedPiecesRef.current !== pieces) {
      framedPiecesRef.current = pieces;
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const fitDistance = (maxDim / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.4;
      const dir = new THREE.Vector3(0.12, 0.22, 1).normalize();
      camera.position.copy(center).addScaledVector(dir, fitDistance);
      // Keeping the near:far ratio modest matters here: the dress
      // form sits only ~2cm inside the garment surface, and a very
      // wide ratio thins out depth-buffer precision enough at that
      // range to cause real z-fighting between the two, not just an
      // SVG-debug-renderer artifact.
      camera.near = Math.max(1, fitDistance / 40);
      camera.far = fitDistance * 2.5;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();

      // The fog range was fixed at scene-setup time for a typical
      // shirt's framing distance — a taller figure (skirt+legs, full
      // trousers) auto-fits at a much greater distance and was
      // fogging out to near-black. Keep it scaled to whatever the
      // camera is actually doing instead of a fixed guess.
      if (scene.fog) {
        scene.fog.near = fitDistance * 1.4;
        scene.fog.far = fitDistance * 2.3;
      }
    }
  }, [pieces, color, embroidery, ready]);

  return (
    <div className="garment-preview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>3D preview</h2>
        <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ margin: 0 }}>Fabric color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 34, height: 26, padding: 0, border: "1px solid #454c51", borderRadius: 4, background: "none" }}
          />
        </div>
      </div>
      {webglError ? (
        <div className="garment-3d-mount garment-3d-fallback">
          <p>
            This browser can't display the 3D preview (WebGL is unavailable). The order and
            cutting pieces below are unaffected.
          </p>
        </div>
      ) : (
        <div ref={mountRef} className="garment-3d-mount" />
      )}
      <p className="draft-piece-notes" style={{ maxWidth: "none" }}>
        Stylized preview on a dress-form mannequin, built by wrapping the drafted pieces around
        the body — not a cloth simulation, so drape, wrinkles, and fit aren't physically accurate.
        Drag to rotate, scroll to zoom. Use the cutting pieces below for the actual pattern.
      </p>
    </div>
  );
}
