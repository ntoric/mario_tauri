import 'package:flutter/material.dart';

class AnimatedGradientBackground extends StatelessWidget {
  final Widget child;
  final Duration duration;

  const AnimatedGradientBackground({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 20),
  });

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: child,
    );
  }
}
