# Mario Business

Flutter mobile app for **business owners** to monitor and analyse their stores.
It is read-only: no order taking, billing, or menu editing. Staff keep using the
Mario POS apps.

## Who can use it

Only accounts with the `business_owner` role can sign in. Other roles are signed
out with a message pointing them to the POS app. The stores an owner can view are
the ones a superadmin assigned to them (`user_stores`). The backend checks every
`storeId` against that list, so a removed store returns 403 and the app shows a
"No access" state. Settings → *Refresh store access* picks up new assignments
without signing out.

## Features

| Tab | What's there |
|---|---|
| **Overview** | Net sales with change vs. the previous period, open orders right now, bills, average bill value, net profit, expenses, items sold, tax, peak hour / best day, sales vs. expenses trend (hourly for one day), payment methods, top items, category share, order channels, latest bills |
| **Sales** | Daily/hourly sales chart and every bill in the period, with search, sort, payment/channel filters and a read-only bill detail sheet |
| **Products** | *Items*: sold quantity, revenue, profit and margin, sortable, plus items not sold. *Categories*: revenue share and per-category items. *Menu*: full catalogue with price, cost, margin and GST |
| **Reports** | Sales trend (day/week/month, weekday, weekday×hour heatmap), payments & channels (plus staff and tables), orders (completed/cancelled/open, cancellation rate), profit & loss statement, expenses, menu profitability, item performance (top 10, ABC analysis, slow movers), category performance, GST summary, store comparison, store details & team |
| **Settings** | Profile, store switcher, appearance, compact numbers, change password, sign out |

A store switcher in the top bar and a shared period filter (Today, Yesterday,
7 / 30 days, this month, last month, this year, custom) drive every screen.

**Appearance:** light, dark, or follow the system. Eight colour themes (Indigo,
Ocean, Emerald, Teal, Mario Orange, Rose, Violet, Graphite) and an optional pure
black dark mode. All choices are saved on the device.

## Backend endpoints used

All read-only, under `/api`: `auth/login`, `auth/me`, `auth/logout`,
`users/change-password`, `stores`, `stores/{id}`, `users`, `categories`, `items`,
`orders`, `reports/revenue`, `reports/sales-profit`,
`reports/top-selling-categories`, `reports/menu-profit`,
`reports/expenses-by-category`, `reports/gst/summary`.

No backend changes are required.

## Run & build

```bash
flutter pub get
flutter run                                   # server: https://mario-api.ntoric.com/api
flutter run --dart-define=API_URL=http://10.0.2.2:8088/api   # local backend from an Android emulator
flutter build apk --release
flutter test
```

**Publishing:** see [docs/PUBLISHING.md](docs/PUBLISHING.md) for step-by-step
Google Play and App Store guides, plus other ways to install on Android and
iPhone (APK, TestFlight, unlisted apps, Ad Hoc, web app).

The server is fixed to `https://mario-api.ntoric.com/api`; there is no option
to change it in the app. `--dart-define=API_URL=...` is for local development only.

## Notes

- Owners stay signed in between launches. The session lives in Redis on the
  backend (24h sliding expiry, so it lasts as long as the app is opened at least
  once a day). The app keeps only the opaque token, in the iOS Keychain or
  Android encrypted storage, and checks it with `/auth/me` at launch. Signing
  out, a password change, or the session expiring on the server removes it.
- Responses are cached in memory for 2 minutes so switching tabs is instant.
  Pull down on any screen to refresh.
- Release builds are signed with your upload key when `android/key.properties`
  exists, otherwise with the debug key (fine for testing only).

## App icon

The launcher icon is the Mario logo (`assets/icon/icon.png` for iOS and older
Android, `assets/icon/foreground.png` on white for Android adaptive icons).
After changing them, run `dart run flutter_launcher_icons`.

## Structure

```
lib/
  core/       API client, config, formatting, date ranges
  models/     JSON models (lenient parsing)
  data/       OwnerRepository (all API calls + cache), SalesAnalytics
  state/      Session: auth, assigned stores, selected store, period
  theme/      Theme builder, accent palettes, chart palette, ThemeController
  widgets/    Cards, KPI tiles, charts, store switcher, period bar, loader
  features/   auth, shell, dashboard, sales, products, reports, stores, settings
```
