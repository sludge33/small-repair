using NUnit.Framework;
using SmallRepairs.Gesture;
using UnityEngine;

namespace SmallRepairs.Tests
{
    public class GestureAnalyzerTests
    {
        const float FrameTime = 1f / 60f;

        // Deterministic noise, so a failure reproduces exactly.
        static float Noise(int frame, float amplitude)
        {
            return Mathf.Sin(frame * 12.9898f) * 43758.5453f % 1f * amplitude;
        }

        static GestureFrame Run(GestureAnalyzer analyzer, float seconds, System.Func<int, Vector2> path, float pressure = 0.5f)
        {
            GestureFrame frame = default;
            int frames = Mathf.RoundToInt(seconds / FrameTime);
            for (int i = 0; i < frames; i++)
                frame = analyzer.Step(i * FrameTime, true, path(i), pressure);
            return frame;
        }

        static Vector2 Line(int frame, float pixelsPerSecond)
        {
            return new Vector2(frame * FrameTime * pixelsPerSecond, 0f);
        }

        static Vector2 Circle(int frame, float radius, float pixelsPerSecond)
        {
            float angle = frame * FrameTime * pixelsPerSecond / radius;
            return new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius;
        }

        [Test]
        public void SteadyLine_ReportsItsSpeedAndFullSteadiness()
        {
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f, i => Line(i, 600f));

            Assert.AreEqual(600f, frame.Speed, 10f);
            Assert.AreEqual(1f, frame.Steadiness, 0.02f);
            Assert.AreEqual(ContactState.Held, frame.Contact);
        }

        [Test]
        public void SteadyCircle_IsNotScoredAsJitter()
        {
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f, i => Circle(i, 120f, 600f));

            Assert.Greater(frame.Steadiness, 0.9f);
        }

        [Test]
        public void AcceleratingFromRest_IsNotScoredAsJitter()
        {
            var analyzer = new GestureAnalyzer(new GestureParams());
            const float rampSeconds = 0.25f;
            const float topSpeed = 900f;
            float x = 0f;
            float lowest = 1f;

            for (int i = 0; i < 60; i++)
            {
                float time = i * FrameTime;
                float speed = topSpeed * Mathf.SmoothStep(0f, 1f, time / rampSeconds);
                x += speed * FrameTime;
                lowest = Mathf.Min(lowest, analyzer.Step(time, true, new Vector2(x, 0f), 0.5f).Steadiness);
            }

            Assert.Greater(lowest, 0.7f);
        }

        [Test]
        public void SpeedWobble_LowersSteadiness()
        {
            float x = 0f;
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f, i =>
            {
                x += (i % 4 < 2 ? 200f : 1200f) * FrameTime;
                return new Vector2(x, 0f);
            });

            Assert.Less(frame.Steadiness, 0.4f);
        }

        [Test]
        public void DirectionWobble_LowersSteadiness()
        {
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f,
                i => Line(i, 600f) + new Vector2(0f, Noise(i, 14f)));

            Assert.Less(frame.Steadiness, 0.4f);
        }

        [Test]
        public void TouchNoise_OnASteadyStroke_StaysSteady()
        {
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f,
                i => Line(i, 400f) + new Vector2(0f, Noise(i, 0.2f)));

            Assert.Greater(frame.Steadiness, 0.75f);
        }

        [Test]
        public void DigitizerSlowerThanFrameRate_DoesNotBreakSpeedOrSteadiness()
        {
            GestureFrame frame = Run(new GestureAnalyzer(new GestureParams()), 1f, i => Line(i - i % 2, 600f));

            Assert.AreEqual(600f, frame.Speed, 60f);
            Assert.Greater(frame.Steadiness, 0.9f);
        }

        [Test]
        public void FingerAtRest_FallsToZeroSpeed_AndKeepsSteadiness()
        {
            var analyzer = new GestureAnalyzer(new GestureParams());
            Run(analyzer, 0.5f, i => Line(i, 600f));

            Vector2 rest = Line(29, 600f);
            GestureFrame frame = default;
            for (int i = 30; i < 90; i++)
                frame = analyzer.Step(i * FrameTime, true, rest, 0.5f);

            Assert.AreEqual(0f, frame.Speed, 1f);
            Assert.Greater(frame.Steadiness, 0.9f);
        }

        [Test]
        public void ContactStates_RunBeganHeldEndedNone()
        {
            var analyzer = new GestureAnalyzer(new GestureParams());

            Assert.AreEqual(ContactState.Began, analyzer.Step(0f, true, Vector2.zero, 0.5f).Contact);
            Assert.AreEqual(ContactState.Held, analyzer.Step(FrameTime, true, Vector2.right, 0.5f).Contact);
            Assert.AreEqual(ContactState.Ended, analyzer.Step(FrameTime * 2f, false, Vector2.zero, 0f).Contact);
            Assert.AreEqual(ContactState.None, analyzer.Step(FrameTime * 3f, false, Vector2.zero, 0f).Contact);
        }

        [Test]
        public void NewStroke_DoesNotInheritThePreviousOne()
        {
            var analyzer = new GestureAnalyzer(new GestureParams());
            Run(analyzer, 0.5f, i => Line(i, 2000f));
            analyzer.Step(0.6f, false, Vector2.zero, 0f);

            GestureFrame frame = analyzer.Step(0.7f, true, new Vector2(5000f, 5000f), 0.2f);

            Assert.AreEqual(ContactState.Began, frame.Contact);
            Assert.AreEqual(0f, frame.Speed);
            Assert.AreEqual(1f, frame.Steadiness);
            Assert.AreEqual(0.2f, frame.Pressure, 0.001f);
        }

        [Test]
        public void Pressure_IsSmoothedTowardTheInput()
        {
            var analyzer = new GestureAnalyzer(new GestureParams());
            analyzer.Step(0f, true, Vector2.zero, 0f);

            GestureFrame first = analyzer.Step(FrameTime, true, Vector2.zero, 1f);
            GestureFrame settled = Run(analyzer, 0.5f, i => Vector2.zero, 1f);

            Assert.Greater(first.Pressure, 0f);
            Assert.Less(first.Pressure, 1f);
            Assert.AreEqual(1f, settled.Pressure, 0.02f);
        }
    }
}
