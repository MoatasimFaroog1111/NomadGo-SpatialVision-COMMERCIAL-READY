using UnityEditor;
using UnityEditor.Build.Reporting;
using System.IO;

public class BuildScript
{
    public static void BuildAndroid()
    {
        string buildOutputDir = System.Environment.GetEnvironmentVariable("BUILD_OUTPUT_DIR") ?? "build/Android";
        
        // Ensure output directory exists
        if (!Directory.Exists(buildOutputDir))
        {
            Directory.CreateDirectory(buildOutputDir);
        }

        string[] scenes = EditorBuildSettingsScene.GetActiveScenes();
        
        BuildPlayerOptions buildPlayerOptions = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = Path.Combine(buildOutputDir, "game.apk"),
            target = BuildTarget.Android,
            options = BuildOptions.None
        };

        BuildReport report = BuildPipeline.BuildPlayer(buildPlayerOptions);
        
        if (report.summary.result != BuildResult.Succeeded)
        {
            throw new System.Exception("Android build failed!");
        }
    }
}
