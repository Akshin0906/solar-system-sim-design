export const Lighting = () => (
  <>
    <ambientLight intensity={0.045} color="#526174" />
    <pointLight position={[0, 0, 0]} intensity={520} distance={560} color="#ffd29a" decay={1.38} />
    <pointLight position={[0, 0, 0]} intensity={110} distance={90} color="#fff0c8" decay={2} />
    <directionalLight position={[-72, 38, -44]} intensity={0.24} color="#7f9dff" />
    <hemisphereLight args={["#b8c8e6", "#15110d", 0.11]} />
  </>
);
