using NUnit.Framework;
using SmallRepairs.Gesture;
using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs.Tests
{
    public class ModulationMapperTests
    {
        const float LongEnoughToSettle = 1f;
        const float FrameTime = 1f / 120f;

        /// <summary>Drives the real analyzer and mapper, so tests see what the analyzer actually reports on lift.</summary>
        sealed class LiveStroke
        {
            readonly GestureAnalyzer _analyzer = new GestureAnalyzer(new GestureParams());
            readonly ModulationMapper _mapper = new ModulationMapper(new ModulationParams());
            float _time;
            float _x;

            public ModulationFrame Run(float seconds, bool touching, float speed)
            {
                ModulationFrame result = default;
                int frames = Mathf.Max(1, Mathf.RoundToInt(seconds / FrameTime));
                for (int i = 0; i < frames; i++)
                {
                    _time += FrameTime;
                    _x += speed * FrameTime;
                    GestureFrame gesture = _analyzer.Step(_time, touching, new Vector2(_x, 0f), 1f);
                    result = _mapper.Map(gesture, FrameTime);
                }
                return result;
            }
        }

        static GestureFrame Stroke(float speed, float steadiness = 1f, float pressure = 0.5f, float x = 0.5f)
        {
            return new GestureFrame
            {
                Contact = ContactState.Held,
                Speed = speed,
                Steadiness = steadiness,
                Pressure = pressure,
                NormalizedPosition = new Vector2(x, 0.5f)
            };
        }

        static ModulationFrame Map(GestureFrame gesture)
        {
            return new ModulationMapper(new ModulationParams()).Map(gesture, LongEnoughToSettle);
        }

        [Test]
        public void Layers_PlayAloneAtTheirAnchors()
        {
            var parameters = new ModulationParams();
            Vector3 anchors = parameters.SpeedLayerThresholds;

            ModulationFrame slow = Map(Stroke(anchors.x));
            ModulationFrame medium = Map(Stroke(anchors.y));
            ModulationFrame fast = Map(Stroke(anchors.z));

            Assert.AreEqual(1f, slow.SlowLayer, 0.001f);
            Assert.AreEqual(0f, slow.MediumLayer, 0.001f);
            Assert.AreEqual(1f, medium.MediumLayer, 0.001f);
            Assert.AreEqual(0f, medium.SlowLayer, 0.001f);
            Assert.AreEqual(0f, medium.FastLayer, 0.001f);
            Assert.AreEqual(1f, fast.FastLayer, 0.001f);
            Assert.AreEqual(0f, fast.MediumLayer, 0.001f);
        }

        [Test]
        public void Layers_CrossfadeWithEqualPower()
        {
            Vector3 anchors = new ModulationParams().SpeedLayerThresholds;

            ModulationFrame between = Map(Stroke((anchors.x + anchors.y) / 2f));

            float power = between.SlowLayer * between.SlowLayer + between.MediumLayer * between.MediumLayer;
            Assert.AreEqual(1f, power, 0.001f);
        }

        [Test]
        public void Pitch_StaysWithinTheSpecRange()
        {
            Assert.AreEqual(-3f, Map(Stroke(0f)).PitchSemitones, 0.001f);
            Assert.AreEqual(0f, Map(Stroke(new ModulationParams().SpeedLayerThresholds.y)).PitchSemitones, 0.001f);
            Assert.AreEqual(3f, Map(Stroke(100000f)).PitchSemitones, 0.001f);
        }

        [Test]
        public void Lowpass_RunsFromSixKilohertzToFullBand()
        {
            Assert.AreEqual(6000f, Map(Stroke(500f, steadiness: 0f)).LowpassHz, 1f);
            Assert.AreEqual(20000f, Map(Stroke(500f, steadiness: 1f)).LowpassHz, 1f);
        }

        [Test]
        public void Gain_RisesWithPressure_AndIsSilentAtRest()
        {
            float light = Map(Stroke(500f, pressure: 0f)).Gain;
            float firm = Map(Stroke(500f, pressure: 1f)).Gain;

            Assert.Greater(firm, light);
            Assert.AreEqual(0f, Map(Stroke(0f)).Gain, 0.001f);
        }

        [Test]
        public void Pan_FollowsFingerX()
        {
            Assert.AreEqual(-1f, Map(Stroke(500f, x: 0f)).Pan, 0.001f);
            Assert.AreEqual(1f, Map(Stroke(500f, x: 1f)).Pan, 0.001f);
        }

        [Test]
        public void Envelope_FadesInAndTailsOutWithinTheSpecTimes()
        {
            var parameters = new ModulationParams();
            var mapper = new ModulationMapper(parameters);
            GestureFrame stroke = Stroke(parameters.SpeedLayerThresholds.y, pressure: 1f);

            float afterTen = mapper.Map(stroke, 0.010f).Gain;
            Assert.Greater(afterTen, 0f);
            Assert.Less(afterTen, 1f);
            Assert.AreEqual(1f, mapper.Map(stroke, 0.030f).Gain, 0.001f);

            stroke.Contact = ContactState.Ended;
            Assert.Greater(mapper.Map(stroke, 0.060f).Gain, 0f);
            Assert.AreEqual(0f, mapper.Map(stroke, 0.120f).Gain, 0.001f);
        }

        [Test]
        public void HapticTicks_TrackSpeed_AndStopWhenTheFingerLifts()
        {
            var parameters = new ModulationParams();
            float fast = parameters.SpeedLayerThresholds.z;
            GestureFrame lifted = Stroke(fast);
            lifted.Contact = ContactState.None;

            Assert.AreEqual(parameters.Material.HapticTickRate, Map(Stroke(fast)).HapticTickRate, 0.001f);
            Assert.AreEqual(parameters.Material.HapticTickRate / 2f, Map(Stroke(fast / 2f)).HapticTickRate, 0.001f);
            Assert.AreEqual(0f, Map(lifted).HapticTickRate);
        }

        [Test]
        public void Lift_AfterAStroke_TailsOutOverTheReleaseTime()
        {
            var parameters = new ModulationParams();
            float release = parameters.ReleaseMs / 1000f;
            var live = new LiveStroke();

            ModulationFrame stroke = live.Run(0.5f, true, parameters.SpeedLayerThresholds.y);
            Assert.Greater(stroke.Gain, 0.9f);

            ModulationFrame halfway = live.Run(release / 2f, false, 0f);
            Assert.AreEqual(stroke.Gain / 2f, halfway.Gain, 0.05f);
            Assert.AreEqual(stroke.PitchSemitones, halfway.PitchSemitones, 0.001f);
            Assert.AreEqual(stroke.MediumLayer, halfway.MediumLayer, 0.001f);

            Assert.AreEqual(0f, live.Run(release, false, 0f).Gain, 0.001f);
        }

        [Test]
        public void Lift_AfterTheFingerStopped_StaysSilent()
        {
            var parameters = new ModulationParams();
            var live = new LiveStroke();

            live.Run(0.5f, true, parameters.SpeedLayerThresholds.y);
            live.Run(0.5f, true, 0f);

            Assert.AreEqual(0f, live.Run(FrameTime, false, 0f).Gain, 0.001f);
        }

        [Test]
        public void NewStroke_DoesNotInheritTheLastStrokesSpeed()
        {
            var parameters = new ModulationParams();
            var live = new LiveStroke();

            live.Run(0.5f, true, parameters.SpeedLayerThresholds.z);
            live.Run(LongEnoughToSettle, false, 0f);
            ModulationFrame began = live.Run(FrameTime, true, 0f);

            Assert.AreEqual(0f, began.Gain, 0.001f);
            Assert.AreEqual(0f, began.FastLayer, 0.001f);
        }
    }
}
