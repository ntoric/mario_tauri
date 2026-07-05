import 'package:flutter/material.dart';
import '../utils/constants.dart';

class AppBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;

  const AppBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  static const _navItems = [
    {'icon': Icons.dashboard_outlined, 'activeIcon': Icons.dashboard_rounded, 'label': 'Dashboard'},
    {'icon': Icons.bar_chart_outlined, 'activeIcon': Icons.bar_chart_rounded, 'label': 'Sales'},
    {'icon': Icons.assessment_outlined, 'activeIcon': Icons.assessment_rounded, 'label': 'Reports'},
    {'icon': Icons.receipt_outlined, 'activeIcon': Icons.receipt_rounded, 'label': 'Orders'},
    {'icon': Icons.settings_outlined, 'activeIcon': Icons.settings_rounded, 'label': 'Settings'},
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.light,
        border: Border(
          top: BorderSide(color: AppColors.gray200, width: 1),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: List.generate(_navItems.length, (index) {
            final isSelected = currentIndex == index;
            final item = _navItems[index];
            return GestureDetector(
              onTap: () => onTap(index),
              child: AnimatedContainer(
                duration: AppAnimations.fast,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primaryExtraLight : Colors.transparent,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isSelected ? item['activeIcon'] as IconData : item['icon'] as IconData,
                      color: isSelected ? AppColors.primary : AppColors.gray400,
                      size: 24,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item['label'] as String,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? AppColors.primary : AppColors.gray400,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
