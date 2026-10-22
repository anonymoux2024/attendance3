# Hotspot protocol (for maintainers)

Class QR code (lecturer app, hotspot mode):  `FL1|<ip>:<port>|<sessionId>|<ts36>|<seq>|<end36>|<mac12>`
`mac12` = first 12 hex of HMAC-SHA256(secret, `sessionId|ts36|seq|end36`). The secret is random, created on the lecturer phone
(`localStorage fc-local-secret`) and never leaves it. The online QR is still `FC2|...` (signed with the sync access key).

The lecturer phone listens on port 8765 (all interfaces). Same routes and replies as the school server's student routes:

| Route | Who | Reply |
|---|---|---|
| `GET /s/ping` | test | `{ok:true,...}` |
| `GET /s/join?q=<QR text>` | student | `{ticket,title,code,level,turn,ttl}`; one student per QR code (409 if reused); the lecturer app then shows a new QR |
| `POST /s/submit` `{ticket,front[128],side[128]}` | student | `{ok:true}`; the face is judged immediately by `window.fcJudge` (v35.js) against the roster on the lecturer phone |
| `GET /s/result?ticket=` | student | `{state:'done',res:{ok,name,msg}}` |

Files: `lecturer/native/java/MiniHttpServer.java` (plain Java HTTP server, no Android code), `LocalServerPlugin.java`
(passes each request to the web app as the Capacitor event `request`; the web app answers with `respond`), `lecturer/www/local.js`
(the logic and the Hotspot card). Student side: `student/www/student.js` (`useLocal`, `LOCAL_RE`) and `student/native/java/WifiBindPlugin.java`
(binds the app to the Wi-Fi network so traffic does not go out over mobile data).
