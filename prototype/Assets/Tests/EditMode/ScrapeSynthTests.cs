using NUnit.Framework;
using SmallRepairs.Audio;
using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs.Tests
{
    public class ScrapeSynthTests
    {
        const int SampleRate = 48000;
        const int BlockFrames = 512;
        const int SettleBlocks = 20;
        const int MeasureBlocks = 40;

        static ModulationFrame Scrape(float pan = 0f, float lowpassHz = 20000f)
        {
            return new ModulationFrame
            {
                MediumLayer = 1f,
                LowpassHz = lowpassHz,
                Gain = 1f,
                Pan = pan
            };
        }

        /// <summary>Renders stereo after the smoothing settles. Brightness is the RMS of the sample-to-sample difference.</summary>
        static void Measure(ScrapeSynth synth, out float left, out float right, out float brightness)
        {
            var buffer = new float[BlockFrames * 2];
            for (int i = 0; i < SettleBlocks; i++)
                synth.Render(buffer, 2);

            double leftSum = 0, rightSum = 0, differenceSum = 0;
            float previous = 0f;
            int frames = 0;
            for (int block = 0; block < MeasureBlocks; block++)
            {
                synth.Render(buffer, 2);
                for (int frame = 0; frame < BlockFrames; frame++)
                {
                    float l = buffer[frame * 2];
                    float r = buffer[frame * 2 + 1];
                    leftSum += l * l;
                    rightSum += r * r;
                    differenceSum += (l - previous) * (l - previous);
                    previous = l;
                    frames++;
                }
            }

            left = Mathf.Sqrt((float)(leftSum / frames));
            right = Mathf.Sqrt((float)(rightSum / frames));
            brightness = Mathf.Sqrt((float)(differenceSum / frames));
        }

        /// <summary>Brightness relative to level, so a louder sound does not count as a brighter one.</summary>
        static float MeasureBrightness(ModulationFrame frame)
        {
            var synth = new ScrapeSynth(SampleRate);
            synth.SetTarget(frame);
            Measure(synth, out float left, out _, out float brightness);
            return brightness / left;
        }

        [Test]
        public void IsExactlySilent_WithNoGain()
        {
            var synth = new ScrapeSynth(SampleRate);
            var buffer = new float[BlockFrames * 2];
            buffer[0] = 1f;

            synth.Render(buffer, 2);

            Assert.That(buffer, Has.All.EqualTo(0f));
        }

        [Test]
        public void GainStep_RampsInsteadOfJumping()
        {
            var synth = new ScrapeSynth(SampleRate);
            synth.SetTarget(Scrape());

            // Render one frame at a time so the ramp can be read directly.
            var sample = new float[2];
            float previous = 0f;
            float largestStep = 0f;
            for (int i = 0; i < BlockFrames; i++)
            {
                synth.Render(sample, 2);
                largestStep = Mathf.Max(largestStep, Mathf.Abs(synth.SmoothedGain - previous));
                previous = synth.SmoothedGain;
            }

            Assert.Less(largestStep, 0.01f);
            Assert.Greater(synth.SmoothedGain, 0.8f);
        }

        [Test]
        public void Pan_MovesTheSoundBetweenChannels()
        {
            var hardLeft = new ScrapeSynth(SampleRate);
            hardLeft.SetTarget(Scrape(pan: -1f));
            Measure(hardLeft, out float leftOfLeft, out float rightOfLeft, out _);

            var hardRight = new ScrapeSynth(SampleRate);
            hardRight.SetTarget(Scrape(pan: 1f));
            Measure(hardRight, out float leftOfRight, out float rightOfRight, out _);

            Assert.Greater(leftOfLeft, rightOfLeft * 10f);
            Assert.Greater(rightOfRight, leftOfRight * 10f);
        }

        [Test]
        public void FastLayer_IsBrighterThanSlowLayer()
        {
            ModulationFrame slow = Scrape();
            slow.MediumLayer = 0f;
            slow.SlowLayer = 1f;
            ModulationFrame fast = Scrape();
            fast.MediumLayer = 0f;
            fast.FastLayer = 1f;

            Assert.Greater(MeasureBrightness(fast), MeasureBrightness(slow) * 1.2f);
        }

        [Test]
        public void JitteryStroke_SoundsDullerThanSteadyStroke()
        {
            var parameters = new ModulationParams();
            float steady = MeasureBrightness(Scrape(lowpassHz: parameters.FullBandHz));
            float jittery = MeasureBrightness(Scrape(lowpassHz: parameters.SteadinessLowpassHz));

            Assert.Greater(steady, jittery * 1.2f);
        }

        [Test]
        public void Body_AddsLowEndWithoutClipping()
        {
            ModulationFrame frame = Scrape();
            frame.Body = 1f;
            var synth = new ScrapeSynth(SampleRate);
            synth.SetTarget(frame);
            var buffer = new float[BlockFrames * 2];

            for (int block = 0; block < MeasureBlocks; block++)
            {
                synth.Render(buffer, 2);
                foreach (float sample in buffer)
                    Assert.Less(Mathf.Abs(sample), 1f);
            }

            Assert.Less(MeasureBrightness(frame), MeasureBrightness(Scrape()));
        }
    }
}
