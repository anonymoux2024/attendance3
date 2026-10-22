# Cloudflare sync setup (Worker + D1) - about 10 minutes, free plan is enough

1. Cloudflare dashboard > **Storage & Databases > D1 SQL database > Create database**. Name it `attendance`.
2. **Workers & Pages > Create > Create Worker**. Name it `attendance-sync` > Deploy > **Edit code**. Delete the sample code, paste all of `worker.js`, then **Deploy**.
3. Open the Worker > **Settings > Bindings > Add > D1 database**. Variable name must be exactly `DB`, pick `attendance` > Save/Deploy. (The table is created automatically on first use.)
4. (Recommended) Worker > **Settings > Variables and Secrets > Add** a **Secret** named `ACCESS_KEY` with a long random value. Deploy.
5. Copy the Worker URL (like `https://attendance-sync.YOURNAME.workers.dev`). In the app: 🔑 > HOD > HOD > Reports > **Online Sync & Settings** > paste the URL, paste the same ACCESS_KEY value in "Access key" > **Save & test**.
6. Tap **Share link** and open it once on every lecturer and student phone.

Notes: the app itself can stay on Cloudflare Pages; the Worker is a separate address. Visiting the Worker URL in a browser should show `{"ok":true,"service":"attendance-sync"}`. "Access denied" in the app means the access key does not match the ACCESS_KEY secret. Student face data is stored in D1, so keep ACCESS_KEY private and get consent.

## Student app (v3.6)
The Worker now also serves the separate Student app. To update an existing Worker: Worker > Edit code > replace everything with the new `worker.js` > Deploy. No new binding or database is needed (the extra table is created automatically). The ACCESS_KEY secret is now **required** for the Student app. In the staff app turn on "Students scan on their own phone (Student app)" on the Teacher Dashboard. Put the Worker URL (not the key) in the Student app's `config.js`. Never share the staff sync link with students.

## Registration from home (v4.0)
Students register once, at home, in the Student app (any internet). Update the Worker: Edit code > replace everything with the new `worker.js` > Deploy. No new binding is needed (table `enr` is created automatically). Optional: add a Worker **Secret** `ENROL_CODE` (any short word) and tell students; without it anyone with the Student app link can send a request, but nothing is used until a lecturer approves it. Pending requests are capped at 300.
Lecturer: Staff space > Lecturer > Register > **Registration requests** (this phone must be connected to online sync). Compare the photo with the student, then Approve or Reject. Approved faces sync to every lecturer phone (open the app on good internet before class so the full student list is pulled). The photo and face numbers are deleted from the request table once you approve or reject; the approved record then lives in the normal `students` sync data.
**Class scanning:** the Worker is online, so the lecturer's hotspot must have mobile data on. A scan is only a few KB. The Student app saves its libraries and face models on the phone after the first visit, so students should open it (or register) once at home on Wi-Fi.

## Open phones (FEG-TEC 4.2)
Replace the Worker code with the new `worker.js` and Deploy. No new binding is needed (table `pass` is created automatically). A phone opened with the lecturer's Phones-tab code gets a pass that lasts up to 1 hour (and never longer than the class). Limits: 20 open phones per class, 8 face scans per minute per phone. The lecturer can close all open phones from the Phones tab. An open phone can submit registrations without the optional `ENROL_CODE`; registrations still need lecturer approval.

## Version 5.0: faster, safer sync (update the Worker FIRST)
Replace the Worker code with the new `worker.js` and Deploy. No new binding is needed. The database is upgraded by itself the first time the new Worker runs (two columns and a small revision table are added; nothing is deleted).
Then upload the 5.0 app files and open the app once with internet.
What changed:
- Every change is stamped with the time it was MADE, and the Worker refuses a write that is older than the copy it already holds. A phone that syncs late can no longer overwrite a newer change from another phone.
- The Worker keeps a revision number. A normal check asks "anything newer than revision N?" and downloads nothing when the answer is no. One request now carries every collection (before: six or more).
- Offline: the app says "Offline - saved on this phone, will sync when online" and sends everything when the internet returns.
- Delete markers are removed a week after they were sent (the Worker removes its own after 90 days).
- If you update the app but not the Worker, sync shows "The sync server needs the new worker.js (version 5.0)". Update the Worker and it works again. Phones still on 4.x keep working with the new Worker.
- The app saves a copy of itself and of the face-recognition files, so it opens offline. When you upload a new version, phones show "A new version is ready - Update now / Later". Only version.js needs its number changed.
