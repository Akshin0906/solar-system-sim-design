# Authored experiences

These modes direct the existing simulator instead of replacing it with a canned
animation. Every session snapshots the camera target, clock, and scale/view settings;
`Exit & restore`, Escape, Recommended reset, scenario start, and rocket-watch start
restore that snapshot before handing ownership elsewhere.

## Eclipse Chase

`eclipseChase.ts` searches forward from the live simulation date. Six-hour samples
locate each Sun/Moon angular-separation minimum, a deterministic refinement solves the
modeled syzygy, and the result is accepted only if a finite Sun/Moon shadow cone
intersects Earth's physical sphere. Total, annular, and partial labels come from the
signed umbra/antumbra radius at Earth rather than a date lookup.

The underlying lunar orbit remains the app's fixed JPL mean-element fit, not an SPK or
Besselian eclipse prediction. The panel therefore keeps an accuracy disclosure visible,
especially after the fit's validity interval. `verify_authored_experiences.py` compares
the live 2026 solve with NASA/GSFC's published Besselian event as an external truth
check without feeding that date into the runtime search:

- [NASA 2026 eclipse overview](https://science.nasa.gov/eclipses/future-eclipses/total-solar-eclipse-on-august-12-2026/)
- [NASA/GSFC 2026 Besselian elements](https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812)

## Director tours

`tours.ts` is the small authored-tour schema. A stop owns a selected body, camera
preset, scale lens, narration, a specific observation prompt, and persistent fidelity
badges. The Scale Revelation tour intentionally visits `real`, `readable`, `compressed`,
and `overview` in order. Three Worlds uses the same framework for Earth–Moon, Jupiter,
and Saturn system stops.
