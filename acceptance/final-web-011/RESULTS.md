# Merged production Web flight results

**33/34 matrix dispositions met.** The hosted runners recorded 34 trajectories and 5 additional shipped-world flights. The merged source is `c4bc8eac5425197ebb08c937316de415e75b89b1`. Its HTML loads `/assets/index-yT2wa0pU.js`, 1,307,632 bytes with SHA-256 `176ab1ccad4a48f9aad5a73ca7f99c06d409807db34f5f797c3ad5ccc7a6483a`. [Merged source](https://github.com/styayur/Skimmer-Scraper/commit/c4bc8eac5425197ebb08c937316de415e75b89b1) · [Main build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46120797244) · [Staged artifact](https://github.com/styayur/Skimmer-Scraper/actions/runs/46120797244/artifacts/15253217309) · [Browser run](https://github.com/styayur/Skimmer-Scraper/actions/runs/46120953678)

Every case used the original GLB, saved layout, controls, companion count and sample times. All 34 trajectories matched the swept-release build `946d2f7e` sample for sample, with zero shield strikes and zero sampled hull intrusions. All ten mandatory ribbons released cleanly and all five required refusals met their gates. Eighteen of the nineteen difficult cases met their assigned disposition. Each case completed on its first attempt. [34 checked observations](results/main-c4bc8eac/measurement.json) · [Distribution manifest](results/main-c4bc8eac/SHA256SUMS) · [Archive and runner provenance](results/main-c4bc8eac/hosted-run.json)

**S-curve 661077278 cruise** missed its `may-reject` gate. The game entered `GLIDING` at 0.700 s and `REACQUIRE` at 2.042 s. It was still in `RECOVERY` at the 2.300 s release sample, then returned to `FLIGHT` at 2.367 s with zero strikes. [Raw S-curve flight](results/main-c4bc8eac/third-holdout/s-curve-661077278-cruise.json)

**Ribbon 104729 boost** held for 182.904 m of continuous sampled glide and detached on the scheduled LB pulse. Its minimum sampled center-to-solid distance was 5.235 m, and its end speed was 1.303 times its pre-release speed. The original ridge candidate had recorded a shield strike on these same bytes and inputs. [Merged 104729 flight](results/main-c4bc8eac/holdout/ribbon-bridge-104729-boost.json) · [Original ridge flight](https://github.com/styayur/Skimmer-Scraper/blob/d66b343cdd88d7d499e77afa4a63e8e3594f2813/acceptance/joint-flight/topogenesis/integrated-7845d30f/holdout/ribbon-bridge-104729-boost.json)

## Frozen matrix

Each raw report includes the complete flight trace. Distances are the longest continuous sampled glide and the minimum sampled center-to-solid distance, in metres. A difficult row can meet its disposition after a safe refusal or exit.

### Development · 14/14 dispositions met

| Case and trace | Frozen gate | Final outcome | Met | Active LB release | Strikes | Glide (m) | Min. solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-8131-cruise](results/main-c4bc8eac/development/ribbon-bridge-8131-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 156.711 | 4.740 |
| [ribbon-bridge-8132-boost](results/main-c4bc8eac/development/ribbon-bridge-8132-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 181.768 | 5.235 |
| [s-curve-10243-cruise](results/main-c4bc8eac/development/s-curve-10243-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 114.266 | 6.003 |
| [helix-18731-boost](results/main-c4bc8eac/development/helix-18731-boost.json) | may-reject | contact-lost | met | no | 0 | 120.931 | 5.859 |
| [sky-arch-25057-cruise](results/main-c4bc8eac/development/sky-arch-25057-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 164.968 | 6.000 |
| [bowl-31607-boost](results/main-c4bc8eac/development/bowl-31607-boost.json) | may-reject | glide-and-release | met | yes | 0 | 159.904 | 4.823 |
| [tunnel-40751-cruise](results/main-c4bc8eac/development/tunnel-40751-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 165.714 | 6.000 |
| [ribbon-bridge-48947-cruise](results/main-c4bc8eac/development/ribbon-bridge-48947-cruise.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |
| [s-curve-55001-boost](results/main-c4bc8eac/development/s-curve-55001-boost.json) | may-reject | contact-lost | met | no | 0 | 82.273 | 5.975 |
| [helix-62819-cruise](results/main-c4bc8eac/development/helix-62819-cruise.json) | may-reject | contact-lost | met | no | 0 | 122.799 | 5.933 |
| [sky-arch-71023-boost](results/main-c4bc8eac/development/sky-arch-71023-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.486 | 4.840 |
| [bowl-79757-cruise](results/main-c4bc8eac/development/bowl-79757-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 166.529 | 5.940 |
| [tunnel-87337-boost](results/main-c4bc8eac/development/tunnel-87337-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |
| [ribbon-bridge-95603-cruise](results/main-c4bc8eac/development/ribbon-bridge-95603-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 109.885 | 5.362 |

### Original holdout · 6/6 dispositions met

| Case and trace | Frozen gate | Final outcome | Met | Active LB release | Strikes | Glide (m) | Min. solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-104729-boost](results/main-c4bc8eac/holdout/ribbon-bridge-104729-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 182.904 | 5.235 |
| [s-curve-112909-cruise](results/main-c4bc8eac/holdout/s-curve-112909-cruise.json) | may-reject | contact-lost | met | no | 0 | 88.230 | 5.846 |
| [helix-120011-cruise](results/main-c4bc8eac/holdout/helix-120011-cruise.json) | may-reject | contact-lost | met | no | 0 | 127.284 | 5.951 |
| [sky-arch-131071-boost](results/main-c4bc8eac/holdout/sky-arch-131071-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.487 | 4.834 |
| [bowl-140053-cruise](results/main-c4bc8eac/holdout/bowl-140053-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 166.529 | 5.941 |
| [tunnel-150001-boost](results/main-c4bc8eac/holdout/tunnel-150001-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

### Second holdout · 8/8 dispositions met

| Case and trace | Frozen gate | Final outcome | Met | Active LB release | Strikes | Glide (m) | Min. solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-741401678-cruise](results/main-c4bc8eac/second-holdout/ribbon-bridge-741401678-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 111.768 | 4.206 |
| [ribbon-bridge-936778437-boost](results/main-c4bc8eac/second-holdout/ribbon-bridge-936778437-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 182.483 | 5.008 |
| [ribbon-bridge-1753094196-cruise](results/main-c4bc8eac/second-holdout/ribbon-bridge-1753094196-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 154.937 | 5.302 |
| [s-curve-873882295-cruise](results/main-c4bc8eac/second-holdout/s-curve-873882295-cruise.json) | may-reject | contact-lost | met | no | 0 | 88.231 | 5.855 |
| [bowl-1085831800-boost](results/main-c4bc8eac/second-holdout/bowl-1085831800-boost.json) | may-reject | glide-and-release | met | yes | 0 | 159.904 | 4.823 |
| [helix-798281854-cruise](results/main-c4bc8eac/second-holdout/helix-798281854-cruise.json) | may-reject | contact-lost | met | no | 0 | 127.266 | 5.938 |
| [sky-arch-459273010-boost](results/main-c4bc8eac/second-holdout/sky-arch-459273010-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.486 | 4.840 |
| [tunnel-1623444429-boost](results/main-c4bc8eac/second-holdout/tunnel-1623444429-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

### Public third holdout · 5/6 dispositions met

| Case and trace | Frozen gate | Final outcome | Met | Active LB release | Strikes | Glide (m) | Min. solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-2146666385-boost](results/main-c4bc8eac/third-holdout/ribbon-bridge-2146666385-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 133.501 | 5.252 |
| [ribbon-bridge-1566703471-boost](results/main-c4bc8eac/third-holdout/ribbon-bridge-1566703471-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 181.603 | 5.196 |
| [ribbon-bridge-1360618348-boost](results/main-c4bc8eac/third-holdout/ribbon-bridge-1360618348-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 183.673 | 4.358 |
| [s-curve-661077278-cruise](results/main-c4bc8eac/third-holdout/s-curve-661077278-cruise.json) | may-reject | contact-lost | miss | no | 0 | 92.793 | 5.956 |
| [helix-699134824-boost](results/main-c4bc8eac/third-holdout/helix-699134824-boost.json) | may-reject | contact-lost | met | no | 0 | 120.902 | 5.890 |
| [sky-arch-1173553645-cruise](results/main-c4bc8eac/third-holdout/sky-arch-1173553645-cruise.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

## Five original shipped worlds

These five flights used neutral cruise with three companions, pulsed LB at interval 4 and requested release at interval 48. Official stock and the hosted merged build used the same script and original exported bytes. All five restored the saved layout and returned to the built-in world. All five outcomes matched stock. Canopy, Caldera and Relay District also matched the entire stock trajectory. [Stock readback](results/shipped-stock/readback.json) · [Merged readback](results/main-c4bc8eac/shipped/readback.json)

| World and raw trace | Stock outcome | Final outcome | Capture | Active release | Strikes | Longest glide (m) | Saved layout restored |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| [Canopy](results/main-c4bc8eac/shipped/canopy.json) | capture-missed | capture-missed | no | no | 0 | 0.000 | yes |
| [Caldera](results/main-c4bc8eac/shipped/caldera.json) | capture-missed | capture-missed | no | no | 0 | 0.000 | yes |
| [Lattice](results/main-c4bc8eac/shipped/lattice.json) | capture-missed | capture-missed | no | no | 0 | 0.000 | yes |
| [Contact Deck](results/main-c4bc8eac/shipped/contact.json) | glide-and-release | glide-and-release | yes | yes | 0 | 148.007 | yes |
| [Relay District](results/main-c4bc8eac/shipped/district.json) | contact-lost | contact-lost | yes | no | 0 | 0.000 | yes |

## Scope and reproduction

The main-push artifact ZIP has SHA-256 `0462eb26ce0aa3247873b4edefafdf93a1cded3c2e1c1254dac059896e46a163`. All 105 files matched the separately staged copy with tree seal `b2f1896879873d450b0e8a8b89c3874d8cd7609ebfd61c0de001a2c60845acdd`. Each hosted shard verified the clean source and complete distribution, then each browser measured its module response. [Archive receipt](results/staged-main/archive-receipt.json) · [Independent 105-file seal](results/staged-main/served-files.json)

The original comparator rechecked stock against the merged candidate separately for the first 20, second eight and final six flights. The public raw reports and archived GLBs preserve the evidence after the hosted artifacts expire. [First 20](results/main-c4bc8eac/compare-development-holdout.json) · [Second eight](results/main-c4bc8eac/compare-second-holdout.json) · [Final six](results/main-c4bc8eac/compare-third-holdout.json)

The panel had already been disclosed before this repeat. The earlier 33/34, the failed candidates and their actual tested source and entry digests remain in the historical record. The five shipped examples are outside the 34-case score. This evidence covers controlled Web flight, import and replay on the tested inputs. [Historical results and input provenance](README.md)
