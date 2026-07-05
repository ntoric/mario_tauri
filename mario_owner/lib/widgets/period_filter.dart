import 'package:flutter/material.dart';
import '../utils/constants.dart';

enum PeriodFilter { today, week, month, all }

extension PeriodFilterExt on PeriodFilter {
  String get label {
    switch (this) {
      case PeriodFilter.today:
        return 'Today';
      case PeriodFilter.week:
        return '7 Days';
      case PeriodFilter.month:
        return '30 Days';
      case PeriodFilter.all:
        return 'All Time';
    }
  }

  DateTime? get startDate {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    switch (this) {
      case PeriodFilter.today:
        return today;
      case PeriodFilter.week:
        return today.subtract(const Duration(days: 6));
      case PeriodFilter.month:
        return today.subtract(const Duration(days: 29));
      case PeriodFilter.all:
        return null;
    }
  }
}

class PeriodFilterBar extends StatelessWidget {
  final PeriodFilter selected;
  final ValueChanged<PeriodFilter> onChanged;

  const PeriodFilterBar({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: PeriodFilter.values.map((p) {
            final isSelected = p == selected;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: AnimatedContainer(
                duration: AppAnimations.fast,
                curve: AppAnimations.defaultCurve,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primary : AppColors.gray100,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.transparent),
                  boxShadow: [
                    BoxShadow(
                      color: isSelected
                          ? AppColors.primary.withOpacity(0.4)
                          : AppColors.dark.withOpacity(0.15),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: GestureDetector(
                  onTap: () => onChanged(p),
                  child: Text(
                    p.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                      color: isSelected ? Colors.white : AppColors.primary,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
