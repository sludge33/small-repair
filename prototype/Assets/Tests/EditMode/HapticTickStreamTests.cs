using NUnit.Framework;
using SmallRepairs.Haptics;

namespace SmallRepairs.Tests
{
    public class HapticTickStreamTests
    {
        const float FrameTime = 1f / 120f;

        static int CountTicks(HapticTickStream stream, float rate, float seconds)
        {
            int ticks = 0;
            int frames = (int)(seconds / FrameTime);
            for (int i = 0; i < frames; i++)
            {
                if (stream.Step(rate, FrameTime))
                    ticks++;
            }
            return ticks;
        }

        [Test]
        public void FiresAtTheRequestedRate()
        {
            Assert.AreEqual(45, CountTicks(new HapticTickStream(), 45f, 1f), 1);
            Assert.AreEqual(5, CountTicks(new HapticTickStream(), 5f, 1f), 1);
        }

        [Test]
        public void ZeroRate_FiresNothing()
        {
            Assert.AreEqual(0, CountTicks(new HapticTickStream(), 0f, 1f));
        }

        [Test]
        public void Stopping_ClearsThePhase()
        {
            var stream = new HapticTickStream();
            Assert.IsFalse(stream.Step(45f, 0.02f));

            stream.Step(0f, FrameTime);

            Assert.IsFalse(stream.Step(45f, 0.02f));
        }

        [Test]
        public void SlowFrame_FiresOneTickInsteadOfABurst()
        {
            var stream = new HapticTickStream();

            Assert.IsTrue(stream.Step(45f, 0.5f));
            Assert.IsFalse(stream.Step(45f, 0.001f));
        }
    }
}
