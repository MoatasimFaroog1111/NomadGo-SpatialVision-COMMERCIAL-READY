using System;
using System.IO;
using UnityEngine;

namespace NomadGo.Storage
{
    public class JSONStorageProvider : MonoBehaviour
    {
        private string basePath;

        public void Initialize(string exportPath)
        {
            basePath = Path.Combine(Application.persistentDataPath, exportPath);
            if (!Directory.Exists(basePath))
            {
                Directory.CreateDirectory(basePath);
            }
            Debug.Log($"[JSONStorage] Storage path: {basePath}");
        }

        public void SaveSession(SessionData session)
        {
            if (session == null)
            {
                Debug.LogWarning("[JSONStorage] Cannot save null session.");
                return;
            }

            string fileName = $"session_{session.sessionId}.json";
            string filePath = Path.Combine(basePath, fileName);

            try
            {
                string json = JsonUtility.ToJson(session, true);
                File.WriteAllText(filePath, json);
                Debug.Log($"[JSONStorage] Session saved: {filePath}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[JSONStorage] Failed to save session: {ex.Message}");
            }
        }

        public SessionData LoadSession(string sessionId)
        {
            string fileName = $"session_{sessionId}.json";
            string filePath = Path.Combine(basePath, fileName);

            if (!File.Exists(filePath))
            {
                Debug.LogWarning($"[JSONStorage] Session file not found: {filePath}");
                return null;
            }

            try
            {
                string json = File.ReadAllText(filePath);
                SessionData session = JsonUtility.FromJson<SessionData>(json);
                Debug.Log($"[JSONStorage] Session loaded: {sessionId}");
                return session;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[JSONStorage] Failed to load session: {ex.Message}");
                return null;
            }
        }

        public string[] ListSessions()
        {
            if (!Directory.Exists(basePath))
            {
                return new string[0];
            }

            string[] files = Directory.GetFiles(basePath, "session_*.json");
            string[] sessionIds = new string[files.Length];

            for (int i = 0; i < files.Length; i++)
            {
                string name = Path.GetFileNameWithoutExtension(files[i]);
                sessionIds[i] = name.Replace("session_", "");
            }

            return sessionIds;
        }

        public bool DeleteSession(string sessionId)
        {
            string fileName = $"session_{sessionId}.json";
            string filePath = Path.Combine(basePath, fileName);

            if (!File.Exists(filePath))
            {
                return false;
            }

            try
            {
                File.Delete(filePath);
                Debug.Log($"[JSONStorage] Session deleted: {sessionId}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[JSONStorage] Failed to delete session: {ex.Message}");
                return false;
            }
        }

        public string ExportSession(SessionData session)
        {
            string exportDir = Path.Combine(basePath, "exports");
            if (!Directory.Exists(exportDir))
            {
                Directory.CreateDirectory(exportDir);
            }

            string timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            string fileName = $"export_{session.sessionId}_{timestamp}.json";
            string filePath = Path.Combine(exportDir, fileName);

            try
            {
                string json = JsonUtility.ToJson(session, true);
                File.WriteAllText(filePath, json);
                Debug.Log($"[JSONStorage] Session exported: {filePath}");
                return filePath;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[JSONStorage] Failed to export session: {ex.Message}");
                return null;
            }
        }
    }
}
