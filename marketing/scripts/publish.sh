#!/bin/bash
# Renders the trailer and derives the README media: mp4 (web-optimised), animated GIF preview, poster.
set -e
cd "$(dirname "$0")/.."
OUT=../media
mkdir -p out $OUT
npx remotion render remotion/index.ts Trailer out/trailer_raw.mp4 --codec=h264 --crf=20 --concurrency=8
ffmpeg -y -loglevel error -i out/trailer_raw.mp4 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart -vf scale=1600:-2 $OUT/trailer.mp4
# 8s silent GIF preview of the action (logo slam + first gameplay beats).
ffmpeg -y -loglevel error -ss 4.5 -t 8 -i out/trailer_raw.mp4 -vf "fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" $OUT/trailer-preview.gif
ffmpeg -y -loglevel error -ss 5.2 -i out/trailer_raw.mp4 -frames:v 1 -q:v 3 $OUT/trailer-poster.jpg
ls -la $OUT
