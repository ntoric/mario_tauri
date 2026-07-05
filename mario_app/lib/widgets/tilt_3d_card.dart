import 'package:flutter/material.dart';

/// Wraps a card with a press-responsive 3D perspective tilt.
///
/// At rest the card lies flat. On pointer down it animates into a slight
/// rotateX/rotateY tilt with a small scale-down and a deeper drop shadow,
/// giving the card a tangible 3D pop. On release it springs back.
class Tilt3DCard extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final double tilt;
  final double scaleDown;

  const Tilt3DCard({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 110),
    this.tilt = 0.12,
    this.scaleDown = 0.04,
  });

  @override
  State<Tilt3DCard> createState() => _Tilt3DCardState();
}

class _Tilt3DCardState extends State<Tilt3DCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );
    _anim = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Matrix4 _matrix(double t) {
    final tilt = widget.tilt * t;
    final scale = 1.0 - widget.scaleDown * t;
    return Matrix4.identity()
      ..setEntry(3, 2, 0.0018) // perspective
      ..rotateX(tilt)
      ..rotateY(-tilt)
      // ignore: deprecated_member_use
      ..scale(scale);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _controller.forward(),
      onPointerUp: (_) => _controller.reverse(),
      onPointerCancel: (_) => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _anim,
        builder: (context, child) {
          return Transform(
            transform: _matrix(_anim.value),
            alignment: Alignment.center,
            filterQuality: FilterQuality.low,
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}
