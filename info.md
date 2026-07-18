# BLOOMIN8 Canvas Uploader

Pick an image, crop-to-content, adjust saturation / gamma / contrast with a live
preview, and push it to a BLOOMIN8 E-Ink Canvas panel — all from your dashboard.

Battery-friendly: panels are never polled for previews (cached locally, refreshed
on upload or on demand).

```yaml
type: custom:bloomin8-canvas-card
title: E-Ink Uploader
panels:
  - entity: media_player.canvas1_media_player
    name: Canvas1
  - entity: media_player.canvas2_media_player
    name: Canvas2
```

See the [README](https://github.com/teras/bloomin8-canvas-card) for all options.
