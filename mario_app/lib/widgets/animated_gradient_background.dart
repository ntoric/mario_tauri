import 'dart:math' as math;
import 'package:flutter/material.dart';

class AnimatedGradientBackground extends StatefulWidget {
  final Widget child;
  final Duration duration;

  const AnimatedGradientBackground({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 20),
  });

  @override
  State<AnimatedGradientBackground> createState() =>
      _AnimatedGradientBackgroundState();
}

class _AnimatedGradientBackgroundState extends State<AnimatedGradientBackground>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value * 2 * math.pi;
        final begin = Alignment(
          math.cos(t) * 0.5,
          math.sin(t) * 0.5,
        );
        final end = Alignment(
          -math.cos(t) * 0.5,
          -math.sin(t) * 0.5,
        );
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: begin,
              end: end,
              colors: const [
                Colors.white,
                Color(0xFFF0EBFF),
                Color(0xFFE8E0FF),
                Color(0xFFF5F2FF),
                Colors.white,
              ],
            ),
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}
