using System.Collections.Generic;
using UnityEngine;

namespace SmallRepairs.Gesture
{
    /// <summary>
    /// Turns raw contact samples into speed and steadiness. Has no input or engine dependencies, so it can be tested directly.
    ///
    /// Direction variance is measured as the spread of curvature, not of heading. A steady polishing circle turns
    /// constantly, so raw heading variance would score it as jitter, while its curvature stays constant.
    /// </summary>
    public sealed class GestureAnalyzer
    {
        struct SpeedSample
        {
            public float Time;
            public float Speed;
        }

        struct CurvatureSample
        {
            public float Time;
            public float Curvature;
        }

        readonly GestureParams _params;
        readonly Queue<SpeedSample> _speeds = new Queue<SpeedSample>();
        readonly Queue<CurvatureSample> _curvatures = new Queue<CurvatureSample>();

        ContactState _contact = ContactState.None;
        Vector2 _lastPosition;
        float _lastMoveTime;
        float _lastTime;
        float _smoothedSpeed;
        float _smoothedPressure;
        float _steadiness = 1f;

        Vector2 _headingAnchor;
        bool _hasHeading;
        float _lastHeading;

        public GestureAnalyzer(GestureParams parameters)
        {
            _params = parameters;
        }

        /// <param name="time">Seconds, monotonic.</param>
        /// <param name="touching">Whether the finger is down this frame.</param>
        /// <param name="position">Position in reference pixels. Ignored when not touching.</param>
        /// <param name="pressure">Shaped 0–1 pressure. Ignored when not touching.</param>
        public GestureFrame Step(float time, bool touching, Vector2 position, float pressure)
        {
            float dt = Mathf.Max(0f, time - _lastTime);
            _lastTime = time;

            if (touching)
            {
                if (_contact == ContactState.None || _contact == ContactState.Ended)
                    BeginContact(time, position, pressure);
                else
                    ContinueContact(time, dt, position, pressure);
            }
            else if (_contact == ContactState.Began || _contact == ContactState.Held)
            {
                _contact = ContactState.Ended;
                _smoothedSpeed = 0f;
            }
            else
            {
                _contact = ContactState.None;
            }

            return new GestureFrame
            {
                Contact = _contact,
                Position = _lastPosition,
                Speed = _smoothedSpeed,
                Steadiness = _steadiness,
                Pressure = _smoothedPressure
            };
        }

        void BeginContact(float time, Vector2 position, float pressure)
        {
            _contact = ContactState.Began;
            _speeds.Clear();
            _curvatures.Clear();
            _lastPosition = position;
            _lastMoveTime = time;
            _headingAnchor = position;
            _hasHeading = false;
            _smoothedSpeed = 0f;
            _smoothedPressure = pressure;
            _steadiness = 1f;
        }

        void ContinueContact(float time, float dt, Vector2 position, float pressure)
        {
            _contact = ContactState.Held;
            float distance = Vector2.Distance(position, _lastPosition);

            // Touch digitizers can report slower than the frame rate, so a frame with no movement is not a stop.
            // Speed is measured between reported moves and only falls to zero after StoppedAfterMs.
            float targetSpeed;
            if (distance > 0f)
            {
                targetSpeed = distance / Mathf.Max(time - _lastMoveTime, 1e-4f);
                _speeds.Enqueue(new SpeedSample { Time = time, Speed = targetSpeed });
                MeasureHeading(time, position);
                _lastPosition = position;
                _lastMoveTime = time;
            }
            else if ((time - _lastMoveTime) * 1000f >= _params.StoppedAfterMs)
            {
                targetSpeed = 0f;
            }
            else
            {
                targetSpeed = _smoothedSpeed;
            }

            _smoothedSpeed = Smooth(_smoothedSpeed, targetSpeed, dt, _params.SpeedSmoothingMs);
            _smoothedPressure = Smooth(_smoothedPressure, pressure, dt, _params.PressureSmoothingMs);

            TrimWindow(time);
            UpdateSteadiness();
        }

        void MeasureHeading(float time, Vector2 position)
        {
            Vector2 travel = position - _headingAnchor;
            float travelled = travel.magnitude;
            if (travelled < _params.HeadingStepPx)
                return;

            float heading = Mathf.Atan2(travel.y, travel.x);
            if (_hasHeading)
            {
                float turn = Mathf.DeltaAngle(_lastHeading * Mathf.Rad2Deg, heading * Mathf.Rad2Deg) * Mathf.Deg2Rad;
                _curvatures.Enqueue(new CurvatureSample { Time = time, Curvature = turn / travelled });
            }

            _lastHeading = heading;
            _hasHeading = true;
            _headingAnchor = position;
        }

        void TrimWindow(float time)
        {
            float oldest = time - _params.SteadinessWindowMs / 1000f;
            while (_speeds.Count > 0 && _speeds.Peek().Time < oldest)
                _speeds.Dequeue();
            while (_curvatures.Count > 0 && _curvatures.Peek().Time < oldest)
                _curvatures.Dequeue();
        }

        void UpdateSteadiness()
        {
            // Too few samples to judge, for example a finger at rest: keep the last value rather than guessing.
            if (_speeds.Count < 3)
                return;

            float jitter = Mathf.Clamp01(SpeedVariation() / _params.SpeedVariationAtWorst);
            if (_curvatures.Count >= 3)
            {
                float curvatureJitter = Mathf.InverseLerp(
                    _params.CurvatureNoiseFloor, _params.CurvatureVariationAtWorst, CurvatureSpread());
                jitter = Mathf.Max(jitter, curvatureJitter);
            }

            _steadiness = 1f - jitter;
        }

        /// <summary>
        /// Spread of speed around its linear trend over the window, relative to mean speed. Measuring around the trend
        /// rather than the mean means speeding up from rest or slowing to a stop does not count as wobble.
        /// </summary>
        float SpeedVariation()
        {
            float firstTime = _speeds.Peek().Time;
            float meanTime = 0f;
            float meanSpeed = 0f;
            foreach (SpeedSample sample in _speeds)
            {
                meanTime += sample.Time - firstTime;
                meanSpeed += sample.Speed;
            }
            meanTime /= _speeds.Count;
            meanSpeed /= _speeds.Count;
            if (meanSpeed <= 0f)
                return 0f;

            float covariance = 0f;
            float timeVariance = 0f;
            foreach (SpeedSample sample in _speeds)
            {
                float t = sample.Time - firstTime - meanTime;
                covariance += t * (sample.Speed - meanSpeed);
                timeVariance += t * t;
            }
            float slope = timeVariance > 0f ? covariance / timeVariance : 0f;

            float squares = 0f;
            foreach (SpeedSample sample in _speeds)
            {
                float t = sample.Time - firstTime - meanTime;
                float residual = sample.Speed - (meanSpeed + slope * t);
                squares += residual * residual;
            }
            return Mathf.Sqrt(squares / _speeds.Count) / meanSpeed;
        }

        float CurvatureSpread()
        {
            float sum = 0f;
            foreach (CurvatureSample sample in _curvatures)
                sum += sample.Curvature;
            float mean = sum / _curvatures.Count;

            float squares = 0f;
            foreach (CurvatureSample sample in _curvatures)
                squares += (sample.Curvature - mean) * (sample.Curvature - mean);
            return Mathf.Sqrt(squares / _curvatures.Count);
        }

        static float Smooth(float current, float target, float dt, float timeConstantMs)
        {
            if (timeConstantMs <= 0f)
                return target;
            return Mathf.Lerp(current, target, 1f - Mathf.Exp(-dt * 1000f / timeConstantMs));
        }
    }
}
