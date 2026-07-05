import 'dart:async';
import 'package:flutter/material.dart';
import '../models/order.dart';
import '../utils/constants.dart';

/// A live elapsed-time indicator for an active order.
///
/// Mirrors the web frontend's `OrderTimer` component: it computes the elapsed
/// duration from [order.createdAt] and ticks every second. The timer is only
/// shown while the order is active; when the order becomes completed or
/// cancelled the widget stops ticking and renders nothing (or a frozen final
/// value via [showWhenInactive]).
class OrderTimer extends StatefulWidget {
  final Order order;
  final TextStyle? textStyle;
  final Color? color;
  final double iconSize;
  final bool showIcon;
  final bool showWhenInactive;

  const OrderTimer({
    super.key,
    required this.order,
    this.textStyle,
    this.color,
    this.iconSize = 12,
    this.showIcon = true,
    this.showWhenInactive = false,
  });

  @override
  State<OrderTimer> createState() => _OrderTimerState();
}

class _OrderTimerState extends State<OrderTimer> {
  Timer? _timer;
  late Duration _elapsed;

  @override
  void initState() {
    super.initState();
    _elapsed = _computeElapsed();
    if (widget.order.isActive) {
      _startTimer();
    }
  }

  @override
  void didUpdateWidget(covariant OrderTimer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.order.createdAt != widget.order.createdAt ||
        oldWidget.order.id != widget.order.id) {
      _elapsed = _computeElapsed();
    }
    if (widget.order.isActive) {
      if (_timer == null) {
        _startTimer();
      }
    } else {
      _stopTimer();
      _elapsed = _computeElapsed();
    }
  }

  @override
  void dispose() {
    _stopTimer();
    super.dispose();
  }

  void _startTimer() {
    _stopTimer();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _elapsed = _computeElapsed();
      });
    });
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  Duration _computeElapsed() {
    final DateTime end;
    if (widget.order.isCancelled && widget.order.cancelledAt != null) {
      end = widget.order.cancelledAt!;
    } else if (widget.order.isCompleted) {
      end = widget.order.updatedAt;
    } else {
      end = DateTime.now();
    }
    final delta = end.difference(widget.order.createdAt);
    return delta.isNegative ? Duration.zero : delta;
  }

  String _format(Duration d) {
    final hours = d.inHours;
    final minutes = d.inMinutes.remainder(60);
    final seconds = d.inSeconds.remainder(60);
    final pad = (int n) => n.toString().padLeft(2, '0');
    return '${pad(hours)}:${pad(minutes)}:${pad(seconds)}';
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.order.isActive && !widget.showWhenInactive) {
      return const SizedBox.shrink();
    }
    final color = widget.color ?? AppColors.primary;
    final style = widget.textStyle ??
        TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
        );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.showIcon) ...[
          Icon(Icons.timer_outlined, size: widget.iconSize, color: color),
          const SizedBox(width: 3),
        ],
        Text(_format(_elapsed), style: style),
      ],
    );
  }
}
