# Official Kinetic City native startup on the Radeon 780M

The first collision-ready running draw was observed **13,487.242 ms** after the host timestamp immediately before spawning the official Windows client. Its estimated UTC was **2026-11-28 10:37:59.825**. The host received the event at 10:37:59.827, 13,489.401 ms after launch. The two correlated document clocks put the estimated endpoint between 13,486.436 and 13,488.048 ms. [Raw clocks, trusted UI events and first draw](result.json)

| Native event or interval | Time |
| --- | ---: |
| Before process spawn, UTC | 10:37:46.338 |
| Launch to initial default title | 10,795.312 ms |
| Initial title to opening the world menu | 399.400 ms |
| World menu to applying Kinetic City, Stable, seed 334458 | 450.700 ms |
| Apply to the Kinetic title | 1,291.430 ms |
| Kinetic title to trusted Start input | 185.200 ms |
| Start input to the first covered running draw | 365.200 ms |
| Normal process exit, UTC | 10:38:01.378 |

The initial title, selector, navigation and Start input all ran in the official executable. Start produced a new flight draw in the first observed animation callback. The window was focused and visible. All nine chunks in the collision ring were active. The streamer and collision adapter each reported 29 registered BVHs, 75,330 collision triangles and complete coverage. A closest-triangle query reached triangle 405 on the stable spine at 9.999884 m. The renderer submitted 131 draws and 152,984 triangles. The attached engine screenshot was taken after the endpoint. [First running frame receipt](result.json) · [Engine screenshot](first-flight.jpg)

Source `ac943acd6a2c6d21431aa138327bc3e64ed8552f`, with a verified commit signature and tree `cb5158950278ead4c800c54dfee7dd360acff798`. The shipped client executable SHA-256 was `c8af4c3ebdcbfc19ace15d21c8ea3d7d7bdd51f95bf41ca7f30c9b4e09523275` from NSIS SHA-256 `1ef368e51b05d7d1660178a9efb9626b414f0fc33fcca2bbc82a33ff966f2602`. The executed WebView entry matched its manifest and disk identity. WebView2 158.0.4370.45 reported AMD Radeon 780M via D3D11, a 1440 × 900 CSS viewport and 2160 × 1350 drawing buffer. [Official Windows build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129495362) · [Verified installer inputs](../native-inputs-ac943acd.json)

This single launch used fresh isolated app, temp and WebView2 directories and ordinary OS caches. It measured the application launch with the installed image extracted from the official installer. Installer execution, reboot and disk-cache flushing were outside the timed interval. The client exited with code 0, the disposable profile was removed, and the observer detected zero page errors. Raw receipt SHA-256 `f6e373892d2835e66b6c6dbc3361f82bd1cb2a4cb1c7c1811c3e51e5d62f0fc6`.
