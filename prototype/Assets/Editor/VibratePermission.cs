using System.IO;
using UnityEditor.Android;

namespace SmallRepairs.Editor
{
    /// <summary>
    /// Adds the permission VibrationEffect needs, which the generated Android manifest doesn't otherwise declare for the haptics.
    /// </summary>
    sealed class VibratePermission : IPostGenerateGradleAndroidProject
    {
        const string Permission = "android.permission.VIBRATE";

        public int callbackOrder => 0;

        public void OnPostGenerateGradleAndroidProject(string path)
        {
            string manifestPath = Path.Combine(path, "src", "main", "AndroidManifest.xml");
            string manifest = File.ReadAllText(manifestPath);
            if (manifest.Contains(Permission))
                return;

            string entry = $"<uses-permission android:name=\"{Permission}\" />\n  <application";
            File.WriteAllText(manifestPath, manifest.Replace("<application", entry));
        }
    }
}
