import sys, cv2, numpy as np, mediapipe as mp
src, out = sys.argv[1], sys.argv[2]
import subprocess
WW, HH = 800, 860
proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'fps=30,crop={WW}:{HH}:560:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
pose = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=1, smooth_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
X0, Y0, X1, Y1 = 560, 0, 1360, 860  # the batter's crease area
W, I, V, T = [], [], [], []
i = 0
while True:
    buf = proc.stdout.read(WW * HH * 3)
    if len(buf) < WW * HH * 3: break
    if True:
        crop = np.frombuffer(buf, np.uint8).reshape(HH, WW, 3)
        r = pose.process(crop)
        if r.pose_world_landmarks:
            W.append([[l.x, l.y, l.z] for l in r.pose_world_landmarks.landmark])
            I.append([[l.x, l.y] for l in r.pose_landmarks.landmark])
            V.append([l.visibility for l in r.pose_landmarks.landmark])
        else:
            W.append(np.full((33, 3), np.nan)); I.append(np.full((33, 2), np.nan)); V.append(np.zeros(33))
        T.append(i / 30)
    i += 1
np.savez_compressed(out, world=np.array(W, dtype=np.float32), img=np.array(I, dtype=np.float32), vis=np.array(V, dtype=np.float32), t=np.array(T, dtype=np.float32))
print('frames', len(T), 'detected', int(np.sum(~np.isnan(np.array(W)[:, 0, 0]))))
