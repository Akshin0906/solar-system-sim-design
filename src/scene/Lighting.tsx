export const Lighting = () => (
  <>
    <ambientLight intensity={0.26} color="#526174" />
    {/* Single solar point light. Previously two coincident point lights at the origin
        (a long-range key + a short-range fill) doubled the per-fragment point-light
        cost on every meshStandardMaterial; one tuned light approximates the falloff. */}
    <pointLight position={[0, 0, 0]} intensity={5.6} distance={560} color="#ffd5a0" decay={1.18} />
    <directionalLight position={[-72, 38, -44]} intensity={0.38} color="#7f9dff" />
    <hemisphereLight args={["#b8c8e6", "#15110d", 0.18]} />
  </>
);
