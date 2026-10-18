import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mario_app/utils/constants.dart';

void main() {
  for (final isDark in [false, true]) {
    testWidgets('popup menu item text in ${isDark ? "dark" : "light"} mode',
        (tester) async {
      AppColors.apply(AppThemeOptions.defaultOption);
      AppColors.setDarkMode(isDark);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightThemeFor(AppThemeOptions.defaultOption),
          darkTheme: AppTheme.darkThemeFor(AppThemeOptions.defaultOption),
          themeMode: isDark ? ThemeMode.dark : ThemeMode.light,
          home: Scaffold(
            appBar: AppBar(
              actions: [
                PopupMenuButton<String>(
                  color: AppColors.gray100,
                  itemBuilder: (_) => [
                    PopupMenuItem<String>(
                      value: 'x',
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Store A',
                              style: const TextStyle(
                                fontWeight: FontWeight.normal,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();

      final text = tester.widget<Text>(find.text('Store A'));
      final ctx = tester.element(find.text('Store A'));
      debugPrint('MODE ${isDark ? "dark" : "light"}: '
          'explicit=${text.style?.color} '
          'defaultText=${DefaultTextStyle.of(ctx).style.color} '
          'listTileTheme.title=${Theme.of(ctx).listTileTheme.titleTextStyle?.color} '
          'textTheme.titleMedium=${Theme.of(ctx).textTheme.titleMedium?.color} '
          'bodyMedium=${Theme.of(ctx).textTheme.bodyMedium?.color}');
    });
  }
}
