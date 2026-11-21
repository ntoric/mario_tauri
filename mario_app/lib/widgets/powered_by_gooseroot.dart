import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../utils/constants.dart';

/// "Powered by Gooseroot" brand mark — the kit's gradient wordmark on light
/// surfaces and the white wordmark on dark ones.
class PoweredByGooseroot extends StatelessWidget {
  final double logoHeight;
  final bool showLabel;

  const PoweredByGooseroot({
    super.key,
    this.logoHeight = 13,
    this.showLabel = true,
  });

  @override
  Widget build(BuildContext context) {
    final wordmark = AppColors.isDark
        ? 'assets/brand/gooseroot-wordmark-white.svg'
        : 'assets/brand/gooseroot-wordmark.svg';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showLabel)
          Text(
            'Powered by',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.muted,
            ),
          ),
        if (showLabel) const SizedBox(width: 6),
        SvgPicture.asset(
          wordmark,
          height: logoHeight,
        ),
      ],
    );
  }
}
