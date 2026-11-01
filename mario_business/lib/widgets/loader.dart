import 'package:flutter/material.dart';

import 'common.dart';

/// Loads data for a screen and rebuilds when [depsKey] changes (store or
/// period switch). The builder must return a scrollable so pull-to-refresh
/// works; refresh bypasses the repository cache.
class Loader<T> extends StatefulWidget {
  const Loader({
    super.key,
    required this.depsKey,
    required this.load,
    required this.builder,
    this.skeleton,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 32),
  });

  final Object depsKey;
  final Future<T> Function(bool force) load;
  final Widget Function(BuildContext context, T data) builder;
  final Widget? skeleton;
  final EdgeInsets padding;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;
  int _req = 0;

  @override
  void initState() {
    super.initState();
    _fetch(false);
  }

  @override
  void didUpdateWidget(covariant Loader<T> old) {
    super.didUpdateWidget(old);
    if (old.depsKey != widget.depsKey) {
      _data = null;
      _fetch(false);
    }
  }

  Future<void> _fetch(bool force) async {
    final id = ++_req;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await widget.load(force);
      if (!mounted || id != _req) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || id != _req) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final Widget child;
    if (_data != null && _error == null) {
      child = widget.builder(context, _data as T);
    } else if (_error != null) {
      child = ListView(
        padding: widget.padding,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 60),
          ErrorState(error: _error!, onRetry: () => _fetch(true)),
        ],
      );
    } else {
      child = IgnorePointer(
        child: ListView(
          padding: widget.padding,
          physics: const NeverScrollableScrollPhysics(),
          children: [widget.skeleton ?? const DefaultSkeleton()],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _fetch(true),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: KeyedSubtree(
          key: ValueKey(_data != null ? 'data' : (_error != null ? 'error' : (_loading ? 'loading' : 'idle'))),
          child: child,
        ),
      ),
    );
  }
}
