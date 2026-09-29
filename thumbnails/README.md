# Interactive demo thumbnails

Captured from the playable demos in Chrome on 2026-09-27. These are actual
simulation screenshots, cropped to 16:9 and saved as 1280 x 720 WebP images.

| Image | Playable source | Scene |
| --- | --- | --- |
| `grover-search-2d.webp` | https://anssizander.github.io/BohmianGrover2D/BohmianGrover2D/ | Actual 4x4 wave and golden particle trails after three Grover iterations, alongside a title and marked-mode probability. Captured on 2026-09-29. |
| `curved-space.webp` | https://imaginingphysics.com/curved-space/index.html | Parallel transport around a 90° × 60° spherical rectangle; golden vectors and the enclosed red area. Captured on 2026-09-28. |
| `relativistic-observer.webp` | https://anssizander.github.io/VRrelativity/ | Blue cube grid with Lorentz transformation and aberration enabled. |
| `bohmian-3d-box.webp` | https://anssizander.github.io/Bohmian3DBox/ | Ground-state density cloud and Bohmian particles in the box. |
| `bohmian-double-slit.webp` | https://anssizander.github.io/BohmianDoubleSlit/ | Interference after the slits, with phase colors and upper/lower particle paths. |
| `bohmian-stern-gerlach-3d.webp` | https://anssizander.github.io/BohmianSternGerlach3D-public/ | The Up+Down packet splitting in the magnetic-field gradient. |
| `bohmian-tunneling.webp` | https://anssizander.github.io/BohmianTunneling/ | Reflected and transmitted packets at the barrier, with particle trails. |

The gallery retains the existing `accelerating-charge/thumbnail.jpg` image.

The Grover thumbnail combines the production WebGL2 simulation with an HTML
title panel, captured together at 1280 x 720. It uses the default input 0 and
goal 15, 4,000 particles, dot size 2.6, and trail half-life 0.7 for clear paths.
The full search is advanced to its final checkpoint through the recording API.
UI panels and cell text are hidden for the capture; initial/goal markers remain.
These thumbnail settings do not change the playable demo.

The Curved Space image uses the published demo's actual WebGL2 renderer and
transport integrator, with the controls omitted for the capture. Camera:
42° yaw, 30° pitch, distance 3.5. Past-vector opacity is 0.68 and area opacity
is 0.48 for thumbnail contrast. The 1280 × 720 screenshot is encoded as WebP;
these capture settings do not change the playable demo's defaults.
To refresh an animated thumbnail, save a full browser frame at the desired
moment before cropping the file; changing the capture viewport can reset a
simulation. Keep the controls out of the crop and verify the final image at
card size.
