export const Lighting = () => (
  <>
    <ambientLight intensity={0.145} color="#403b34" />
    <pointLight position={[0, 0, 0]} intensity={610} distance={1080} color="#ffd29a" decay={1.04} />
    <pointLight position={[0, 0, 0]} intensity={90} distance={130} color="#fff0c8" decay={1.7} />
    <directionalLight position={[-72, 38, -44]} intensity={0.12} color="#d6d2c8" />
    <hemisphereLight args={["#e1d5bd", "#18130f", 0.15]} />
  </>
);
