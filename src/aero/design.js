// Optimum blade design (exercises 4 and 5): chord and twist of the ideal
// rotor at a design tip-speed ratio λ, design lift coefficient Cl and angle
// of attack α, for B blades of tip radius R. r is measured from the axis.
//   Betz (no wake rotation, a = 1/3):
//     tan φ = (1 − a)/λ_r = 2/(3 λ_r),  λ_r = λ r/R
//     c = 16πR / (9 B Cl λ) · 1/√(λ²(r/R)² + 4/9)
//   Schmitz (with wake rotation):
//     φ = (2/3) arctan(1/λ_r)
//     c = (16π r / (B Cl)) · sin²(arctan(1/λ_r)/3)
//   twist θ = φ − α (relative to the rotor plane)

const DEG = 180 / Math.PI;

function betzSection(r, { R, lambda, B, cl, alphaDeg }) {
  const lr = lambda * r / R, phi = Math.atan(2 / (3 * lr));
  return { lr, phi: phi * DEG, twist: phi * DEG - alphaDeg,
    chord: 16 * Math.PI * R / (9 * B * cl * lambda) / Math.sqrt(lambda ** 2 * (r / R) ** 2 + 4 / 9) };
}

function schmitzSection(r, { lambda, R, B, cl, alphaDeg }) {
  const lr = lambda * r / R, phi = (2 / 3) * Math.atan(1 / lr);
  return { lr, phi: phi * DEG, twist: phi * DEG - alphaDeg,
    chord: 16 * Math.PI * r / (B * cl) * Math.sin(Math.atan(1 / lr) / 3) ** 2 };
}

const designSection = (kind, r, p) => (kind === "schmitz" ? schmitzSection(r, p) : betzSection(r, p));

export { betzSection, designSection, schmitzSection };
