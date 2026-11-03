using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace SmallRepairs.Gesture
{
    /// <summary>
    /// The single gesture source. Reads the primary finger once per frame and publishes a GestureFrame.
    /// In the editor the mouse stands in for a finger and the scroll wheel stands in for pressure.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GestureService : MonoBehaviour
    {
        const float MouseScrollPressureStep = 0.05f;

        public static GestureService Instance { get; private set; }

        public event Action<GestureFrame> FrameUpdated;

        public GestureFrame Current { get; private set; }

        /// <summary>Measured update rate; the spec asks for 60–120 Hz.</summary>
        public float SampleRateHz { get; private set; }

        /// <summary>Pressure value before the curve and smoothing, for checking what a device actually reports.</summary>
        public float RawPressureSignal { get; private set; }

        GestureParams _params;
        GestureAnalyzer _analyzer;
        float _pixelsToReference = 1f;
        float _mousePressure = 0.5f;
        Vector2 _lastScreenPosition;
        int _framesThisSecond;
        float _rateWindowStart;

        public void Configure(GestureParams parameters)
        {
            _params = parameters;
            _analyzer = new GestureAnalyzer(_params);
            _pixelsToReference = Screen.dpi > 0f ? _params.ReferenceDpi / Screen.dpi : 1f;
        }

        void OnEnable()
        {
            Instance = this;
            EnhancedTouchSupport.Enable();
        }

        void OnDisable()
        {
            EnhancedTouchSupport.Disable();
            if (Instance == this)
                Instance = null;
        }

        void Update()
        {
            bool touching = ReadInput(out Vector2 screenPosition, out float rawPressure);
            if (touching)
                _lastScreenPosition = screenPosition;

            float shaped = _params.PressureCurve.Evaluate(rawPressure);
            GestureFrame frame = _analyzer.Step(
                Time.unscaledTime, touching, screenPosition * _pixelsToReference, shaped);

            frame.Position = _lastScreenPosition;
            frame.NormalizedPosition = new Vector2(
                _lastScreenPosition.x / Mathf.Max(1, Screen.width),
                _lastScreenPosition.y / Mathf.Max(1, Screen.height));

            Current = frame;
            MeasureRate();
            FrameUpdated?.Invoke(frame);
        }

        bool ReadInput(out Vector2 position, out float rawPressure)
        {
            if (Touch.activeTouches.Count > 0)
            {
                Touch touch = Touch.activeTouches[0];
                position = touch.screenPosition;
                rawPressure = ReadTouchPressure(touch);
                return true;
            }

            Mouse mouse = Mouse.current;
            if (mouse != null)
            {
                float scroll = mouse.scroll.ReadValue().y;
                if (scroll != 0f)
                    _mousePressure = Mathf.Clamp01(_mousePressure + Mathf.Sign(scroll) * MouseScrollPressureStep);
                RawPressureSignal = _mousePressure;
                position = mouse.position.ReadValue();
                rawPressure = _mousePressure;
                return mouse.leftButton.isPressed;
            }

            position = default;
            rawPressure = 0f;
            return false;
        }

        float ReadTouchPressure(Touch touch)
        {
            if (_params.PressureSource == PressureSource.Force)
            {
                RawPressureSignal = touch.pressure;
                return Mathf.Clamp01(touch.pressure);
            }

            float radius = Mathf.Max(touch.radius.x, touch.radius.y) * _pixelsToReference;
            RawPressureSignal = radius;

            // Some devices report no radius at all. Mid pressure keeps those strokes audible instead of silent.
            if (radius <= 0f)
                return 0.5f;
            return Mathf.InverseLerp(_params.RadiusAtLightTouch, _params.RadiusAtFirmTouch, radius);
        }

        void MeasureRate()
        {
            _framesThisSecond++;
            float elapsed = Time.unscaledTime - _rateWindowStart;
            if (elapsed < 1f)
                return;

            SampleRateHz = _framesThisSecond / elapsed;
            _framesThisSecond = 0;
            _rateWindowStart = Time.unscaledTime;
        }
    }
}
