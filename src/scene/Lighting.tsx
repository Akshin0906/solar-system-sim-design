export const Lighting = () => (
  <>
    <ambientLight intensity={0.26} color="#526174" />
    <pointLight position={[0, 0, 0]} intensity={5.2} distance={560} color="#ffd29a" decay={1.15} />
    <pointLight position={[0, 0, 0]} intensity={1.1} distance={90} color="#fff0c8" decay={1.6} />
    <directionalLight position={[-72, 38, -44]} intensity={0.38} color="#7f9dff" />
    <hemisphereLight args={["#b8c8e6", "#15110d", 0.18]} />
  </>
);
