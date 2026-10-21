// The IEA 22 MW blade definition and rotor/airfoil data, extracted from
// IEA-22-280-RWT.yaml (windIO). Regenerate with scripts/extract_yaml.py.
import IEA22 from "./iea22.json";        // blade geometry + composite layup
import IEA22_AERO from "./aero.json";    // rotor settings + airfoil polars

// display colour per composite material
const MATERIAL_COLORS = {"gelcoat": "#c9a66b", "glass_triax": "#4C72B0", "carbon_uniax": "#DD8452", "glass_uniax": "#C44E52", "medium_density_foam": "#8172B2", "glass_biax": "#55A868"};

export { IEA22, IEA22_AERO, MATERIAL_COLORS };
