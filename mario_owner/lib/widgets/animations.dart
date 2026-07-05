import 'package:flutter/material.dart';
import '../utils/constants.dart';

// --- Fade-in with optional slide ---
class FadeSlideIn extends StatefulWidget {
  final Widget child;
  final Duration delay;
  final Duration duration;
  final Offset offset;
  final Curve curve;

  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = AppAnimations.medium,
    this.offset = const Offset(0, 0.15),
    this.curve = AppAnimations.defaultCurve,
  });

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.duration,
      vsync: this,
    );
    _fade = CurvedAnimation(parent: _controller, curve: widget.curve);
    _slide = Tween<Offset>(
      begin: widget.offset,
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: widget.curve));

    Future.delayed(widget.delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: widget.child,
      ),
    );
  }
}

// --- Staggered list animation ---
class StaggeredAnimation extends StatefulWidget {
  final int index;
  final Widget child;
  final Duration baseDuration;

  const StaggeredAnimation({
    super.key,
    required this.index,
    required this.child,
    this.baseDuration = AppAnimations.medium,
  });

  @override
  State<StaggeredAnimation> createState() => _StaggeredAnimationState();
}

class _StaggeredAnimationState extends State<StaggeredAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.baseDuration,
      vsync: this,
    );
    _fade = CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve));

    final delay = Duration(milliseconds: widget.index * 80);
    Future.delayed(delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: widget.child,
      ),
    );
  }
}

// --- Glassmorphism card ---
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final BorderRadius borderRadius;
  final Color? color;
  final List<BoxShadow>? shadows;
  final VoidCallback? onTap;
  final Gradient? gradient;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = const BorderRadius.all(Radius.circular(20)),
    this.color,
    this.shadows,
    this.onTap,
    this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: 1.0,
      duration: AppAnimations.fast,
      curve: AppAnimations.defaultCurve,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: borderRadius,
          child: AnimatedContainer(
            duration: AppAnimations.medium,
            curve: AppAnimations.defaultCurve,
            padding: padding,
            decoration: BoxDecoration(
              color: color ?? AppColors.light,
              borderRadius: borderRadius,
              boxShadow: shadows ?? AppColors.cardShadow,
              gradient: gradient,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

// --- Animated stat card ---
class AnimatedStatCard extends StatefulWidget {
  final String title;
  final String value;
  final IconData icon;
  final Gradient gradient;
  final Duration delay;

  const AnimatedStatCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.gradient,
    this.delay = Duration.zero,
  });

  @override
  State<AnimatedStatCard> createState() => _AnimatedStatCardState();
}

class _AnimatedStatCardState extends State<AnimatedStatCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AppAnimations.slow,
      vsync: this,
    );
    _scale = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: AppAnimations.entryCurve),
    );
    _fade = CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve);

    Future.delayed(widget.delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: ScaleTransition(
        scale: _scale,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: widget.gradient,
            boxShadow: [
              BoxShadow(
                color: widget.gradient.colors.first.withValues(alpha: 0.3),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(widget.icon, color: Colors.white, size: 24),
                ),
                const SizedBox(height: 14),
                Text(
                  widget.value,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.title,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withValues(alpha: 0.8),
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// --- Shimmer loading ---
class ShimmerBox extends StatefulWidget {
  final double width;
  final double height;
  final BorderRadius borderRadius;

  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = const BorderRadius.all(Radius.circular(12)),
  });

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
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
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius,
            gradient: LinearGradient(
              begin: Alignment(-1 + _controller.value * 2, 0),
              end: Alignment(1 + _controller.value * 2, 0),
              colors: [
                AppColors.gray200,
                AppColors.gray100,
                AppColors.gray200,
              ],
            ),
          ),
        );
      },
    );
  }
}

// --- Animated progress bar ---
class AnimatedProgress extends StatefulWidget {
  final double value;
  final Color color;
  final double height;

  const AnimatedProgress({
    super.key,
    required this.value,
    this.color = AppColors.primary,
    this.height = 8,
  });

  @override
  State<AnimatedProgress> createState() => _AnimatedProgressState();
}

class _AnimatedProgressState extends State<AnimatedProgress>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _progress;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AppAnimations.slow,
      vsync: this,
    );
    _progress = Tween<double>(begin: 0, end: widget.value).animate(
      CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve),
    );
    Future.delayed(const Duration(milliseconds: 100), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void didUpdateWidget(AnimatedProgress oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _progress = Tween<double>(begin: _progress.value, end: widget.value).animate(
        CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve),
      );
      _controller
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _progress,
      builder: (context, child) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(widget.height / 2),
          child: LinearProgressIndicator(
            value: _progress.value,
            backgroundColor: AppColors.gray200,
            valueColor: AlwaysStoppedAnimation<Color>(widget.color),
            minHeight: widget.height,
          ),
        );
      },
    );
  }
}

// --- Page transition wrapper ---
class AnimatedPage extends StatefulWidget {
  final Widget child;
  final int keyId;

  const AnimatedPage({
    super.key,
    required this.child,
    required this.keyId,
  });

  @override
  State<AnimatedPage> createState() => _AnimatedPageState();
}

class _AnimatedPageState extends State<AnimatedPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AppAnimations.medium,
      vsync: this,
    );
    _fade = CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.05),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: AppAnimations.defaultCurve));

    _controller.forward();
  }

  @override
  void didUpdateWidget(AnimatedPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.keyId != widget.keyId) {
      _controller
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: widget.child,
      ),
    );
  }
}
