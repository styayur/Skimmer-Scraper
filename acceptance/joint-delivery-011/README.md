# Physical Switchyard flight and hardware results

The pilot flew Switchyard from the official Web build of game source `ac943acd6a2c6d21431aa138327bc3e64ed8552f` after the four foreground runs. Using the default layout, the pilot reported a successful LB capture and active release with no other issue. They identified the controller as the same one used previously. The earlier device receipt names an Xbox 360 Controller with standard XInput mapping. The current report contains the player's observation. It has no per-button timestamps. [Physical trial](physical-switchyard-ac943ac.json) · [Earlier controller identification](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/acceptance/v092/physical-scope.json)

On the same 1920 × 1080 High route, with three wingmates and default music, the official Web and Windows builds at `ac943acd` missed the original mean-FPS target. Windows also missed its p95 target. [Original frame intervals and preregistered measurement protocol](https://github.com/styayur/Skimmer-Scraper/tree/52ffe404e3572d852a39ec9ae18d997f7f31c531/acceptance/foreground-qualification/controlled-repeat)

| Platform | v0.10.0 mean FPS | Candidate mean FPS | v0.10.0 p95 | Candidate p95 |
| --- | ---: | ---: | ---: | ---: |
| Web | 109.19 | 100.54 | 16.7 ms | 16.7 ms |
| Windows | 106.66 | 96.47 | 10.2 ms | 11.8 ms |

The offline comparison matches nonbuffering samples on the same seed, draw-call and triangle count, render objects, collision triangles and resident chunks. The median ratio of candidate to stock GPU timing was 1.092 across 293 Web groups and 1.115 across 301 Windows groups. Web per-frame renderer script time decreased, while Windows per-frame script time increased. The Web runs were separated by the test-only source correction and rebuild. The Windows runs were adjacent. GPU frequencies and temperatures were unavailable in the original records. [Web analysis](ac943ac-web-performance-diagnosis.json) · [Windows analysis](ac943ac-windows-performance-diagnosis.json) · [Build and test runs](ac943ac-hosted-runs.json)

To recalculate, check out the raw measurement commit above. Run the following commands in that checkout using Python 3.11 or later. Set `ANALYSIS` to the absolute path of the supplied Python script, and select new output filenames. The script verifies the compressed raw digest, total frames and reported FPS before deriving the summaries. The `focus` field records whether foreground focus was lost.

```sh
root=acceptance/foreground-qualification/controlled-repeat
python "$ANALYSIS" "$root/stock/web" "$root/final/web" web-analysis.json
python "$ANALYSIS" "$root/stock/windows" "$root/final/windows" windows-analysis.json
```

The next main candidate, `67a56870`, includes the free-flight relay query and HUD updates. Its official Linux-built Web archive contains 105 files. The JavaScript entry and 102 other files match the earlier paired experimental build. Only the two files that identify the build differ. The consumer also verified the producer's v0.4.0 tag and the 18 checksummed inputs. [Source, build and file comparisons](merged-67a5687-identity.json) · [Main build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141030022)
