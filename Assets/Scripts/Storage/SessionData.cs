using System;
using System.Collections.Generic;

namespace NomadGo.Storage
{
    [Serializable]
    public class SessionData
    {
        public string sessionId;
        public string startTime;
        public string endTime;
        public string deviceId;
        public int totalItemsCounted;
        public List<SessionSnapshot> snapshots = new List<SessionSnapshot>();
        public List<SessionEvent> events = new List<SessionEvent>();
    }

    [Serializable]
    public class SessionSnapshot
    {
        public string timestamp;
        public int totalCount;
        public List<LabelCount> countsByLabel = new List<LabelCount>();
        public int rowCount;
        public int activeTrackCount;
        public float inferenceTimeMs;
        public float fps;
    }

    [Serializable]
    public class LabelCount
    {
        public string label;
        public int count;
    }

    [Serializable]
    public class SessionEvent
    {
        public string timestamp;
        public string eventType;
        public string details;
    }

    [Serializable]
    public class SessionDataList
    {
        public List<SessionData> sessions = new List<SessionData>();
    }
}
