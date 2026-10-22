#!/usr/bin/env python3
"""
Run AFTER `npx cap add android` (inside the app folder) and BEFORE `npx cap sync android`.
Usage (from the repository root):
    python3 scripts/prepare-android.py lecturer|student <versionCode> <versionName>

What it does to <app>/android:
  1. copies our Java files (<app>/native/java/*.java) into the app's package folder (this includes MainActivity.java)
  2. AndroidManifest.xml: camera + network permissions, and plain-http allowed (needed to talk to the lecturer's phone)
  3. app/build.gradle: version numbers, signing with signing/fegtech.keystore, lint will not stop the build
  4. launcher icon + launch background from the Federal University Otuoke crest
It stops with a clear message if the generated project looks different from what it expects.
"""
import json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if len(sys.argv) != 4:
    sys.exit(__doc__)
app, vcode, vname = sys.argv[1], sys.argv[2], sys.argv[3]
APP = ROOT / app
AND = APP / "android"
if not AND.is_dir():
    sys.exit(f"{AND} not found. Run `npx cap add android` inside {APP} first.")
pkg = json.load(open(APP / "capacitor.config.json"))["appId"]

def fail(msg):
    sys.exit("PREPARE FAILED: " + msg)

# ---------- 1. Java ----------
dest = AND / "app/src/main/java" / pkg.replace(".", "/")
dest.mkdir(parents=True, exist_ok=True)
files = sorted((APP / "native/java").glob("*.java"))
if not files:
    fail(f"no Java files in {APP / 'native/java'}")
for f in files:
    shutil.copy(f, dest / f.name)
    print("java      ", f.name, "->", dest.relative_to(ROOT))

# ---------- 2. Manifest ----------
mf = AND / "app/src/main/AndroidManifest.xml"
x = mf.read_text(encoding="utf-8")
if "usesCleartextTraffic" not in x:
    x, n = re.subn(r"<application\b", '<application android:usesCleartextTraffic="true"', x, count=1)
    if n != 1:
        fail("no <application> tag in AndroidManifest.xml")
perms = [
    "android.permission.CAMERA",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.CHANGE_NETWORK_STATE",
]
add = ""
for p in perms:
    if p not in x:
        add += f'    <uses-permission android:name="{p}" />\n'
for feat in ("android.hardware.camera", "android.hardware.camera.autofocus"):
    if feat not in x:
        add += f'    <uses-feature android:name="{feat}" android:required="false" />\n'
if "</manifest>" not in x:
    fail("no </manifest> in AndroidManifest.xml")
x = x.replace("</manifest>", add + "</manifest>", 1)
mf.write_text(x, encoding="utf-8")
print("manifest   permissions + cleartext added")

# ---------- 3. Gradle ----------
ks_src = ROOT / "signing/fegtech.keystore"
if not ks_src.is_file():
    fail(f"{ks_src} is missing. It must be in the repository (see README, 'Signing key').")
shutil.copy(ks_src, AND / "app/fegtech.keystore")
gr = AND / "app/build.gradle"
g = gr.read_text(encoding="utf-8")
g, n1 = re.subn(r"versionCode\s+\d+", f"versionCode {int(vcode)}", g, count=1)
g, n2 = re.subn(r'versionName\s+"[^"]*"', f'versionName "{vname}"', g, count=1)
if not (n1 and n2):
    fail("versionCode / versionName not found in app/build.gradle")
block = '''
    signingConfigs {
        release {
            storeFile file("fegtech.keystore")
            storePassword "fegtech-attendance"
            keyAlias "fegtech"
            keyPassword "fegtech-attendance"
        }
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
'''
g, n3 = re.subn(r"(\nandroid\s*\{)", lambda m: m.group(1) + block, g, count=1)
g, n4 = re.subn(r"(buildTypes\s*\{\s*release\s*\{)", lambda m: m.group(1) + "\n            signingConfig signingConfigs.release", g, count=1)
if not (n3 and n4):
    fail("could not find the `android {` block or `buildTypes { release {` in app/build.gradle")
gr.write_text(g, encoding="utf-8")
print("gradle     version", vcode, vname, "+ signing")

# ---------- 4. Icons + launch background ----------
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("icons      SKIPPED (Pillow not installed: pip install pillow)")
    Image = None
if Image:
    www = APP / "www"
    legacy_src = Image.open(www / "icon-maskable-512.png").convert("RGBA")
    crest = Image.open(www / "logo.png").convert("RGBA")
    res = AND / "app/src/main/res"
    for d, s in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        folder = res / f"mipmap-{d}"
        folder.mkdir(parents=True, exist_ok=True)
        sq = legacy_src.resize((s, s), Image.LANCZOS)
        sq.save(folder / "ic_launcher.png")
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
        rd = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        rd.paste(sq, (0, 0), mask)
        rd.save(folder / "ic_launcher_round.png")
        f = s * 108 // 48
        fg = Image.new("RGBA", (f, f), (0, 0, 0, 0))
        c = int(f * 0.60)
        cr = crest.resize((c, c), Image.LANCZOS)
        fg.paste(cr, ((f - c) // 2, (f - c) // 2), cr)
        fg.save(folder / "ic_launcher_foreground.png")
    bg = res / "values/ic_launcher_background.xml"
    bg.parent.mkdir(parents=True, exist_ok=True)
    bg.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#062B10</color>\n</resources>\n', encoding="utf-8")
    solid = Image.new("RGB", (32, 32), (6, 36, 15))
    n = 0
    for p in res.glob("drawable*/splash.png"):
        solid.save(p)
        n += 1
    print(f"icons      launcher icons written, {n} launch image(s) replaced")
print("DONE")
