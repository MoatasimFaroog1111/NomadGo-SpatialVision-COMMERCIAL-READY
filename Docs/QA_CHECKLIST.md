# NomadGo SpatialVision — QA Checklist

## Test Environment

| Item | Value |
|------|-------|
| Unity Version | 2022.3 LTS |
| Device | _________________ |
| Android Version | _________________ |
| Build Type | Debug / Release |
| Date | _________________ |
| Tester | _________________ |

---

## 1. Basic Functionality Tests

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 1.1 | App Launch | Install APK and launch | App opens without crash, AR session initializes | | |
| 1.2 | Start Scan | Press "Start Scan" button | Camera feed visible, AR tracking starts, status shows "Scanning..." | | |
| 1.3 | Stop Scan | Press "Stop Scan" during active scan | Scanning stops, session saved, status updates | | |
| 1.4 | Object Detection | Point camera at inventory items | Bounding boxes appear around detected objects | | |
| 1.5 | Count Display | Detect multiple objects | Total count and per-label counts shown in overlay | | |
| 1.6 | Session Export | Press "Export Session" | JSON file generated and saved to device storage | | |
| 1.7 | FPS Overlay | Check top-right corner during scan | FPS counter visible, color-coded (green/yellow/red) | | |
| 1.8 | Memory Monitor | Check diagnostics overlay | Memory usage displayed, no excessive growth over time | | |

---

## 2. Stacked Products Test

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 2.1 | Single Row | Align 5 items in a single horizontal row | All 5 items detected, 1 row cluster formed | | |
| 2.2 | Two Rows Stacked | Place items in 2 vertical rows | Both rows detected separately, correct count per row | | |
| 2.3 | Three Rows Stacked | Place items in 3 vertical rows | 3 row clusters formed, counts accurate | | |
| 2.4 | Max Rows (6) | Stack items in 6 rows | All 6 rows detected and counted, row_limit respected | | |
| 2.5 | Beyond Row Limit | Stack items in 7+ rows | Only top 6 rows counted, no crash or error | | |
| 2.6 | Mixed Item Types | Stack different item types (bottles, cans, boxes) | Per-label counts are correct within each row | | |
| 2.7 | Uneven Rows | Rows with different item counts | Each row's count is accurate independently | | |

---

## 3. Occlusion Test

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 3.1 | Partial Occlusion | Cover 30% of an item | Item still detected with reduced confidence | | |
| 3.2 | Half Occlusion | Cover 50% of an item | Item may or may not be detected; no false positive | | |
| 3.3 | Full Occlusion | Completely cover an item | Item not detected, count decreases correctly | | |
| 3.4 | Hand Occlusion | Pass hand over items during scan | Temporary drop in count, recovers when hand removed | | |
| 3.5 | Item Behind Item | Place item behind another item | Front item detected; rear item handled gracefully | | |
| 3.6 | Occlusion Recovery | Uncover a previously occluded item | Item re-detected, tracking ID maintains if possible | | |

---

## 4. Low Light Test

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 4.1 | Normal Lighting | Well-lit room (300+ lux) | Normal detection accuracy, 15+ FPS inference | | |
| 4.2 | Dim Lighting | Reduce to ~100 lux | Detection still works, possibly reduced confidence | | |
| 4.3 | Low Light | Reduce to ~50 lux | Some detections may be missed; no crash | | |
| 4.4 | Very Low Light | Near darkness (~10 lux) | Graceful degradation, app remains stable | | |
| 4.5 | Mixed Lighting | Spotlight on some items, shadows on others | Items in light detected; shadowed items may be missed | | |
| 4.6 | Flashlight Toggle | Use device flashlight during scan | Detection quality improves when flashlight on | | |

---

