/**
 * ALL EXPERIMENT SETTINGS LIVE HERE.
 * Angles with a `Deg` suffix are degrees; internal mathematics uses radians.
 * Reload after editing. No build step or third-party libraries are required.
 * Layout and typography tokens are at the beginning of css/styles.css.
 */
export const CONFIG = {
  mode: 'transport', // 'transport', 'geodesic', 'deviation', or 'tidal'.
  display: {
    decimals: 2, // Maximum decimal places in every visible numeric readout; physics stays full precision.
  },
  tidal: {
    // Release from rest toward a point mass: GM = strength * initialRadius^3.
    // T(t) = GM/r(t)^3 * diag(2, -1, -1) in the central free-fall frame.
    strength: 0.00045, // Initial GM/r0^3 in s^-2; increases during the fall.
    initialRadius: 120, // Source is far below the local patch: radial lines are nearly parallel.
    duration: 40, // Simulation seconds; must be below pi / (2 * sqrt(2 * strength)).
    fallSolveIterations: 48, // Precision of the analytic radial-fall time inversion.
    playbackRate: 1, minPlaybackRate: 0.1, maxPlaybackRate: 4, playbackRateStep: 0.05,
    timeStep: 0.01, // Time-slider step only; the analytic evolution has no integration step.
    initialShells: 1,
    shellRadii: [1, 0.75, 0.5, 0.25], // Add inner shells while retaining all existing particles.
    particlesPerShell: 600, // Even, >= 8; includes the six principal-axis endpoints.
    particleRadius: 0.012,
    minParticleRadius: 0.005,
    axisParticleScale: 1.5,
    particleLongitudeSegments: 12,
    particleLatitudeSegments: 8,
    shellColors: ['#e0e7e9', '#b5ccd8', '#95b6c9', '#789eb6'],
    axisColors: ['#f28e85', '#519eff', '#88c6ff'], // Stretching red; both compressing axes blue.
    principalDirections: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], // Orthonormal world directions: stretch vertically.
    backgroundGrid: {
      visible: true,
      spacing: 0.6, // Radial spacing; initial angular spacing is spacing / initialRadius.
      majorEvery: 5,
      color: '#789aaa',
      backgroundCenter: '#182531',
      backgroundEdge: '#0b141e',
      minorOpacity: 0.22,
      majorOpacity: 0.42,
      minorWidthPx: 0.7,
      majorWidthPx: 1.0,
      edgeOpacity: 0.35,
    },
    guideOpacity: 0.18,
    guideWidthPx: 0.8,
    guideSegments: 160,
    initialOutlineOpacity: 0.10,
    axisShaftWidth: 0.012,
    axisHeadWidth: 0.055,
    axisHeadFraction: 0.14,
    axisLabelOffset: 0.12,
    referenceRadiusPx: 3,
    lightDirection: [-0.5, 0.85, 1.4],
    ambientLight: 0.32,
    diffuseLight: 0.75,
    specularLight: 0.55,
    shininess: 36,
    camera: { yawDeg: 24, pitchDeg: 18, distance: 7.8, minDistance: 3.5, maxDistance: 14, fieldOfViewDeg: 40, followOnStart: false, minimumAspect: 0.6 },
  },
  geodesic: {
    directionDeg: 35,
    automatic: false,
    sphereStep: 0.2,
    torusStep: 0.2,
    minStep: 0.01,
    sphereMaxStep: 0.35,
    torusMaxStep: 0.2,
    stepIncrement: 0.005,
    playbackRate: 1, // Animation pace only; does not change the constructed path.
    minPlaybackRate: 0.1,
    maxPlaybackRate: 4,
    playbackRateStep: 0.05,
    phaseSeconds: { move: 1.4, resolve: 1.0, project: 1.5 },
    automaticHoldSeconds: 0.65,
    projectionFraction: 0.7, // Last part of the project phase restores unit speed.
    pathSamplesPerStep: 32,
    maxTrailPoints: 6000,
    maxSteps: 300,
    history: {
      maxSteps: 300, // Retain arrows and full projections until reset (bounded).
      opacity: 0.6, minOpacity: 0.28, fadeSteps: 35,
      lineWidthPx: 1.4, headLength: 0.0063, headHalfWidth: 0.002275,
      planeOpacity: 0.2, planeSegments: 24, planeRadiusFactor: 0.7, planeLineWidthPx: 0.7,
    },
    arrowLength: 0.38, // Reference for shaft/plane proportions; drawn length is always the step size.
    arrowShaftWidth: 0.008,
    arrowHeadWidth: 0.033,
    arrowHeadFraction: 0.2,
    arrowHeadLength: 0.007, // Fixed cone length in surface units, independent of step size.
    arrowMaxHeadFraction: 0.45, // Only very short component arrows shorten their cones.
    arrowMinShaftWidthPx: 1.5, // Modest radial widening keeps distant shafts legible.
    arrowMaxWidthScale: 3, // Limit that widening; cone length never changes with zoom.
    arrowAmbient: 0.62, // Keep projection components clear from every camera azimuth.
    normalLength: 0.28,
    planeRadius: 0.32,
    planeStepFactor: 1.15, // Ensure long steps and their components fit on the plane.
    planeSegments: 48,
    planeGridDivisions: 4,
    planeOpacity: 0.24,
    planeOutlineOpacity: 0.8,
    planeOutlineWidthPx: 1.25,
    planeGridOpacity: 0.6,
    planeGridWidthPx: 1.1,
    curvature: {
      enabled: true,
      axisRadiusFraction: 0.78, // Fit both principal axes inside the current tangent disk.
      axisWidthPx: 1.2,
      arrowheadLength: 0.025,
      arrowheadHalfWidth: 0.0065,
      maxHeadFraction: 0.2, // Shorten heads only when the local plane is small.
      labelRadiusFraction: 0.94,
      opacity: 0.9,
    },
    surfaceOffset: 0.004,
    torusDiagramScale: 0.62,
    trailWidthPx: 2.4,
    markerRadiusPx: 4.5,
    componentLineWidthPx: 1.6,
    componentDashSegments: 12,
    cornerFraction: 0.12,
    cornerComponentFraction: 0.25, // Cap the square by the shorter projection leg.
    diagramCornerMaxPx: 8,
    labelGapPx: 12,
    ghostOpacity: 0.38,
    colors: { old: '#ffd397', tangent: '#73e0bb', component: '#f28e85', normal: '#8dc8ff', plane: '#8ed7d2' },
    camera: { yawDeg: -32, pitchDeg: 18, distance: 3.25, minDistance: 2.0, followYawOffsetDeg: -32, followPitchOffsetDeg: 18, torusFollowPitchDeg: 35 },
    firstPerson: {
      enabled: false, height: 0.022, setback: 0.07,
      orbitOnTangentPlane: true, orbitPitchDeg: 16,
      planeCameraClearance: 0.00015, // Below the rendered plane's surface offset.
      planeCollisionSteps: 512, // Grazing a concave wall needs more small, safe steps.
      sideViewYawDeg: 90, sideViewMargin: 1.2,
      arrowLength: 0.035, normalLength: 0.04, planeRadius: 0.055, // Reference proportions, not independent arrow length.
      surfaceOffset: 0.0006, markerRadiusPx: 2.5,
    },
  },
  deviation: {
    topViewOnStart: true,
    camera: { followOnStart: false }, // Outside view stays fixed unless Follow is explicitly enabled.
    showOtherPath: true, // Hide the green geodesic and separation measurements; keep the orange one.
    initialSeparation: 0.12, // Surface distance in the same units as the radii.
    minSeparation: 0.01,
    maxSeparation: 0.30,
    separationStep: 0.005,
    directionDeg: 0, // Measured from east / the ring direction toward north / the tube.
    speed: 1, // Unit surface speed for both geodesics; the area equation uses |v| = 1.
    playbackRate: 1, minPlaybackRate: 0.1, maxPlaybackRate: 4, playbackRateStep: 0.05,
    maxStep: 0.006, // Arc-length step for geodesic and Jacobi integration.
    maxDistance: Math.PI * 2,
    localComparisonLimit: 0.65, // Stop when the pair leaves a small local neighborhood.
    connectorIterations: 10,
    connectorTolerance: 1e-8,
    connectorDifferenceStep: 1e-5,
    connectorTrustStep: 0.25,
    connectorSampleStep: 0.012,
    trailSampleStep: 0.008,
    maxTrailPoints: 2400,
    trailWidthPx: 2.5,
    separationWidthPx: 3,
    separationHeadLength: 0.025,
    separationHeadWidth: 0.012,
    velocityArrowScale: 0.75,
    velocityArrowThickness: 0.25, // Radial scale for outside and Top View only; lengths stay unchanged.
    torusVelocityArrowScale: 0.65,
    torusVelocityOffset: 0.08, // Lift straight tangent arrows clear of the concave inner wall.
    torusFollowPitchDeg: 35,
    velocityLabelGap: 0.05,
    velocityLabelNormalOffset: 0.025,
    surfaceTintOpacity: 0.19,
    construction: {
      stepSize: 0.2, minStep: 0.04, maxStep: 0.35, stepIncrement: 0.01,
      phaseSeconds: { move: 1.4, transport: 1.8 },
      automaticHoldSeconds: 1.0,
      transportMoveFraction: 0.8, // Finish carrying v1, then reveal the tip-to-tip velocity difference.
      transportSourceOpacity: 0.4, transportPathOpacity: 0.8, transportPathWidthPx: 2,
      velocityDifferenceWidthPx: 2, velocityLabelGapPx: 18,
      velocityDifferenceGuideWidthPx: 1, velocityDifferenceGuideOpacity: 0.45, velocityDifferenceDashCount: 12,
      derivativeArcStep: 0.012, // Centered covariant differences, independent of the teaching step.
      stripRows: 16, stripColumns: 12,
      areaOpacity: 0.32, surfaceOffset: 0.008,
      transportAreaOpacity: 0.46, areaRelationFraction: 0.5,
      lineWidthPx: 1.8, oldOpacity: 0.55, arrowheadLength: 0.018,
      separationLabelGapPx: 12, // Label each old/new surface connector once, at its midpoint.
      boundaryLabelFraction: 0.2, // Position v Delta-t labels nearer the old connector.
      firstPersonGlyphScale: 0.1,
      firstPersonSurfaceOffset: 0.0006,
      colors: { old: '#87c2d4', current: '#c9a8ff' },
    },
  },
  surface: {
    type: 'sphere', // 'sphere' or 'torus'. The UI can switch without reloading.
    torus: {
      majorRadius: 0.8, // Must be greater than minorRadius.
      minorRadius: 0.33,
      startTubeDeg: 0,
      longitudeSegments: 192,
      tubeSegments: 128,
      circleSegments: 1024,
      geodesicStep: 0.006,
      followPitchDeg: 58,
    },
  },
  initial: {
    latitudeDeg: 0,
    longitudeDeg: 0,
    directionDeg: 30, // Counterclockwise from local east toward local north.
  },
  movement: {
    speedDegPerSecond: 24, // Actual surface angular speed on the unit sphere.
    minSpeedDegPerSecond: 6,
    maxSpeedDegPerSecond: 70,
    boostMultiplier: 2,
    latitudeLimitDeg: 89, // The flat chart and geographic WASD frame are singular at the poles.
    maxFrameSeconds: 0.05, // Prevent jumps after a background tab resumes.
    maxStepRadians: 0.004,
    maxLongitudeStepRadians: 0.012,
  },
  trail: {
    visible: true,
    historyArrowsVisible: true,
    sampleSpacingRadians: 0.009,
    maxPoints: 7000,
    historySpacingRadians: 0.34,
    maxHistoryArrows: 16,
    lineWidthPx: 2.2,
    historyOpacity: 0.36,
  },
  loop: {
    type: 'rectangle', // 'rectangle' or 'circle'. Both start at initial.latitude/longitude.
    // Rectangle width is longitude span; height is latitude span, in degrees.
    longitudeSpanDeg: 90,
    heightDeg: 60,
    minWidthDeg: 5,
    maxWidthDeg: 180,
    minHeightDeg: 5,
    maxHeightDeg: 80,
    dimensionStepDeg: 1,
    // A true spherical circle: all points have this angular distance from its center.
    circleRadiusDeg: 35,
    minCircleRadiusDeg: 5,
    maxCircleRadiusDeg: 80,
    circleSegments: 4096, // Cap-area error stays below 0.000002 sr through the slider range.
    previewStepRadians: 0.035,
    previewWidthPx: 1.6,
    previewOpacity: 0.65,
    speedMultiplier: 1.6,
    closureToleranceDeg: 0.6,
    minimumLengthForClosureDeg: 8,
  },
  area: {
    maskWidth: 720,
    maskHeight: 360,
    antialiasRows: 2,
    sphereOpacity: 0.34,
    mapOpacity: 0.29,
    angleArcRadius: 0.22,
    angleArcMapRadiusPx: 30,
    angleArcSegments: 64,
    angleArcWidthPx: 2,
    angleArcFillOpacity: 0.07,
    angleLabelRadius: 0.31,
    torusAngleOffset: 0.09,
    labelAvoidanceWidthPx: 70,
    labelAvoidanceHeightPx: 24,
    labelShiftPx: 30,
  },
  curvature: {
    axisRadius: 0.24,
    axisWidthPx: 2.6,
    arrowheadLength: 0.045,
    arrowheadWidth: 0.026,
    labelRadius: 0.31,
    labelNormalOffset: 0.06,
    spherePlaneOffset: 0.02,
    torusPlaneOffset: 0.075,
    zeroTolerance: 1e-8,
  },
  camera: {
    yawDeg: 24,
    pitchDeg: 19,
    distance: 3.65,
    minDistance: 2.25,
    maxDistance: 6,
    minPitchDeg: -86,
    maxPitchDeg: 86,
    fieldOfViewDeg: 39,
    fitNarrowViews: true, // Keep this FOV on the shorter canvas dimension.
    near: 0.05,
    far: 30,
    orbitRadiansPerPixel: 0.006,
    zoomSensitivity: 0.001,
    easingRate: 9, // Exponential, frame-rate-independent easing.
    followOnStart: true,
    followYawOffsetDeg: 20,
    followPitchOffsetDeg: 16,
    followLatitudeFactor: 0.65,
  },
  topView: {
    enabled: false, // Available independently in all three surface experiments.
    distance: 1.25, minDistance: 0.4, maxDistance: 5,
    fieldOfViewDeg: 50, near: 0.002, far: 30,
    zoomSensitivity: 0.0015, easingRate: 9,
    normalLabelOffsetPx: 22, // Separate labels on components viewed end-on.
    surfaceClearance: 0.002, collisionSteps: 128,
    collisionTolerance: 0.00001, collisionSafety: 0.8,
  },
  firstPerson: {
    enabled: false, // Initial Geodesic deviation view; construction uses geodesic.firstPerson.enabled.
    height: 0.008, // Surface units above the ground (sphere radius = 1).
    setback: 0.028, // Just behind the particle, so the dot and velocity arrow remain visible.
    orbit: { // Shared by both first-person modes; angles use the local surface frame.
      minPitchDeg: 0, maxPitchDeg: 85,
      minDistanceScale: 0.5, maxDistance: 2.5, // Surface units; minimum scales each mode's setback.
      orbitRadiansPerPixel: 0.006, zoomSensitivity: 0.002, easingRate: 9,
      surfaceClearance: 0.001, collisionSteps: 128,
      collisionTolerance: 0.00001, collisionSafety: 0.8,
      fogDistanceScale: 2, // Extend haze as the camera pulls back from the dot.
    },
    fieldOfViewDeg: 55,
    near: 0.0002,
    far: 8,
    playbackRate: 0.25, // Slow motion for the close view; simulated speed/physics stay unchanged.
    arrowScale: 0.03,
    arrowWidthScale: 0.45,
    arrowHeightScale: 0.30, // A low-profile, still volumetric arrow that rests near the ground.
    arrowSurfaceOffset: 0.0006, // Clears the cone underside and the concave torus wall.
    pathSurfaceOffset: 0.00012,
    markerRadiusPx: 2.4,
    trailWidthPx: 1.5,
    trailSampleStep: 0.001,
    separationHeadScale: 0.10,
    longitudeSegments: 640, // Finer meshes keep the nearby ground and horizon smooth.
    latitudeSegments: 384,
    rimStrength: 0.08,
    fogNear: 0.06, // Distance haze emphasizes the nearby, almost-flat patch while walking.
    fogFar: 0.32,
    grid: { minorStepDeg: 1, majorStepDeg: 5, minorWidthPx: 0.45, majorWidthPx: 0.75, equatorWidthPx: 1 },
  },
  grid: {
    minorStepDeg: 15,
    majorStepDeg: 30,
    minorWidthPx: 0.55,
    majorWidthPx: 0.85,
    equatorWidthPx: 1.2,
  },
  sphereMap: {
    polarOnStart: false, // Sphere only. The regular map uses local east/north direction glyphs.
    defaultRadius: 1.25, // Stereographic radius: the equator is at 1.
    minRadius: 0.008, maxRadius: 6,
    fitMargin: 1.35, paddingPx: 12,
    zoomSensitivity: 0.0015, zoomEasingRate: 12,
    pathStepRadians: 0.02, // Subdivide curved projected paths before screen clipping.
    latitudeGridStepsDeg: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
    latitudeGridRings: 6, majorLatitudeEvery: 5,
  },
  geometry: {
    sphereLongitudeSegments: 160,
    sphereLatitudeSegments: 100,
    sphereRadius: 1, // Common display scale for both surfaces; physical readouts are unchanged.
    pathSurfaceOffset: 0.006,
    arrowSurfaceOffset: 0.034,
    arrowLength: 0.36,
    arrowShaftWidth: 0.032,
    arrowHeadWidth: 0.10,
    arrowHeadFraction: 0.32,
    arrowRadialSegments: 32,
    startArrowScale: 0.82,
    historyArrowScale: 0.60,
    tangentVisible: true,
    tangentRadius: 0.23,
    tangentOpacity: 0.10,
    circleSegments: 64,
    markerRadiusPx: 4.2,
    mapArrowLengthPx: 45,
    mapArrowShaftWidthPx: 3.8,
    mapArrowHeadWidthPx: 15,
  },
  render: {
    maxPixelRatio: 2,
    lightDirection: [-0.6, 0.9, 1.6],
    ambientLight: 0.36,
    diffuseLight: 0.70,
    rimStrength: 0.54,
    rimPower: 3.4,
    readoutIntervalMs: 80,
    arrowAmbient: 0.30,
    arrowDiffuse: 0.72,
    arrowSpecular: 0.58,
    arrowShininess: 44,
  },
  colors: {
    background: '#080f17',
    firstPersonSky: '#0c1922',
    surface: '#113d3c',
    gridMinor: '#245a5b',
    gridMajor: '#438780',
    equator: '#70bdb1',
    rim: '#46a799',
    arrow: '#ffd397',
    path: '#77d9c0',
    start: '#8aa5ab',
    tangent: '#98daca',
    mapBackground: '#0c1922',
    mapGridMinor: '#172c36',
    mapGridMajor: '#29414b',
    mapEquator: '#4b7b77',
    areaPositive: '#f28e85',
    areaNegative: '#519eff',
    curvatureZero: '#a0b2c0',
    geodesicA: '#6fe5d2',
    geodesicB: '#ffd397',
    separation: '#d2b4ff',
  },
};
