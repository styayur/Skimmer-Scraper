# Windows release audio and portable smoke

Use the public Pages URL and the Windows executable from the same release revision. Take the executable SHA-256 from the original native build’s installed smoke receipt. The measured runs open visible windows and play sound. Reserve the desktop for their duration.

The tool uses the repository’s locked Playwright dependency and Windows Edge. For endpoint measurement, use a QA Python environment with `pycaw==20260927`, `comtypes==1.5.0` and `psutil==7.2.2`. Pass its interpreter with `--python`. An existing dependency directory can also be supplied through `PYTHONPATH`.

```powershell
node scripts/measure-release-audio.mjs web --url $publicUrl --sha $sha --python $qaPython --output $webAudio
node scripts/measure-release-audio.mjs desktop --exe $client --exe-sha256 $clientHash --sha $sha --python $qaPython --output $desktopAudio
node scripts/measure-release-audio.mjs portable-smoke --exe $extractedPortableClient --exe-sha256 $clientHash --sha $sha --output $portableSmoke
```

Each command takes a new output directory. Before launching, it verifies Windows resolves the process’s local and roaming Known Folders inside its new QA profile. Edge and WebView2 receive a fresh browser profile. For native audio the game also reports its world-library directory inside that profile.

The audio check reads the fresh pilot’s default music setting, starts a WorldForge flight and samples the decoded track while its playback time advances. It returns to the title and plays one bundled local preview for each of the three wingmates. The Windows meter observes peak levels for the test process and its descendants on the default multimedia render endpoint. It writes only timestamps, session counts and peak values.

Archive `audio.json` and `windows-session-levels.jsonl` together. The report includes the observed build, executed entry digest, session log digest, track and three clip measurements. Release assembly consumes `audio.json` under `web-audio` or `desktop-audio`. For the portable check, extract the prepared release ZIP into a new directory and provide its executable. The existing desktop smoke exercises a separate launch and writes `desktop-smoke.json`.

To rehearse the game sequence against a local candidate, add `--rehearse` to the Web command and use its loopback URL. This runs muted headless Edge with software rendering and writes `rehearsal.json` with `endpointVerified` set to false. [Measured candidate rehearsal](../acceptance/release-audio/candidate-946d2f7/rehearsal.json)
