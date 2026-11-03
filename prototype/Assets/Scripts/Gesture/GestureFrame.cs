using UnityEngine;

namespace SmallRepairs.Gesture
{
    public enum ContactState
    {
        None,
        Began,
        Held,
        Ended
    }

    /// <summary>One gesture-model output, consumed by audio, haptics and the paint masks.</summary>
    public struct GestureFrame
    {
        public ContactState Contact;

        /// <summary>Screen position in pixels.</summary>
        public Vector2 Position;

        /// <summary>Position as 0–1 of the screen; x drives stereo pan.</summary>
        public Vector2 NormalizedPosition;

        /// <summary>Smoothed stroke speed in reference pixels per second (see GestureParams.ReferenceDpi).</summary>
        public float Speed;

        /// <summary>1 = perfectly steady stroke, 0 = at or past the jitter limits.</summary>
        public float Steadiness;

        /// <summary>Smoothed 0–1 pressure after the source curve.</summary>
        public float Pressure;

        public bool IsTouching => Contact == ContactState.Began || Contact == ContactState.Held;
    }
}
