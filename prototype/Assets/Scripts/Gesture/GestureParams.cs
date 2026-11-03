using System;
using UnityEngine;

namespace SmallRepairs.Gesture
{
    public enum PressureSource
    {
        TouchRadius,
        Force
    }

    [Serializable]
    public class GestureParams
    {
        [Tooltip("Speeds are reported as pixels per second at this density, so one physical stroke reads the same on every phone.")]
        public float ReferenceDpi = 326f;

        [Tooltip("Spec default 300 ms.")]
        public float SteadinessWindowMs = 300f;

        [Tooltip("Speed variation (std dev / mean) at which steadiness reaches 0.")]
        public float SpeedVariationAtWorst = 0.6f;

        [Tooltip("Curvature std dev (radians per reference pixel) below this counts as touch noise.")]
        public float CurvatureNoiseFloor = 0.006f;

        [Tooltip("Curvature std dev (radians per reference pixel) at which steadiness reaches 0.")]
        public float CurvatureVariationAtWorst = 0.04f;

        [Tooltip("Reference pixels the finger must travel before a new heading is measured; hides pixel-level noise on slow strokes.")]
        public float HeadingStepPx = 12f;

        [Tooltip("With no movement for this long, the finger counts as stopped.")]
        public float StoppedAfterMs = 60f;

        [Tooltip("Time constant of the speed smoothing.")]
        public float SpeedSmoothingMs = 40f;

        [Tooltip("Time constant of the pressure smoothing.")]
        public float PressureSmoothingMs = 30f;

        public PressureSource PressureSource = PressureSource.TouchRadius;

        [Tooltip("Touch radius in reference pixels that maps to pressure 0.")]
        public float RadiusAtLightTouch = 15f;

        [Tooltip("Touch radius in reference pixels that maps to pressure 1.")]
        public float RadiusAtFirmTouch = 45f;

        [Tooltip("Shapes raw 0–1 pressure before smoothing.")]
        public AnimationCurve PressureCurve = AnimationCurve.Linear(0f, 0f, 1f, 1f);
    }
}
