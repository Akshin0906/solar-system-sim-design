export const Lighting = () => (
  <>
    <ambientLight intensity={0.1} />
    <pointLight position={[0, 0, 0]} intensity={350} distance={420} color="#ffd49b" decay={1.45} />
    <hemisphereLight args={["#f8e5be", "#161412", 0.16]} />
  </>
);
