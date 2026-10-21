// Site and energy maths (exercises 1 and 9): wind shear, the Weibull /
// Rayleigh distribution, annual energy, capacity factor and LCOE. Pure
// functions -- the Site & energy window and the 3D shear arrows call them.

// wind speed at height z, given the speed uHub at hub height H
function shearSpeed(z, { model, z0, alpha, uHub, H }) {
  if (z <= 0) return 0;
  if (model === "power") return uHub * (z / H) ** alpha;
  return z <= z0 ? 0 : uHub * Math.log(z / z0) / Math.log(H / z0);
}

// Lanczos approximation of the gamma function (for the Weibull scale)
function gamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}
// Weibull with mean wind speed `mean` and shape k (k = 2: Rayleigh)
const weibullScale = (mean, k) => mean / gamma(1 + 1 / k);
const weibullPdf = (u, mean, k) => { const A = weibullScale(mean, k); return u <= 0 ? 0 : (k / A) * (u / A) ** (k - 1) * Math.exp(-((u / A) ** k)); };
const weibullCdf = (u, mean, k) => (u <= 0 ? 0 : 1 - Math.exp(-((u / weibullScale(mean, k)) ** k)));

// annual energy from a power curve [{U, P (W)}] and the wind distribution
function annualEnergy(curve, mean, k, ratedPower, cutIn, cutOut) {
  const du = 0.05, bins = [];
  let E = 0;   // Wh per year
  for (let u = du / 2; u < 35; u += du) {
    const P = u < cutIn || u > cutOut ? 0 : interpPower(curve, u);
    const e = P * weibullPdf(u, mean, k) * du * 8760;
    E += e; bins.push({ u, f: weibullPdf(u, mean, k), e });
  }
  const CF = E / (ratedPower * 8760);
  const opFraction = weibullCdf(cutOut, mean, k) - weibullCdf(cutIn, mean, k);
  return { E, CF, FLH: CF * 8760, opFraction, opHours: opFraction * 8760, bins, mode: weibullScale(mean, k) * ((k - 1) / k) ** (1 / k) };
}
function interpPower(curve, u) {
  if (u <= curve[0].U) return curve[0].P;
  for (let i = 1; i < curve.length; i++) {
    if (u <= curve[i].U) { const a = curve[i-1], b = curve[i]; return a.P + (b.P - a.P) * (u - a.U) / (b.U - a.U); }
  }
  return curve[curve.length - 1].P;
}

// levelised cost of energy; money in €, power in kW, energy in kWh/yr
function lcoe({ capex, opexFixed, opexVar, rate, years, price }, ratedKW, aepKWh) {
  const crf = rate > 0 ? rate * (1 + rate) ** years / ((1 + rate) ** years - 1) : 1 / years;
  const capexTotal = capex * ratedKW;
  const opex = opexFixed * ratedKW + opexVar * aepKWh;
  const annual = capexTotal * crf + opex;
  const revenue = price * aepKWh;
  return {
    crf, capexTotal, opex, annual, revenue,
    lcoe: annual / aepKWh,                                           // €/kWh
    payback: revenue > opex ? capexTotal / (revenue - opex) : Infinity,   // years, undiscounted
    breakEvenCF: (capex * crf + opexFixed) / (8760 * (price - opexVar)),
  };
}

// Vestas V236-15.0 MW power curve used in exercise 9 (m/s -> MW)
const V236 = {
  rated: 15e6, cutIn: 3, cutOut: 31, hubHeights: [120, 150],
  curve: [[3, 0.35], [4, 0.70], [5, 1.20], [6, 1.95], [7, 3.00], [8, 4.50], [9, 6.50], [10, 9.10], [11, 12.30], [12, 14.80], [13, 15], [31, 15]]
    .map(([U, P]) => ({ U, P: P * 1e6 })),
};

export { V236, annualEnergy, gamma, lcoe, shearSpeed, weibullCdf, weibullPdf, weibullScale };
