# Batting style from video

Turns a nets video (camera at the bowler's end, batter in the middle of the frame) into
`src/batting/style.json`, the crouch/lean curves the batter's body follows.

1. `extract.py video.mp4 pose.npz`: MediaPipe 0.10.14 (Python 3.12) 3D pose at 30 fps
2. `seg.py`: finds swings (hand-speed peaks)
3. `clean.py`: keeps swings with one camera angle and full tracking
4. `style.py`: median curves aligned at the swing, written to style.json
5. `overlay.py T out.jpg video.mp4`: draws the tracked skeleton on frames around time T to check it

Front-on camera means depth (down the pitch) is unreliable; only height and side-to-side
values are used.
