# Asset provenance and rights status

This inventory records what the repository can presently establish about its
committed media. It is not a legal conclusion and does not grant a license.
External material remains subject to the source publisher's terms. NASA's
[media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
state that NASA content is generally not subject to copyright in the United
States, while excluding NASA identifiers and separately marked third-party
material. Uses must not imply NASA endorsement. The
[NASA Science 3D Resources hub](https://science.nasa.gov/3d-resources/) also
describes its downloadable assets as free to use subject to those guidelines.

The scientific role and suitability of the texture maps are described in
[DATA_SOURCES.md](DATA_SOURCES.md). Before copying or redistributing any asset,
verify the applicable terms at its linked source and retain the recorded
credit. This inventory records the governing publisher policy rather than
copying it into the repository; re-check the linked policy before reuse.

## Planet and moon textures

| Repository file | Recorded provenance | Governing usage evidence and credit |
| --- | --- | --- |
| `public/textures/earth.jpg` | [NASA Science 3D Resources — Earth (A)](https://science.nasa.gov/3d-resources/earth-a/) | NASA Science asset governed by the NASA media guidelines above. Credit: NASA. Check the source page for third-party markings before reuse. |
| `public/textures/venus.jpg` | [NASA Science 3D Resources — Venus](https://science.nasa.gov/3d-resources/venus/), described as a Magellan-derived radar mosaic | NASA/JPL-derived asset governed by NASA's guidelines and the [JPL image-use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/). Credit the source as NASA/JPL-Caltech where appropriate. |
| `public/textures/mars.jpg` | [NASA Science 3D Resources — Mars](https://science.nasa.gov/3d-resources/mars/), described as Viking imagery processed at USGS | NASA Science asset governed by the NASA media guidelines above. Credit NASA and preserve the source's USGS processing attribution. |
| `public/textures/jupiter.jpg` | [NASA Science 3D Resources — Jupiter](https://science.nasa.gov/3d-resources/jupiter/), described as Voyager imagery | NASA Science asset governed by the NASA media guidelines above. Credit: NASA. |
| `public/textures/saturn.jpg` | [NASA Science 3D Resources — Saturn](https://science.nasa.gov/3d-resources/saturn/), described by the project as a fictional NASA/JPL-generated map | NASA/JPL-generated asset governed by NASA's guidelines and the JPL image-use policy above. Credit the source as NASA/JPL-Caltech where appropriate. |
| `public/textures/neptune.jpg` | [NASA Science 3D Resources — Neptune](https://science.nasa.gov/3d-resources/neptune/), described by the project as a fictional NASA/JPL-generated map | NASA/JPL-generated asset governed by NASA's guidelines and the JPL image-use policy above. Credit the source as NASA/JPL-Caltech where appropriate. |
| `public/textures/moon.jpg` | [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) | NASA SVS states its content is public domain unless otherwise noted. Credit: NASA's Scientific Visualization Studio; retain the contributor credits on the source page. |

## Project presentation assets

| Repository files | Recorded provenance | Rights status |
| --- | --- | --- |
| `public/icons/solar-icon.svg`, `public/icons/solar-icon-192.png`, `public/icons/solar-icon-512.png`, `public/icons/apple-touch-icon.png` | No external source is recorded in the repository. | No separate license is recorded and no reuse license is granted by this project. |
| `docs/assets/solar-system-simulator.jpg` | Presented by the README as a screenshot of this simulator; no external source is recorded. | No separate license is recorded and no reuse license is granted by this project. Embedded rendered textures retain their own status above. |

## Dependencies

Runtime and development packages are identified in `package.json` and
`package-lock.json`. Their upstream licenses apply independently; this project
does not relicense them.
