# FEG-TECH Attendance: Android apps (Lecturer + Student)

Two Android apps, built on GitHub (no Android Studio needed):

| App | Folder | Package name | What it is |
|---|---|---|---|
| **Attendance Lecturer** | `lecturer/` | `com.fegtech.attendance.lecturer` | The staff app 5.1 (all features) + **Hotspot mode** |
| **Attendance Student** | `student/` | `com.fegtech.attendance.student` | The Student app 4.5 + hotspot scanning |

## What is new: hotspot mode (no internet in class)

1. **Before class, with internet:** on the lecturer phone open the app, make sure Online Sync is connected, and tap **Prepare for offline** (Class tab). This saves the students, face data and classes on the phone.
2. **In class:** switch the lecturer phone's mobile data off, **turn on its hotspot** (phone Settings), then in the app tick **Students scan over this phone's hotspot** (Class tab) and start the class.
3. **Students** join that hotspot Wi-Fi (Android says "no internet": choose **Stay connected**), open the **Attendance Student** app and scan the class QR code, then do the face check. The lecturer's phone decides and records attendance, with no internet.
4. **After class**, turn data on again. Attendance syncs to the server by itself.

One student per QR code (the code changes after each student), the same rule as online.

## Folder layout (this is exactly what must be in the GitHub repository)

```
feg-tech-native/                      <- repository root
|-- README.md
|-- .gitignore
|-- .github/workflows/
|   |-- build-lecturer-apk.yml        <- builds the Lecturer APK
|   `-- build-student-apk.yml         <- builds the Student APK
|-- signing/
|   `-- fegtech.keystore              <- signing key (same for both apps; do not delete)
|-- scripts/
|   |-- fetch-vendor.sh               <- downloads the face engine, QR reader and face models into the app
|   `-- prepare-android.py            <- adds permissions, Java code, signing, icons to the Android project
|-- lecturer/
|   |-- package.json
|   |-- capacitor.config.json
|   |-- native/java/                  <- MainActivity, LocalServerPlugin, MiniHttpServer, PrintPlugin (.java)
|   `-- www/                          <- the staff web app (index.html, app.js, local.js, native.js, ...)
|-- student/
|   |-- package.json
|   |-- capacitor.config.json
|   |-- native/java/                  <- MainActivity, WifiBindPlugin (.java)
|   `-- www/                          <- the student web app (index.html, student.js, config.js, ...)
|-- server/cloudflare/                <- worker.js 5.0 (unchanged; deploy it as before)
`-- docs/                             <- notes; docs/workflows-to-paste/ has copies of the two workflow files
```

`www/vendor/` and `android/` do not exist in the repository on purpose; the build creates them.

## Build the APKs on GitHub

1. Create a **private** GitHub repository and upload everything so the layout above is at the repository root.
   - The `.github` folder starts with a dot and some phones/file pickers skip it. If it is missing on GitHub: **Add file > Create new file**, type the name `.github/workflows/build-lecturer-apk.yml`, paste the text from `docs/workflows-to-paste/build-lecturer-apk.yml`, commit; repeat for the student file.
2. Open the **Actions** tab. Choose **Build Lecturer APK** > **Run workflow**. Do the same for **Build Student APK**.
3. Each run takes about 8 to 15 minutes. When it is green, open the run and download the **Lecturer-APK** (or **Student-APK**) at the bottom, under *Artifacts*. Unzip it to get `app-release.apk`.
4. Send the APK to the phone and install it (allow "Install unknown apps" for the app you open it from).
5. **Updating later:** change a file in `lecturer/www/` or `student/www/`, commit, and run the workflow again (it also runs by itself when those folders change). Install the new APK over the old one; data stays, because the version number goes up every run and the same signing key is used.

If a run fails, open the failed step in Actions, copy the last 30 lines of the red step and send them to me.

## First-time setup on the lecturer phone

- The app is separate from the old web app. **Data in the web app does not move automatically.** Either connect Online Sync (HOD > Reports > Online Sync & Settings: paste the Worker URL and access key, Save & test, Sync now) and everything downloads, or use the app's backup in the old version and restore it in the new one.
- Allow **Camera** when asked.
- In the new app, **Share link** now shares the sync URL and access key as text (a web link cannot open an app).
- Exports (CSV, backup) open the Android share sheet: choose Drive, Files, WhatsApp or e-mail. Printing opens the Android print screen (choose Save as PDF).

## Troubleshooting hotspot mode

- **Student sees "Cannot reach the lecturer's phone":** the student phone is not on the lecturer's hotspot, or the lecturer app is not open on the class screen, or hotspot mode is not ticked. On the student phone's browser, `http://<address shown in the lecturer app>:8765/s/ping` should show `{"ok":true...}`.
- **Hotspot card says no address:** turn the hotspot on first and wait a few seconds. If the phone is connected to a Wi-Fi router instead, that works too (same Wi-Fi for everyone).
- **"Face not recognised" for everyone:** the roster on the lecturer phone has no face data; run Prepare for offline online first.
- Some phones turn the hotspot off after a few idle minutes: Settings > Hotspot > turn off the auto switch-off.
- Keep the lecturer app open and the screen on during class (the app keeps the screen awake).

## Signing key

`signing/fegtech.keystore` (password `fegtech-attendance`, alias `fegtech`) signs both apps. Keep the repository **private**. Never delete or replace this file: phones refuse to update an app signed with a different key.

## What was tested and what was not

Tested here: the lecturer's hotspot answer logic against a simulated student (join, reused/forged/expired QR, submit, result, class ended), the Java hotspot server (GET/POST/OPTIONS, 40 parallel requests), the build scripts against a mock Android project, and every JavaScript file's syntax. **Not tested:** the actual Gradle build on GitHub and the apps on real phones, because this environment has no Android tools or internet. Expect that the first build may need one or two small fixes; send me the red log lines.