## 5. Fast Camera Movement Test

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 5.1 | Slow Pan | Move camera slowly across items (< 0.5m/s) | All items detected and tracked continuously | | |
| 5.2 | Medium Pan | Move camera at walking speed (~1m/s) | Most items detected, some frame drops acceptable | | |
| 5.3 | Fast Pan | Move camera quickly (~2m/s) | Detection may drop, recovers when camera stabilizes | | |
| 5.4 | Quick Rotation | Rotate device 90 degrees quickly | No crash, tracking recovers within 2 seconds | | |
| 5.5 | Shake Test | Shake device moderately | App remains stable, detections resume after motion stops | | |
| 5.6 | No Double Count | Pan back and forth over same items | IOU tracking prevents double counting | | |

---

## 6. Tracking Lost Recovery Test

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 6.1 | Cover Camera | Cover camera lens for 3 seconds | Tracking lost indicated, recovers when uncovered | | |
| 6.2 | Point at Sky | Point camera at featureless ceiling | Tracking may be lost, recovers when pointed at surface | | |
| 6.3 | Move to New Area | Walk to different area during scan | AR relocalization occurs, scan continues | | |
| 6.4 | Background App | Put app in background for 5 seconds, return | App resumes, AR session re-initializes if needed | | |
| 6.5 | Tracking State UI | Lose and regain tracking | Status text reflects tracking state changes | | |
| 6.6 | Count Persistence | Lose tracking, then recover | Previous counts preserved in session | | |

---

## 7. Offline / Sync Tests

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 7.1 | Airplane Mode Scan | Enable airplane mode, start scan | Scan works fully offline, data saved locally | | |
| 7.2 | Offline Session Export | Complete scan in airplane mode, export | JSON export file generated successfully | | |
| 7.3 | Offline Pulse Queue | Run scan offline for 30 seconds | Pulses queued locally (check pulse_queue.json) | | |
| 7.4 | Online Pulse Sync | Disable airplane mode after offline scan | Queued pulses sent to server with backoff retry | | |
| 7.5 | Server Unreachable | Set invalid sync URL, start scan | Pulses queued, retry with exponential backoff | | |
| 7.6 | Auto-save | Run scan for 10 seconds | Session auto-saved at 2-second intervals | | |

---

## 8. Performance Tests

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 8.1 | 5-Minute Endurance | Run continuous scan for 5 minutes | No crash, no memory leak, stable FPS | | |
| 8.2 | FPS Target | Monitor FPS during scan | Inference FPS >= 15 | | |
| 8.3 | Inference Time | Monitor inference timer overlay | Average inference < 66ms (15 FPS target) | | |
| 8.4 | Memory Stability | Watch memory monitor for 5 minutes | Memory usage does not continuously increase | | |
| 8.5 | Battery Drain | Note battery level before/after 10-min scan | Reasonable battery consumption (< 10% / 10 min) | | |

---

## 9. Data Integrity Tests

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 9.1 | Session JSON Valid | Export session, open JSON file | Valid JSON, all fields populated | | |
| 9.2 | Snapshot Timestamps | Check session snapshots | Timestamps are sequential and at ~2s intervals | | |
| 9.3 | Label Consistency | Verify countsByLabel across snapshots | Labels match model labels.txt | | |
| 9.4 | Pulse Data Match | Compare server pulses with local session | Pulse counts match session snapshot counts | | |
| 9.5 | Device ID | Check deviceId in session and pulses | Consistent device identifier across all records | | |

---

## 10. Edge Cases

| # | Test Case | Steps | Expected Result | Pass/Fail | Notes |
|---|-----------|-------|-----------------|-----------|-------|
| 10.1 | No Objects | Point camera at empty surface | Zero count displayed, no false positives | | |
| 10.2 | Very Many Objects | Point at shelf with 50+ items | App handles gracefully (may cap at max_detections) | | |
| 10.3 | Non-Target Objects | Point at people, furniture, etc. | No false detections on non-inventory items | | |
| 10.4 | Multiple Start/Stop | Rapidly start and stop scan 5 times | No crash, sessions created correctly each time | | |
| 10.5 | Config Change | Modify CONFIG.json values, rebuild | New values applied correctly on next launch | | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Dev Lead | | | |
| Product Owner | | | |
