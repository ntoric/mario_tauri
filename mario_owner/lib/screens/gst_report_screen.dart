import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../backend/backend_service.dart';
import '../providers/auth_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/bill_detail_sheet.dart';
import '../widgets/period_filter.dart';
import '../widgets/store_picker_button.dart';

class GstReportScreen extends StatefulWidget {
  const GstReportScreen({super.key});

  @override
  State<GstReportScreen> createState() => _GstReportScreenState();
}

class _GstReportScreenState extends State<GstReportScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  PeriodFilter _period = PeriodFilter.month;

  Map<String, dynamic>? _summary;
  bool _summaryLoading = false;
  String? _summaryError;

  Map<String, dynamic>? _gstr1;
  bool _gstr1Loading = false;
  String? _gstr1Error;

  Map<String, dynamic>? _register;
  bool _registerLoading = false;
  String? _registerError;
  int _regPage = 1;
  static const int _regPageSize = 20;
  final TextEditingController _searchController = TextEditingController();
  String _search = '';

  String? get _storeId => context.read<AuthProvider>().currentStore?.id;
  DateTime? get _startDate => _period.startDate;
  DateTime get _endDate => DateTime.now();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (mounted && !_tabController.indexIsChanging) {
        setState(() {});
        _ensureTabLoaded(_tabController.index);
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _ensureTabLoaded(0));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _ensureTabLoaded(int index) {
    switch (index) {
      case 0:
        if (_summary == null && !_summaryLoading) _loadSummary();
        break;
      case 1:
        if (_gstr1 == null && !_gstr1Loading) _loadGstr1();
        break;
      case 2:
        if (_register == null && !_registerLoading) _loadRegister();
        break;
    }
  }

  void _onPeriodChanged(PeriodFilter p) {
    setState(() {
      _period = p;
      _summary = null;
      _gstr1 = null;
      _register = null;
      _regPage = 1;
    });
    _ensureTabLoaded(_tabController.index);
  }

  Future<void> _loadSummary() async {
    final storeId = _storeId;
    if (storeId == null) return;
    setState(() {
      _summaryLoading = true;
      _summaryError = null;
    });
    try {
      final data = await BackendService().api.getGstSummary(
            storeId,
            startDate: _startDate,
            endDate: _endDate,
          );
      if (mounted) {
        setState(() {
          _summary = data;
          _summaryLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _summaryError = e.toString();
          _summaryLoading = false;
        });
      }
    }
  }

  Future<void> _loadGstr1() async {
    final storeId = _storeId;
    if (storeId == null) return;
    setState(() {
      _gstr1Loading = true;
      _gstr1Error = null;
    });
    try {
      final data = await BackendService().api.getGstr1(
            storeId,
            startDate: _startDate,
            endDate: _endDate,
          );
      if (mounted) {
        setState(() {
          _gstr1 = data;
          _gstr1Loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _gstr1Error = e.toString();
          _gstr1Loading = false;
        });
      }
    }
  }

  Future<void> _loadRegister({int? page}) async {
    final storeId = _storeId;
    if (storeId == null) return;
    setState(() {
      _registerLoading = true;
      _registerError = null;
      if (page != null) _regPage = page;
    });
    try {
      final data = await BackendService().api.getGstSalesRegister(
            storeId,
            startDate: _startDate,
            endDate: _endDate,
            page: _regPage,
            pageSize: _regPageSize,
            search: _search.isEmpty ? null : _search,
          );
      if (mounted) {
        setState(() {
          _register = data;
          _registerLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _registerError = e.toString();
          _registerLoading = false;
        });
      }
    }
  }

  Future<void> _openBill(String billId) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
    );
    try {
      final bill = await BackendService().api.getBill(billId);
      if (!mounted) return;
      Navigator.pop(context); // dismiss loader
      await showBillDetailSheet(context, bill);
    } catch (e) {
      if (!mounted) return;
      Navigator.pop(context); // dismiss loader
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load bill: $e')),
      );
    }
  }

  // ---- Parsing helpers (defensive: everything may be missing) ----

  static double _num(dynamic v) =>
      v is num ? v.toDouble() : double.tryParse('$v') ?? 0.0;

  static int _int(dynamic v) => v is int
      ? v
      : v is num
          ? v.toInt()
          : int.tryParse('$v') ?? 0;

  static Map<String, dynamic> _map(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

  static List<Map<String, dynamic>> _list(dynamic v) => v is List
      ? v
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList()
      : <Map<String, dynamic>>[];

  static String _money(dynamic v) => '\u20B9${_num(v).toStringAsFixed(2)}';

  static String _dateStr(dynamic v) {
    final s = v?.toString() ?? '';
    return s.length > 10 ? s.substring(0, 10) : s;
  }

  // ---- Build ----

  @override
  Widget build(BuildContext context) {
    final taxOn = context.watch<AuthProvider>().currentStore?.taxEnabled ?? false;
    if (!taxOn) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('GST Reports')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Tax is turned off for this store. Turn it on in the desktop app (Business Settings → Tax) to use GST reports.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.gray500),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('GST Reports'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          StorePickerButton(onStoreChanged: () {
            setState(() {
              _summary = null;
              _gstr1 = null;
              _register = null;
              _regPage = 1;
            });
            _ensureTabLoaded(_tabController.index);
          }),
        ],
      ),
      body: Column(
        children: [
          PeriodFilterBar(
            selected: _period,
            onChanged: _onPeriodChanged,
          ),
          _buildTabBar(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildSummaryTab(),
                _buildGstr1Tab(),
                _buildRegisterTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    final tabs = ['Summary', 'GSTR-1', 'Register'];
    final icons = [
      Icons.summarize_rounded,
      Icons.description_rounded,
      Icons.receipt_long_rounded,
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppColors.gray200, width: 1),
        ),
        child: Row(
          children: List.generate(tabs.length, (index) {
            final isSelected = _tabController.index == index;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  _tabController.animateTo(index);
                  setState(() {});
                  _ensureTabLoaded(index);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    gradient: isSelected ? AppColors.primaryGradient : null,
                    color: isSelected ? null : Colors.transparent,
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color:
                                  AppColors.primary.withValues(alpha: 0.35),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        icons[index],
                        size: 16,
                        color:
                            isSelected ? Colors.white : AppColors.gray500,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        tabs[index],
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: isSelected
                              ? Colors.white
                              : AppColors.gray500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  // ---- Shared small widgets ----

  Widget _card({required Widget child, EdgeInsets padding = const EdgeInsets.all(16)}) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: padding,
      child: child,
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: AppColors.gray500,
          letterSpacing: 1,
        ),
      ),
    );
  }

  Widget _warningBanner(String text) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.warning.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.warning.withValues(alpha: 0.5)),
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.warningDark,
          ),
        ),
      );

  Widget _legacyBanner(int count) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded,
              size: 18, color: AppColors.warningDark),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$count older bill${count == 1 ? '' : 's'} excluded (pre-GST records)',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.warningDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _loading() => const Padding(
        padding: EdgeInsets.only(top: 80),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );

  Widget _errorView(String error, Future<void> Function() retry) {
    return _card(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: AppColors.danger, size: 32),
          const SizedBox(height: 10),
          Text(
            error,
            style: const TextStyle(color: AppColors.gray600, fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          TextButton(onPressed: retry, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _statCard(String title, String value, IconData icon, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.dark,
              letterSpacing: -0.5,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            title,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.gray500,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _kvRow(String label, String value,
      {bool bold = false, Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
                color: bold ? AppColors.dark : AppColors.gray600,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: valueColor ?? AppColors.dark,
            ),
          ),
        ],
      ),
    );
  }

  Widget _dataTable(List<String> headers, List<List<String>> rows) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 34,
        dataRowMinHeight: 34,
        dataRowMaxHeight: 40,
        horizontalMargin: 8,
        columnSpacing: 18,
        headingTextStyle: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.gray500,
          letterSpacing: 0.4,
        ),
        dataTextStyle: const TextStyle(fontSize: 12, color: AppColors.dark),
        columns:
            headers.map((h) => DataColumn(label: Text(h))).toList(),
        rows: rows
            .map((r) =>
                DataRow(cells: r.map((c) => DataCell(Text(c))).toList()))
            .toList(),
      ),
    );
  }

  Widget _expandableSection(String title, int count, Widget child) {
    return _card(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        shape: const Border(),
        tilePadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Text(
          title,
          style: const TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.primaryExtraLight,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            '$count',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
          ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: child,
          ),
        ],
      ),
    );
  }

  // ================= Summary tab =================

  Widget _buildSummaryTab() {
    if (_summaryLoading && _summary == null) {
      return _loading();
    }
    if (_summaryError != null && _summary == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [_errorView(_summaryError!, _loadSummary)],
      );
    }
    final s = _summary;
    if (s == null) {
      return const Center(
          child: Text('No data', style: TextStyle(color: AppColors.gray500)));
    }

    final invoices = _map(s['invoices']);
    final creditNotes = _map(s['creditNotes']);
    final net = _map(s['net']);
    final gstr3b = _map(s['gstr3b']);
    final outward = _map(gstr3b['outwardTaxable']);
    final nilExempt = _map(gstr3b['nilExempt']);
    final nonGst = _map(gstr3b['nonGst']);
    final eco = _map(gstr3b['ecoSupplies']);
    final rateWise = _list(s['rateWise']);
    final composition = s['composition'] == null ? null : _map(s['composition']);
    final legacy = _int(s['legacyBillsExcluded']);
    final regType = (s['registrationType'] ?? 'regular').toString();

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadSummary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          _legacyBanner(legacy),
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primaryExtraLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  regType.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _period.label,
                style:
                    const TextStyle(fontSize: 12, color: AppColors.gray500),
              ),
            ],
          ),
          const SizedBox(height: 16),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: ResponsiveHelper.isTablet(context) ? 4 : 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              _statCard('Invoices', '${_int(invoices['count'])}',
                  Icons.receipt_rounded, AppColors.primary),
              _statCard('Invoice Value', _money(invoices['invoiceValue']),
                  Icons.currency_rupee_rounded, AppColors.success),
              _statCard('Tax Collected', _money(invoices['totalTax']),
                  Icons.percent_rounded, AppColors.info),
              _statCard('Credit Notes', '${_int(creditNotes['count'])}',
                  Icons.assignment_return_rounded, AppColors.warningDark),
            ],
          ),
          if (_int(invoices['cancelledCount']) > 0)
            _card(
              child: _kvRow('Cancelled Invoices',
                  '${_int(invoices['cancelledCount'])}',
                  valueColor: AppColors.danger),
            ),
          _sectionTitle('Net Totals (Invoices - Credit Notes)'),
          _card(
            child: Column(
              children: [
                _kvRow('Taxable Value', _money(net['taxableValue'])),
                _kvRow('CGST', _money(net['cgst'])),
                _kvRow('SGST', _money(net['sgst'])),
                _kvRow('IGST', _money(net['igst'])),
                _kvRow('Cess', _money(net['cess'])),
                const Divider(height: 20),
                _kvRow('Total Tax', _money(net['totalTax']), bold: true),
              ],
            ),
          ),
          _sectionTitle('GSTR-3B Outward Supplies'),
          _card(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: _dataTable(
              ['Section', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
              [
                [
                  '3.1(a) Outward',
                  _money(outward['taxableValue']),
                  _money(outward['igst']),
                  _money(outward['cgst']),
                  _money(outward['sgst']),
                  _money(outward['cess']),
                ],
                ['3.1(c) Nil/Exempt', _money(nilExempt['taxableValue']), '-', '-', '-', '-'],
                ['3.1(e) Non-GST', _money(nonGst['taxableValue']), '-', '-', '-', '-'],
                ['3.1.1(ii) E-comm', _money(eco['taxableValue']), '-', '-', '-', '-'],
              ],
            ),
          ),
          _sectionTitle('Rate-wise Breakup'),
          if (rateWise.isEmpty)
            _card(
                child: const Text('No rate-wise data',
                    style: TextStyle(color: AppColors.gray500)))
          else
            _card(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: _dataTable(
                ['Rate', 'B2B', 'B2C', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess'],
                rateWise
                    .map((r) => [
                          '${_num(r['rate']).toStringAsFixed(0)}%',
                          _money(r['b2bTaxable']),
                          _money(r['b2cTaxable']),
                          _money(r['taxableValue']),
                          _money(r['cgst']),
                          _money(r['sgst']),
                          _money(r['igst']),
                          _money(r['cess']),
                        ])
                    .toList(),
              ),
            ),
          if (composition != null) ...[
            _sectionTitle('Composition Scheme'),
            _card(
              child: Column(
                children: [
                  _kvRow('Turnover', _money(composition['turnover'])),
                  _kvRow('CGST', _money(composition['cgst'])),
                  _kvRow('SGST', _money(composition['sgst'])),
                  const Divider(height: 20),
                  _kvRow('Total', _money(composition['total']), bold: true),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // ================= GSTR-1 tab =================

  Widget _buildGstr1Tab() {
    if (_gstr1Loading && _gstr1 == null) {
      return _loading();
    }
    if (_gstr1Error != null && _gstr1 == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [_errorView(_gstr1Error!, _loadGstr1)],
      );
    }
    final g = _gstr1;
    if (g == null) {
      return const Center(
          child: Text('No data', style: TextStyle(color: AppColors.gray500)));
    }

    final b2b = _list(g['b2b']);
    final b2cl = _list(g['b2cl']);
    final b2cs = _list(g['b2cs']);
    final cdnr = _list(g['cdnr']);
    final cdnur = _list(g['cdnur']);
    final hsnB2b = _list(g['hsnB2b']);
    final hsnB2c = _list(g['hsnB2c']);
    final docs = _list(g['docs']);
    final eco = _list(g['eco']);
    final nil = _list(g['nil']);
    final warnings = _list(g['warnings']);
    final legacy = _int(g['legacyBillsExcluded']);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadGstr1,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          _legacyBanner(legacy),
          ...warnings.map((w) => _warningBanner(w.toString())),
          if ((g['gstin'] ?? '').toString().isNotEmpty ||
              (g['period'] ?? '').toString().isNotEmpty)
            _card(
              child: Column(
                children: [
                  if ((g['gstin'] ?? '').toString().isNotEmpty)
                    _kvRow('GSTIN', g['gstin'].toString()),
                  if ((g['period'] ?? '').toString().isNotEmpty)
                    _kvRow('Period', g['period'].toString()),
                ],
              ),
            ),
          _expandableSection(
            'B2B Invoices',
            b2b.length,
            b2b.isEmpty
                ? _emptyNote('No B2B invoices')
                : Column(
                    children: b2b.map((inv) => _invoiceTile(inv)).toList(),
                  ),
          ),
          _expandableSection(
            'B2C Large Invoices',
            b2cl.length,
            b2cl.isEmpty
                ? _emptyNote('No B2CL invoices')
                : Column(
                    children: b2cl.map((inv) => _invoiceTile(inv)).toList(),
                  ),
          ),
          _expandableSection(
            'B2C Small (Summary)',
            b2cs.length,
            b2cs.isEmpty
                ? _emptyNote('No B2CS entries')
                : _dataTable(
                    ['Place', 'Type', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST'],
                    b2cs
                        .map((r) => [
                              (r['placeOfSupply'] ?? '-').toString(),
                              (r['supplyType'] ?? '-').toString(),
                              '${_num(r['rate']).toStringAsFixed(0)}%',
                              _money(r['taxableValue']),
                              _money(r['igst']),
                              _money(r['cgst']),
                              _money(r['sgst']),
                            ])
                        .toList(),
                  ),
          ),
          _expandableSection(
            'Credit / Debit Notes',
            cdnr.length + cdnur.length,
            (cdnr.isEmpty && cdnur.isEmpty)
                ? _emptyNote('No credit notes')
                : Column(
                    children: [
                      ...cdnr.map((n) => _noteTile(n)),
                      ...cdnur.map((n) => _noteTile(n)),
                    ],
                  ),
          ),
          _expandableSection(
            'HSN Summary',
            hsnB2b.length + hsnB2c.length,
            (hsnB2b.isEmpty && hsnB2c.isEmpty)
                ? _emptyNote('No HSN data')
                : Column(
                    children: [
                      if (hsnB2b.isNotEmpty) ...[
                        _hsnGroupLabel('B2B'),
                        ...hsnB2b.map((h) => _hsnRow(h)),
                      ],
                      if (hsnB2c.isNotEmpty) ...[
                        _hsnGroupLabel('B2C'),
                        ...hsnB2c.map((h) => _hsnRow(h)),
                      ],
                    ],
                  ),
          ),
          _expandableSection(
            'Documents Issued',
            docs.length,
            docs.isEmpty
                ? _emptyNote('No document data')
                : _dataTable(
                    ['Doc', 'FY', 'From', 'To', 'Total', 'Cancel', 'Net'],
                    docs
                        .map((d) => [
                              (d['docType'] ?? '-').toString(),
                              (d['fy'] ?? '-').toString(),
                              '${d['from'] ?? '-'}',
                              '${d['to'] ?? '-'}',
                              '${_int(d['total'])}',
                              '${_int(d['cancelled'])}',
                              '${_int(d['net'])}',
                            ])
                        .toList(),
                  ),
          ),
          _expandableSection(
            'Nil Rated / Exempt / Non-GST',
            nil.length,
            nil.isEmpty
                ? _emptyNote('No nil-rated or exempt supplies')
                : _dataTable(
                    ['Type', 'Nil', 'Exempt', 'Non-GST'],
                    nil
                        .map((n) => [
                              (n['supplyType'] ?? '-').toString(),
                              _money(n['nilRated']),
                              _money(n['exempt']),
                              _money(n['nonGst']),
                            ])
                        .toList(),
                  ),
          ),
          _expandableSection(
            'E-commerce Supplies (Table 14)',
            eco.length,
            eco.isEmpty
                ? _emptyNote('No e-commerce supplies')
                : _dataTable(
                    ['Source', 'GSTIN', 'Taxable', 'Invoices'],
                    eco
                        .map((e) => [
                              (e['orderSource'] ?? '-').toString(),
                              ((e['ecoGstin'] ?? '').toString().isEmpty
                                  ? 'not set'
                                  : e['ecoGstin'].toString()),
                              _money(e['taxableValue']),
                              '${_int(e['invoiceCount'])}',
                            ])
                        .toList(),
                  ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _emptyNote(String msg) => Padding(
        padding: const EdgeInsets.all(12),
        child: Text(msg,
            style: const TextStyle(color: AppColors.gray500, fontSize: 13)),
      );

  Widget _invoiceTile(Map<String, dynamic> inv) {
    final rates = _list(inv['rates']);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gray200),
      ),
      child: ExpansionTile(
        shape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        title: Text(
          (inv['invoiceNo'] ?? '-').toString(),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          [
            (inv['buyerName'] ?? inv['buyerGstin'] ?? '').toString(),
            _dateStr(inv['invoiceDate']),
          ].where((s) => s.isNotEmpty).join(' \u2022 '),
          style: const TextStyle(fontSize: 12, color: AppColors.gray500),
        ),
        trailing: Text(
          _money(inv['invoiceValue']),
          style: const TextStyle(
              fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.dark),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ((inv['buyerGstin'] ?? '').toString().isNotEmpty)
                  _kvRow('GSTIN', inv['buyerGstin'].toString()),
                if ((inv['placeOfSupply'] ?? '').toString().isNotEmpty)
                  _kvRow('Place of Supply', inv['placeOfSupply'].toString()),
                if (rates.isNotEmpty)
                  _dataTable(
                    ['Rate', 'Taxable', 'IGST', 'CGST', 'SGST'],
                    rates
                        .map((r) => [
                              '${_num(r['rate']).toStringAsFixed(0)}%',
                              _money(r['taxableValue']),
                              _money(r['igst']),
                              _money(r['cgst']),
                              _money(r['sgst']),
                            ])
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _noteTile(Map<String, dynamic> note) {
    final rates = _list(note['rates']);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gray200),
      ),
      child: ExpansionTile(
        shape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        leading: const Icon(Icons.assignment_return_rounded,
            color: AppColors.warningDark, size: 20),
        title: Text(
          (note['noteNo'] ?? '-').toString(),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          'Inv ${note['originalInvoiceNo'] ?? '-'} \u2022 ${_dateStr(note['noteDate'])}',
          style: const TextStyle(fontSize: 12, color: AppColors.gray500),
        ),
        trailing: Text(
          _money(note['noteValue']),
          style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.danger),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(
              children: [
                if ((note['buyerGstin'] ?? '').toString().isNotEmpty)
                  _kvRow('GSTIN', note['buyerGstin'].toString()),
                if (rates.isNotEmpty)
                  _dataTable(
                    ['Rate', 'Taxable', 'IGST', 'CGST', 'SGST'],
                    rates
                        .map((r) => [
                              '${_num(r['rate']).toStringAsFixed(0)}%',
                              _money(r['taxableValue']),
                              _money(r['igst']),
                              _money(r['cgst']),
                              _money(r['sgst']),
                            ])
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _hsnGroupLabel(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: AppColors.gray500,
            letterSpacing: 1,
          ),
        ),
      ),
    );
  }

  Widget _hsnRow(Map<String, dynamic> h) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'HSN ${h['hsn'] ?? '-'}',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    (h['description'] ?? '').toString(),
                    '${_num(h['quantity']) == _num(h['quantity']).roundToDouble() ? _int(h['quantity']) : _num(h['quantity'])} ${h['uqc'] ?? ''}'.trim(),
                    '@ ${_num(h['rate']).toStringAsFixed(0)}%',
                  ].where((s) => s.isNotEmpty).join(' \u2022 '),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.gray500),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _money(h['totalValue'] ?? h['taxableValue']),
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark),
              ),
              Text(
                'T ${_money(h['taxableValue'])} \u2022 Tax ${_money(_num(h['cgst']) + _num(h['sgst']) + _num(h['igst']))}',
                style:
                    const TextStyle(fontSize: 11, color: AppColors.gray500),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ================= Sales Register tab =================

  Widget _buildRegisterTab() {
    final reg = _register;
    final rows = reg == null ? <Map<String, dynamic>>[] : _list(reg['rows']);
    final total = _int(reg?['total']);
    final page = _int(reg?['page']) == 0 ? _regPage : _int(reg?['page']);
    final pageSize =
        _int(reg?['pageSize']) == 0 ? _regPageSize : _int(reg?['pageSize']);
    final pageCount = total == 0 ? 1 : ((total - 1) ~/ pageSize) + 1;
    final totals = _map(reg?['totals']);
    final legacy = _int(reg?['legacyBillsExcluded']);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => _loadRegister(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          _legacyBanner(legacy),
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: AppColors.light,
              borderRadius: BorderRadius.circular(14),
              boxShadow: AppColors.cardShadow,
            ),
            child: TextField(
              controller: _searchController,
              onSubmitted: (v) {
                _search = v.trim();
                _loadRegister(page: 1);
              },
              decoration: InputDecoration(
                hintText: 'Search invoice no / buyer...',
                prefixIcon: const Icon(Icons.search_rounded,
                    color: AppColors.gray400),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded,
                            color: AppColors.gray400),
                        onPressed: () {
                          _searchController.clear();
                          _search = '';
                          _loadRegister(page: 1);
                        },
                      )
                    : null,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
              ),
            ),
          ),
          if (_registerLoading && reg == null)
            _loading()
          else if (_registerError != null && reg == null)
            _errorView(_registerError!, () => _loadRegister())
          else ...[
            if (totals.isNotEmpty)
              _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PERIOD TOTALS',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.gray500,
                          letterSpacing: 1,
                        )),
                    const SizedBox(height: 8),
                    _dataTable(
                      ['Taxable', 'CGST', 'SGST', 'IGST', 'Cess', 'Total'],
                      [
                        [
                          _money(totals['taxableValue']),
                          _money(totals['cgst']),
                          _money(totals['sgst']),
                          _money(totals['igst']),
                          _money(totals['cess']),
                          _money(totals['total']),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            if (rows.isEmpty)
              _card(
                padding: const EdgeInsets.all(32),
                child: const Center(
                  child: Text('No invoices in this period',
                      style: TextStyle(color: AppColors.gray500)),
                ),
              )
            else
              ...rows.asMap().entries.map((e) => StaggeredAnimation(
                    index: e.key.clamp(0, 8),
                    child: _registerRow(e.value),
                  )),
            if (_registerLoading)
              const Padding(
                padding: EdgeInsets.all(12),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.primary),
                  ),
                ),
              ),
            _paginationBar(page, pageCount, total),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _paginationBar(int page, int pageCount, int total) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed:
                page > 1 ? () => _loadRegister(page: page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded),
            color: AppColors.primary,
            disabledColor: AppColors.gray300,
          ),
          Text(
            'Page $page of $pageCount  \u2022  $total invoices',
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.gray600),
          ),
          IconButton(
            onPressed:
                page < pageCount ? () => _loadRegister(page: page + 1) : null,
            icon: const Icon(Icons.chevron_right_rounded),
            color: AppColors.primary,
            disabledColor: AppColors.gray300,
          ),
        ],
      ),
    );
  }

  Widget _registerRow(Map<String, dynamic> r) {
    final status = (r['status'] ?? '').toString().toLowerCase();
    final cancelled = status == 'cancelled';
    final typeLabel = (r['supplyType'] ?? r['documentType'] ?? '')
        .toString()
        .toUpperCase();
    final credited = _num(r['creditedTotal']);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () {
            final id = (r['billId'] ?? '').toString();
            if (id.isNotEmpty) _openBill(id);
          },
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        (r['invoiceNo'] ?? '-').toString(),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    if (typeLabel.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.primaryExtraLight,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          typeLabel,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: (cancelled
                                ? AppColors.danger
                                : AppColors.success)
                            .withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        (r['status'] ?? 'issued')
                            .toString()
                            .toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: cancelled
                              ? AppColors.danger
                              : AppColors.success,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    _dateStr(r['invoiceDate']),
                    (r['buyerName'] ?? '').toString(),
                    (r['buyerGstin'] ?? '').toString(),
                  ].where((s) => s.isNotEmpty).join(' \u2022 '),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.gray500),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _regAmt('Taxable', _money(r['taxableValue'])),
                    _regAmt('CGST', _money(r['cgst'])),
                    _regAmt('SGST', _money(r['sgst'])),
                    _regAmt('IGST', _money(r['igst'])),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _money(r['total']),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                          if (credited > 0)
                            Text(
                              'cr -${_money(credited)}',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger,
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
      ),
    );
  }

  Widget _regAmt(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.gray400),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.dark,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
