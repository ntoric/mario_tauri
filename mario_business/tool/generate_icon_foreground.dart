// Generates assets/icon/foreground.png (Android adaptive icon foreground)
// from assets/images/logo.png by extracting the white artwork onto a
// transparent canvas sized to fit the adaptive icon safe zone.
//
// Run: dart run tool/generate_icon_foreground.dart
// Then: dart run flutter_launcher_icons

import 'dart:io';
import 'dart:math';
import 'package:image/image.dart' as img;

void main() {
  final logo =
      img.decodePng(File('assets/images/logo.png').readAsBytesSync())!;

  // Sample background color from a corner pixel.
  final bg = logo.getPixel(4, 4);
  final bgR = bg.r.toDouble(), bgG = bg.g.toDouble(), bgB = bg.b.toDouble();
  String hex(double v) =>
      v.round().toRadixString(16).padLeft(2, '0').toUpperCase();
  print('background: #${hex(bgR)}${hex(bgG)}${hex(bgB)}');

  // Extract white artwork: alpha estimated per channel as
  // (channel - bg) / (255 - bg), taking the max across channels.
  final w = logo.width, h = logo.height;
  final art = img.Image(width: w, height: h, numChannels: 4);
  var minX = w, minY = h, maxX = -1, maxY = -1;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final p = logo.getPixel(x, y);
      // A blend toward white raises all channels together; background
      // texture noise shifts only one. Taking the min per-channel
      // estimate keeps the artwork and rejects the noise.
      var a = 1.0;
      for (final pair in [
        [p.r.toDouble(), bgR],
        [p.g.toDouble(), bgG],
        [p.b.toDouble(), bgB],
      ]) {
        final denom = 255.0 - pair[1];
        if (denom > 0) {
          a = min(a, (pair[0] - pair[1]) / denom);
        }
      }
      a = ((a - 0.15) / 0.85).clamp(0.0, 1.0);
      art.setPixelRgba(x, y, 255, 255, 255, (a * 255).round());
      if (a > 0.05) {
        minX = min(minX, x);
        minY = min(minY, y);
        maxX = max(maxX, x);
        maxY = max(maxY, y);
      }
    }
  }
  if (maxX < 0) {
    stderr.writeln('no artwork found');
    exit(1);
  }

  final cropped = img.copyCrop(art,
      x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1);
  print('art bounds: ${cropped.width}x${cropped.height}');

  // Scale so the art's bounding-box corners fit inside the adaptive icon
  // safe zone (a centered circle of ~62% diameter on a 1024px canvas).
  const canvas = 1024;
  const safeRadius = canvas * 0.31;
  final halfW = cropped.width / 2, halfH = cropped.height / 2;
  final cornerDist = sqrt(halfW * halfW + halfH * halfH);
  final scale = safeRadius / cornerDist;
  final newW = (cropped.width * scale).round();
  final newH = (cropped.height * scale).round();
  final resized =
      img.copyResize(cropped, width: newW, height: newH);

  final fg = img.Image(width: canvas, height: canvas, numChannels: 4);
  img.compositeImage(fg, resized,
      dstX: (canvas - newW) ~/ 2, dstY: (canvas - newH) ~/ 2);

  File('assets/icon/foreground.png')
      .writeAsBytesSync(img.encodePng(fg));
  print('wrote assets/icon/foreground.png '
      '(art ${newW}x$newH centered on ${canvas}x$canvas)');
}
