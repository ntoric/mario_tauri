# Building and publishing Mario Business

A step-by-step guide to building the app and getting it onto owners' phones:
Google Play, the Apple App Store, and the other ways to install it on Android
phones and iPhones.

> Store rules, fees and limits change. Everything here was correct when this
> guide was written (November 2026). Check the linked Google and Apple pages
> before you start.

## Contents

1. [App facts](#1-app-facts)
2. [Before every release](#2-before-every-release)
3. [Android: Google Play](#3-android-google-play)
4. [iPhone: Apple App Store](#4-iphone-apple-app-store)
5. [Other ways to install on Android](#5-other-ways-to-install-on-android)
6. [Other ways to install on iPhone](#6-other-ways-to-install-on-iphone)
7. [Which option should I use?](#7-which-option-should-i-use)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. App facts

You'll be asked for these in several places. Some of them can never change
after the first upload.

| | Android | iOS |
|---|---|---|
| App name | Mario Business | Mario Business |
| App ID | `com.ntoric.mario_business` (**permanent** once on Play) | Bundle ID `com.ntoric.marioBusiness` (**permanent** once on the App Store) |
| Version | `version:` in `pubspec.yaml`, e.g. `1.0.0+1` | same |
| Minimum OS | Android 7.0 (API 24) | iOS 13 |
| Target SDK | API 36 (Flutter default) | built with whatever Xcode you use |
| Server | `https://mario-api.ntoric.com/api` (fixed in the app) | same |
| Category | Business | Business |

**Version numbers.** `1.0.0+1` means version name `1.0.0` and build number `1`.
Both stores reject an upload whose build number was already used, so bump it
every time, e.g. `1.0.0+2`, then `1.0.1+3`. You can also set it on the command
line: `flutter build appbundle --build-name=1.0.1 --build-number=3`.

---

## 2. Before every release

Run these from the `mario_business/` folder.

```bash
flutter pub get
flutter analyze        # should print "No issues found!"
flutter test           # should end with "All tests passed!"
```

Then check by hand, on a real phone and against the live server:

- [ ] Sign in with a business owner account. Every assigned store appears in the store switcher.
- [ ] A staff or admin account is refused with the "only for business owners" message.
- [ ] Close the app fully and reopen it. You're still signed in.
- [ ] Switch stores and periods. The Overview, Sales, Products and a few reports load.
- [ ] Turn on airplane mode and reopen the app. You see "Can't reach the server" with Retry.
- [ ] Try light, dark and a couple of colour themes in Settings → Appearance.
- [ ] Sign out. Reopening the app shows the login screen.

**Demo account for reviewers.** Google and Apple both review the app, and it
can't be used without signing in. Create a `business_owner` account with one or
two demo stores that have some sales data, for example `review_owner`, and keep
it working. You'll enter its username and password in both stores. Reviews are
rejected if the login fails or the screens are empty.

**Privacy policy.** Both stores require a public web page with a privacy
policy. The app handles the owner's name, username and email, plus the sales
data of their stores, all sent only to your server over HTTPS. There are no ads,
no analytics and no tracking. Host the policy at a stable address, for example
`https://ntoric.com/mario-business/privacy`.

**App icon.** It's already set (see "App icon" in the README). The stores ask
for their own copy at listing time:

- Play: 512×512 PNG.
- Apple: takes it from the build.

You can export `assets/icon/icon.png` at 512×512 with
`sips -z 512 512 assets/icon/icon.png --out play-icon-512.png`.

---

## 3. Android: Google Play

### 3.1 What you need

- A Google Play developer account (one-time US$25):
  https://play.google.com/console/signup
  - **Organisation account** (recommended for a company): needs a
    [D-U-N-S number](https://www.dnb.com/duns-number/get-a-duns.html) for the
    company, which is free but can take a few days. Organisation accounts skip
    the testing requirement in step 3.7.
  - **Personal account**: needs ID verification, and new personal accounts
    must run a closed test with at least **12 testers for 14 days** before
    they can publish to everyone (see 3.7).
- Java (already installed with Android Studio) and the Flutter SDK.

### 3.2 Create the upload key (one time)

Google signs the final app for you ("Play App Signing"). You sign the uploads
with your own **upload key**. Create it once and keep it safe:

```bash
keytool -genkey -v \
  -keystore ~/keys/mario-business-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
```

It asks for a password and your name and company. Then:

- **Back up the `.jks` file and its password** somewhere safe, such as a
  password manager or company vault. If you lose them you can ask Google to
  reset the upload key, but it takes time.
- **Never commit it to git.** The project's `android/.gitignore` already
  ignores `*.jks` and `key.properties`.

### 3.3 Tell the build where the key is

Create `android/key.properties` (next to `android/build.gradle.kts`):

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=upload
storeFile=/Users/you/keys/mario-business-upload.jks
```

The build is already set up to use this file (`android/app/build.gradle.kts`).
If the file is missing, release builds quietly fall back to the debug key, which
is fine for testing but **Google Play rejects it**.

### 3.4 Build the app bundle

Google Play needs an Android App Bundle (`.aab`), not an APK:

```bash
flutter build appbundle --release
```

Output: `build/app/outputs/bundle/release/app-release.aab`.

Check that it's signed with your upload key and not the debug key:

```bash
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab | head -5
```

`Owner:` should show the name you entered in 3.2, not `CN=Android Debug`.

> **Network tip for this Mac.** If Gradle fails with
> `java.net.ConnectException: Operation timed out`, run
> `export JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true GRADLE_OPTS=-Djava.net.preferIPv4Stack=true`
> first.

### 3.5 Create the app in Play Console

1. Open https://play.google.com/console and choose **Create app**.
2. Fill in the form:
   - App name: `Mario Business`
   - Default language
   - App or game: **App**
   - Free or paid: **Free**
3. Accept the declarations and create the app.

### 3.6 Fill in "Set up your app"

The dashboard lists these tasks. All of them must be done before the first
release.

| Task | What to enter |
|---|---|
| **Privacy policy** | Your policy URL from section 2. |
| **App access** | *All or some functionality is restricted*. Add the demo username and password, with instructions like "Sign in with these details. The account owns two demo stores." |
| **Ads** | No, the app doesn't contain ads. |
| **Content rating** | Fill in the questionnaire. Category: *All other app types*. Answer No to violence, gambling and similar questions. The result is normally "Everyone" / "3+". |
| **Target audience** | 18 and over. It's a business tool. |
| **News app** | No. |
| **Data safety** | Data collected: **Personal info → Name, Email address, User IDs** and **Financial info → Purchase history** (the store sales data the owner views). For each: collected, not shared, used for *App functionality* and *Account management*, required. Encrypted in transit: **Yes**. Users can request deletion: say how, e.g. through your support email. |
| **Government app / Financial features / Health** | No / none. |
| **App category** | Business. Add a contact email. |
| **Store listing** | See below. |

**Store listing assets:**

- **Short description** (max 80 characters), for example: *Live sales,
  profit and reports for every Mario store you own.*
- **Full description** (max 4,000 characters). Describe the features in the
  README: dashboard, store switcher, reports, dark mode.
- **App icon:** 512×512 PNG.
- **Feature graphic:** 1024×500 PNG or JPG, for example the logo and app name
  on a brand colour.
- **Phone screenshots:** at least 2, ideally 4 to 8. Take them on a phone
  signed in with the demo account. Good choices are Overview, Sales, Reports,
  P&L and dark mode.

### 3.7 Test, then release

Play has several tracks. Each one is a separate audience:

| Track | Who can install | Review |
|---|---|---|
| **Internal testing** | Up to 100 people you list by email | Few minutes, light |
| **Closed testing** | People you invite by email list or Google Group | Full review |
| **Open testing** | Anyone with the link | Full review |
| **Production** | Everyone on Google Play | Full review |

Steps:

1. **Testing → Internal testing → Create new release**.
2. Accept **Play App Signing** when asked (it's required for new apps).
3. Upload `app-release.aab`. Release name: e.g. `1.0.0 (1)`. Add release notes.
4. **Review release → Start rollout**.
5. **Testers** tab: create an email list, add testers, and send them the
   *join on the web* link. They accept it, then install from Play.
6. **If you have a new personal account**, also create a **closed testing**
   release and get **at least 12 testers** to opt in and stay opted in for
   **14 days in a row**. Only then does **Apply for production** unlock, and
   Google asks a few questions about the test.
7. **Production → Create new release**. Promote the tested release, or upload
   the bundle again, then roll it out. You can choose a staged rollout, such as
   20% first.

The first review usually takes a few days, sometimes up to a week or more.
Updates are usually faster.

### 3.8 Publishing updates

1. Bump `version:` in `pubspec.yaml`, e.g. `1.0.0+1` → `1.0.1+2`.
2. Run `flutter build appbundle --release`.
3. In Play Console, go to **Production → Create new release**, upload the
   bundle, add release notes, and roll out.

Google raises the minimum target SDK about once a year, usually around August.
When Play Console warns about it, update Flutter (`flutter upgrade`), rebuild
and upload.

### 3.9 Keeping it private (optional)

If only your own business owners should ever see the app, you can avoid a
public listing:

- **Closed testing only:** leave the app on a closed track and add each owner's
  Google account email. Simple, but owners see a "testing" label.
- **Managed Google Play private app:** for companies using Android
  Enterprise / Google Workspace device management. The app is published only to
  the organisations you choose. Set it up in Play Console under **Advanced
  settings → Managed Google Play**.

---

## 4. iPhone: Apple App Store

### 4.1 What you need

- **A Mac with Xcode.** iOS apps can only be built on macOS with Xcode. This
  Mac doesn't have Xcode yet:
  1. Install it from the Mac App Store.
  2. Open it once to finish setup, then run:
     ```bash
     sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
     sudo xcodebuild -runFirstLaunch
     brew install cocoapods     # or: sudo gem install cocoapods
     flutter doctor             # the Xcode line should be green
     ```
  3. Apple requires uploads to be built with a recent Xcode and iOS SDK. Use
     the latest stable Xcode, and run `flutter upgrade` first so Flutter
     supports it.
  - **No Mac?** A cloud build service like
    [Codemagic](https://codemagic.io) or
    [GitHub Actions macOS runners](https://docs.github.com/actions) can
    build, sign and upload the app for you. You still need the Apple account.
- **Apple Developer Program** membership (US$99 per year):
  https://developer.apple.com/programs/enroll/
  - Enrol as an **organisation** so the store shows your company name. It needs
    a D-U-N-S number, and approval can take a few days.
- Optionally, an iPhone for testing (Settings → Privacy & Security →
  **Developer Mode** must be on to run debug builds from Xcode).

### 4.2 Decide: iPhone only, or iPhone and iPad?

The project currently allows iPad too. If you keep iPad support, Apple
requires **iPad screenshots** as well, and reviewers test it on an iPad. The app
is designed for phones and locked to portrait, so **iPhone only is
recommended**:

1. Open `ios/Runner.xcworkspace` in Xcode.
2. Select **Runner** (target) → **General** → **Supported Destinations**.
3. Remove **iPad**, and remove "Mac (Designed for iPad)" and "Vision" if
   listed.

Make this choice before the first upload. Removing iPad support later is
restricted once iPad users have installed the app.

### 4.3 Set up signing in Xcode (one time)

1. `cd mario_business && flutter pub get && cd ios && pod install && cd ..`
2. Open `ios/Runner.xcworkspace` (the **workspace**, not the `.xcodeproj`).
3. Select **Runner** → **Signing & Capabilities**:
   - Turn on **Automatically manage signing**.
   - **Team:** your Apple Developer team. Sign in under Xcode → Settings →
     Accounts first.
   - **Bundle Identifier:** `com.ntoric.marioBusiness`. Xcode registers it
     with Apple for you.
4. In **General**, check that **Display Name** is `Mario Business`. Version and
   build come from `pubspec.yaml`.

### 4.4 Create the app in App Store Connect

1. Open https://appstoreconnect.apple.com → **Apps** → **+** → **New App**.
2. Fill in the form:
   - Platform: **iOS**
   - Name: `Mario Business`. This must be unique on the App Store. If it's
     taken, try e.g. "Mario Business – Owner".
   - Primary language
   - Bundle ID: `com.ntoric.marioBusiness`
   - SKU: any internal code, e.g. `mario-business`
   - User access: **Full Access**

### 4.5 Build and upload

```bash
flutter build ipa --release
```

Output: `build/ios/ipa/Mario Business.ipa` (the exact file name may differ).
Upload it in one of these ways:

- **Transporter app** (free on the Mac App Store): sign in and drag in the
  `.ipa`.
- **Xcode:** open `build/ios/archive/Runner.xcarchive`, which shows in
  Window → Organizer, then click **Distribute App → App Store Connect →
  Upload**.
- **Command line:**
  ```bash
  xcrun altool --upload-app --type ios -f build/ios/ipa/*.ipa \
    --apiKey YOUR_KEY_ID --apiIssuer YOUR_ISSUER_ID
  ```
  This needs an API key from App Store Connect → Users and Access →
  Integrations.

After about 5 to 30 minutes of processing, the build appears in App Store
Connect under **TestFlight**. Encryption export compliance is already answered
in the app (`ITSAppUsesNonExemptEncryption = NO`), because it only uses standard
HTTPS. So you won't be asked about it on each upload.

### 4.6 Test with TestFlight

1. App Store Connect → your app → **TestFlight**.
2. **Internal testing:** add up to 100 people from your App Store Connect team.
   No review is needed, and they get the build right away.
3. **External testing:** create a group and add testers by email or a public
   link (up to 10,000 people). The first build of each version goes through a
   short beta review, usually within a day.
4. Testers install the free **TestFlight** app on their iPhone and accept the
   invite.

TestFlight builds stop working after **90 days**. Upload a new build before
then.

### 4.7 Fill in the App Store page

Under your app in App Store Connect:

**App Information**
- Category: **Business**. Secondary category, optional: Finance.
- Content rights: the app doesn't use third-party content.
- Age rating: fill in the questionnaire. Answer None/No to everything; the
  result is 4+.

**App Privacy**
- Privacy Policy URL: from section 2.
- Data types collected:
  - **Contact Info → Name, Email Address**
  - **Identifiers → User ID**
  - **Purchases → Purchase History** (store sales viewed by the owner)

  For each one: *linked to the user*, purpose *App Functionality*, **not
  used for tracking**.

**Pricing and Availability**
- Free, and the countries where your owners are (e.g. India).

**Version page (1.0)**
- **Screenshots:** iPhone 6.9" display (1320×2868 or 1290×2796 pixels), 3 to
  10 images. iPad 13" screenshots too only if you kept iPad support. You can take
  them on an iPhone 16/17 Pro Max simulator: `open -a Simulator`, run
  `flutter run`, then press ⌘S in the simulator.
- **Promotional text, description, keywords** (100 characters, comma-separated,
  e.g. `sales,reports,restaurant,cafe,pos,profit,owner,dashboard,gst`),
  support URL, marketing URL (optional).
- **Build:** pick the build you uploaded.
- **App Review Information:**
  - **Sign-in required:** username and password of the demo owner account.
  - **Notes**, for example:
    > Mario Business is the companion app for owners of restaurants that use the
    > Mario POS system. Accounts are created by our team when a business signs
    > up; there is no public sign-up. The app is read-only: it shows sales,
    > products and reports for the stores assigned to the owner. Use the demo
    > account above, which owns two demo stores.
  - Contact name, phone and email.
- **Version release:** manually, or automatically after approval.

Click **Add for Review**, then **Submit**. Review usually takes 1 to 3 days.

### 4.8 Common rejection reasons for this kind of app

- **Demo account doesn't work or shows no data.** This is the most common
  reason. Test the demo login the day you submit.
- **"Business app for one company."** Apple may say an app meant only for
  a specific organisation's staff shouldn't be public. If the app is offered to
  any restaurant that uses Mario, explain that in the review notes. If it's
  really only for one company, use **Unlisted** or **Custom App** distribution
  instead (see 6.2 and 6.3).
- **Account deletion (guideline 5.1.1(v)).** This applies only to apps that
  let people create accounts. Mario Business doesn't, because accounts are
  created by your admin. Say so in the notes if asked.
- **Broken links.** The privacy policy and support URLs must open.

### 4.9 Publishing updates

1. Bump `version:` in `pubspec.yaml`. The build number must go up; the version
   name must go up for each new App Store version.
2. Run `flutter build ipa --release` and upload.
3. App Store Connect → **+ Version**, enter the new version, pick the build,
   write "What's New", and submit for review.

---

## 5. Other ways to install on Android

### 5.1 Install the APK directly (sideloading)

The quickest way to put the app on a few phones, with no Play account and no
review.

```bash
flutter build apk --release                  # one APK for all phones (~54 MB)
flutter build apk --release --split-per-abi  # smaller APKs per phone type (~20 MB each)
```

Output: `build/app/outputs/flutter-apk/app-release.apk`. For split builds,
most phones need `app-arm64-v8a-release.apk`.

Then get it onto the phone:

- **USB:** turn on *USB debugging* in Developer options, then run
  `adb install -r build/app/outputs/flutter-apk/app-release.apk`.
- **File share:** send the APK by Google Drive, email, WhatsApp, or a link on
  your website. On the phone, tap it. Android asks to allow
  **"Install unknown apps"** for that app (Drive, Chrome and so on); allow
  it, then install.

Notes:

- Sign it with your own key (section 3.3). Updates must be signed with the
  **same key**, or Android refuses to install over the old version. Owners
  would have to uninstall first, which also signs them out.
- No automatic updates. You send each new APK yourself.
- Google Play Protect may show a warning for apps from unknown sources.
  Owners can tap **Install anyway**.

### 5.2 Firebase App Distribution

A free Google service for sending test builds to a list of people. They get an
email and install through the **App Tester** app, and you can see who
installed which version.

1. Create a project at https://console.firebase.google.com and add an Android
   app with package `com.ntoric.mario_business`.
2. **App Distribution → Get started** and upload the APK or AAB.
3. Add testers by email and distribute.

The app itself needs no Firebase code for this.

### 5.3 Google Play testing tracks

Internal or closed testing (section 3.7) can also be the long-term way to
distribute privately: owners install from the real Play Store and get
automatic updates, but it isn't publicly listed.

---

## 6. Other ways to install on iPhone

Apple doesn't let people install apps from a file the way Android does.
Every option below needs the app signed by Apple, and all except the web
app need a Mac (or a cloud Mac) to build.

### 6.1 TestFlight (recommended for testing and small groups)

Covered in 4.6.

- Up to 10,000 people, with installs through the TestFlight app.
- Needs the US$99 developer account. External testers need a short beta review.
- Each build works for 90 days, so upload a new one at least every 3 months.
- Fine for pilots. Not ideal as a permanent way to run the app.

### 6.2 Unlisted App Store app

A normal App Store app that **doesn't appear in search or charts**. Only people
with the direct link can find and install it. It has normal App Store
installs and automatic updates.

1. Prepare and submit the app as in section 4. It goes through normal review.
2. Request unlisted distribution:
   https://developer.apple.com/support/unlisted-app-distribution/
   - Say who the app is for (owners of businesses using Mario).
3. Once approved, send owners the App Store link.

A good fit if the app is only for your own customers' owners and you don't want
it public.

### 6.3 Custom app through Apple Business Manager

For selling or giving the app privately to **specific organisations**. The
app is published only to the organisations you choose, never to the public
store.

1. The receiving business needs a free
   [Apple Business Manager](https://business.apple.com) account, and gives you
   its **Organisation ID**.
2. In App Store Connect → **Pricing and Availability → App Distribution
   Methods**, choose **Private** and enter their Organisation ID(s).
3. Submit for review as usual.
4. The business gets the app in Apple Business Manager and installs it on its
   devices, through device management (MDM) or redemption codes.

Best for large customers with managed company iPhones. More setup than
unlisted.

### 6.4 Ad Hoc distribution (registered devices)

Install on **up to 100 specific iPhones** (per device type, per membership
year) without App Store review.

1. Collect each iPhone's **UDID**. Connect it to a Mac and look in Finder, or
   use a UDID-finder website.
2. Register the devices at https://developer.apple.com/account → Devices.
3. Build:
   ```bash
   flutter build ipa --release --export-method ad-hoc
   ```
4. Distribute the `.ipa`:
   - over USB with Apple Configurator or Xcode (Window → Devices and
     Simulators → **+**),
   - through a service like Firebase App Distribution or Diawi, or
   - from your own HTTPS site with an `itms-services://` manifest link.

Notes:

- Every new iPhone must be registered and the app rebuilt.
- The app stops opening when the provisioning profile expires (about one
  year), so you need to send a new build before then.
- Fine for a handful of known owners.

### 6.5 Install from Xcode with a free Apple ID (developer use only)

Connect an iPhone to the Mac, select it in Xcode, and press Run, or use
`flutter run --release`. A free Apple ID works, but the app **expires after 7
days** and only 3 such apps are allowed per phone. Useful for development
testing, not for owners.

### 6.6 Apple Developer Enterprise Program (not suitable)

Lets large organisations install in-house apps on **their own employees'**
devices without the App Store. Apple only accepts companies that meet
strict requirements, and it forbids distributing to customers or other
businesses. Since business owners are your customers, not your employees, this
program **doesn't fit**. Use 6.2 or 6.3 instead.

### 6.7 Alternative app marketplaces (EU only)

In the European Union, iOS allows apps from alternative marketplaces and from
developers' websites. It needs Apple notarisation, extra legal terms, and only
works for users in the EU. It isn't relevant for owners in India.

### 6.8 Web app on the home screen (no App Store, no Apple account)

The same Flutter code can run in Safari. Owners open a web address and tap
**Share → Add to Home Screen**, and it gets an icon and opens full-screen like
an app. Updates are instant, because you redeploy the website.

To set it up:

1. Add the web platform:
   ```bash
   flutter create --platforms web .
   ```
2. Build:
   ```bash
   flutter build web --release
   ```
3. Host `build/web/` on any HTTPS host, for example
   `https://business.ntoric.com`. Options include Firebase Hosting, Netlify,
   Cloudflare Pages, or your own Nginx.
4. The backend already allows browser requests from any origin (CORS `*` in
   `backend/cmd/server/main.go`), so no backend change is needed. You may want
   to restrict CORS to your web address later.

Things to know:

- **Login storage is weaker.** On web, the saved session is kept in browser
  storage instead of the iPhone Keychain. Consider making web sessions
  shorter.
- **Slower first load.** It downloads a few MB on first open, and feels less
  smooth than the native app on older iPhones.
- **Safari can clear data.** Safari may clear a home-screen web app's data
  after weeks without use, which signs the owner out.
- **Some app-only features are missing.** For example, the portrait lock
  doesn't apply.
- During development the app's screens were checked in a web build, so the
  layout works in a browser. Test it on a real iPhone before relying on it.

A good no-cost stopgap while the App Store listing is in progress, or for owners
who only check in occasionally.

---

## 7. Which option should I use?

| Situation | Android | iPhone |
|---|---|---|
| Try it on your own phone today | APK (5.1) | Xcode free install (6.5) or web app (6.8) |
| Pilot with 5–20 owners | Play internal testing (3.7) or Firebase (5.2) | TestFlight (6.1) |
| All owners, public listing OK | Play production (3.7) | App Store (4) |
| All owners, not publicly listed | Play closed testing (5.3) | **Unlisted app** (6.2) |
| A big customer with managed devices | Managed Google Play (3.9) | Custom app via Apple Business Manager (6.3) |
| No developer accounts at all | APK (5.1) | Web app (6.8) |

A typical path:

1. Build the APK and web app for the first few owners.
2. Move to Play internal testing and TestFlight.
3. Publish on Google Play and as an unlisted or public App Store app.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Play: *"You uploaded an APK or Android App Bundle that was signed in debug mode"* | `android/key.properties` is missing or wrong. See 3.3, then rebuild. |
| Play: *"Version code 1 has already been used"* | Bump the `+N` build number in `pubspec.yaml`. |
| Play: target API level warning | Run `flutter upgrade`, rebuild, upload. |
| Android: *"App not installed"* when updating an APK | The new APK is signed with a different key. Uninstall the old one, or always sign with the same key. |
| Gradle: `ConnectException: Operation timed out` | `export JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true GRADLE_OPTS=-Djava.net.preferIPv4Stack=true` |
| iOS: *"No profiles for 'com.ntoric.marioBusiness' were found"* | Xcode → Runner → Signing & Capabilities: choose your Team and turn on automatic signing. |
| iOS: `pod install` errors | `cd ios && pod repo update && pod install`, or delete `ios/Pods` and `ios/Podfile.lock` and try again. |
| iOS: upload rejected for an old SDK | Install the latest Xcode, run `flutter upgrade`, rebuild. |
| App Store: missing iPad screenshots | Either upload iPad screenshots or make the app iPhone-only (4.2) and upload a new build. |
| Owners see "No stores assigned" | A superadmin must assign stores to the owner account. Then Settings → *Refresh store access*. |
| Owners signed out after a day | Sessions expire after 24 hours without use (set in `backend/cmd/server/main.go`). |
