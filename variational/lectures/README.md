# The two lectures: mathematical and teaching background

These are the complete LaTeX lecture sources created in the original conversation. Each is a standalone document intended for Overleaf, with the teaching script and detailed instructor calculations. Preserve both sources with the project.

1. [Calculus of Variations: How to Differentiate a Curve](01-calculus-of-variations.tex) — a 45-minute introduction, beginning with the historical brachistochrone challenge. Its main thread is the integral functional, endpoint-preserving variations, differentiation with respect to the variation parameter, integration by parts, and the Euler–Lagrange equation. Worked examples and backup calculations support checking the details.
2. [Hamilton's Principle: From Stationary Action to Wavefronts and Rays](02-hamilton-action-wavefronts.tex) — the next 45-minute lecture. It develops Hamilton's principal function, endpoint variations, Hamilton–Jacobi, constant-action surfaces, trajectories as rays, and the connections to optics and waves. Hamilton's equations are background rather than the main destination.

## The general goal for the interactive project

Make the same progression visible and tangible:

- First, deform an entire curve with fixed endpoints and watch its integral change.
- Make the small first-order response near a stationary path apparent through the graph and the error blob.
- Connect local Euler–Lagrange agreement to the whole path, while keeping local stationarity distinct from the global boundary-value solution.
- Extend the idea to time-dependent histories, fixed duration, and mechanical action; the existing Dynamics scene is this step.
- Explore the principal function as an endpoint-dependent field, its level sets, and the ray/wavefront picture. Action as Wave (scene 05) implements a fixed-energy optical construction under uniform gravity, with two action branches and a caustic. Version 0.3.2 replaces the Point pulse option with a single fan burst of equal-speed colored particles crossing those fronts.
- Orbits as Wave (scene 06) extends the same construction to attractive inverse-square gravity. It shows bound Kepler ellipses, folding fronts, up to four first-circuit endpoint routes, an elliptical caustic, and the return focus at A. M is a point-mass marker: close passes continue through its drawn disk, terminating only within 10⁻⁶ m of the singularity. The potential reference V(A)=0 makes phase lines advance along momentum; the dialog distinguishes it from negative bound energy with V(∞)=0.

The wavefront scenes display classical phase geometry with analytic trajectories and sampled fronts; amplitudes, interference, diffraction, and a wave treatment of the caustic remain future work. Before extending the physics or teaching explanations, read both lecture sources and the implementation notes in ../docs/CONTINUATION.md.

## Mathematical distinctions to preserve

- Stationary action need not be a minimum. The current gravity scene has a proved minimum for its fixed endpoints and duration; this is not a general property of Hamilton's principle.
- The action functional of a trial history and the principal function evaluated on a classical history are different objects.
- Keep the time-dependent principal function and the fixed-energy abbreviated action distinct.
- The lecture states the assumptions under which the trajectories are normal to action fronts. The wavefront scene uses equal spatial scales and momentum gradients to preserve that relationship. Its two fixed-energy branches have different flight times. A common-time particle shell from the fan is distinct from the action fronts it crosses.
- The first lecture's small-slope string example is different from the app's exact fixed-length catenary.
- Check the coordinate convention when transferring formulas: the app uses positive y downward.

The files already appear as downloads in the app's mathematics dialog and are included in the Git repository and source transfer archive. PDFs and a local TeX installation are not required to run the webpage.
