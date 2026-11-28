# Production Web flight repeat after PR #97

**33/34 frozen dispositions met on merged source `ac943acd6a2c6d21431aa138327bc3e64ed8552f`.** The runners measured 34 matrix cases and 5 original shipped worlds. The application reported version 0.11.0. [Merged source](https://github.com/styayur/Skimmer-Scraper/commit/ac943acd6a2c6d21431aa138327bc3e64ed8552f) · [Official main build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129442515) · [Hosted flight run](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129621281)

The production HTML loaded `/assets/index-yT2wa0pU.js`, 1,307,632 bytes with SHA-256 `176ab1ccad4a48f9aad5a73ca7f99c06d409807db34f5f797c3ad5ccc7a6483a`. All 105 digests from the independently downloaded main-push ZIP matched the runners’ served distribution and the separately staged site. GitHub artifact 15256573631 contains 5,578,012 bytes, SHA-256 `65f99fab675febfe9f21d8c42b9f0b3ef7d71f7d97780a14e358ba6ba9943038`. [Official archive receipt](archive-receipt.json) · [Hosted file manifest](SHA256SUMS) · [Staged-site seal](served-files.json)

The JavaScript entry matched #92 byte for byte. The two 105-file distributions differ at `build-info.json` and `index.html`. Source tree `cb5158950278ead4c800c54dfee7dd360acff798` differs from #92 in `tests/unit/partnerWorlds.test.ts`. The independently staged site has tree seal `1d1b6776332750e6e171e4e05ff61b76b1aaea048aa555b18cbe248bb32831c4`. [Source and distribution comparison](staged-distribution.json)

Compared directly with the earlier `c4bc8eac` Web run, 39/39 complete flight traces and 39/39 metric sets matched. The comparison checks raw report hashes, geometry, saved layout, controller inputs, browser version and every sampled simulation time. The earlier 34+5 receipt remains at `e6ee8e90`. [Comparison for every flight](compare-c4bc8eac.json) · [Original receipt](https://github.com/styayur/Skimmer-Scraper/blob/e6ee8e90def33f4430aed783cc61fb0a079450b1/acceptance/final-web-011/RESULTS.md)

Mandatory captures and releases met 10/10 gates, required refusals met 5/5, and difficult routes met 18/19. Across the matrix the game recorded 0 shield strikes and 0 rows with sampled hull intrusion. [Measured observations](measurement.json)

Ribbon 104729 boost remained in continuous sampled glide for 182.904 m, detached on LB and reached a minimum sampled center-to-solid distance of 5.235 m. [104729 boost flight](holdout/ribbon-bridge-104729-boost.json)

**s-curve-661077278-cruise** recorded `contact-lost` and missed its `may-reject` gate. It was in `RECOVERY` at the 2.300 s release sample and recorded 0 shield impacts. The next free-flight sample was at 2.367 s. [Raw flight](third-holdout/s-curve-661077278-cruise.json)

## Matrix

### Development · 14/14

| Case and raw trace | Frozen disposition | Observed outcome | Gate | Active LB release | Strikes | Longest glide (m) | Min. center-to-solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-8131-cruise](development/ribbon-bridge-8131-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 156.711 | 4.740 |
| [ribbon-bridge-8132-boost](development/ribbon-bridge-8132-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 181.768 | 5.235 |
| [s-curve-10243-cruise](development/s-curve-10243-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 114.266 | 6.003 |
| [helix-18731-boost](development/helix-18731-boost.json) | may-reject | contact-lost | met | no | 0 | 120.931 | 5.859 |
| [sky-arch-25057-cruise](development/sky-arch-25057-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 164.968 | 6.000 |
| [bowl-31607-boost](development/bowl-31607-boost.json) | may-reject | glide-and-release | met | yes | 0 | 159.904 | 4.823 |
| [tunnel-40751-cruise](development/tunnel-40751-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 165.714 | 6.000 |
| [ribbon-bridge-48947-cruise](development/ribbon-bridge-48947-cruise.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |
| [s-curve-55001-boost](development/s-curve-55001-boost.json) | may-reject | contact-lost | met | no | 0 | 82.273 | 5.975 |
| [helix-62819-cruise](development/helix-62819-cruise.json) | may-reject | contact-lost | met | no | 0 | 122.799 | 5.933 |
| [sky-arch-71023-boost](development/sky-arch-71023-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.486 | 4.840 |
| [bowl-79757-cruise](development/bowl-79757-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 166.529 | 5.940 |
| [tunnel-87337-boost](development/tunnel-87337-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |
| [ribbon-bridge-95603-cruise](development/ribbon-bridge-95603-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 109.885 | 5.362 |

### First holdout · 6/6

| Case and raw trace | Frozen disposition | Observed outcome | Gate | Active LB release | Strikes | Longest glide (m) | Min. center-to-solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-104729-boost](holdout/ribbon-bridge-104729-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 182.904 | 5.235 |
| [s-curve-112909-cruise](holdout/s-curve-112909-cruise.json) | may-reject | contact-lost | met | no | 0 | 88.230 | 5.846 |
| [helix-120011-cruise](holdout/helix-120011-cruise.json) | may-reject | contact-lost | met | no | 0 | 127.284 | 5.951 |
| [sky-arch-131071-boost](holdout/sky-arch-131071-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.487 | 4.834 |
| [bowl-140053-cruise](holdout/bowl-140053-cruise.json) | may-reject | glide-and-release | met | yes | 0 | 166.529 | 5.941 |
| [tunnel-150001-boost](holdout/tunnel-150001-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

### Second holdout · 8/8

| Case and raw trace | Frozen disposition | Observed outcome | Gate | Active LB release | Strikes | Longest glide (m) | Min. center-to-solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-741401678-cruise](second-holdout/ribbon-bridge-741401678-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 111.768 | 4.206 |
| [ribbon-bridge-936778437-boost](second-holdout/ribbon-bridge-936778437-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 182.483 | 5.008 |
| [ribbon-bridge-1753094196-cruise](second-holdout/ribbon-bridge-1753094196-cruise.json) | must-succeed | glide-and-release | met | yes | 0 | 154.937 | 5.302 |
| [s-curve-873882295-cruise](second-holdout/s-curve-873882295-cruise.json) | may-reject | contact-lost | met | no | 0 | 88.231 | 5.855 |
| [bowl-1085831800-boost](second-holdout/bowl-1085831800-boost.json) | may-reject | glide-and-release | met | yes | 0 | 159.904 | 4.823 |
| [helix-798281854-cruise](second-holdout/helix-798281854-cruise.json) | may-reject | contact-lost | met | no | 0 | 127.266 | 5.938 |
| [sky-arch-459273010-boost](second-holdout/sky-arch-459273010-boost.json) | may-reject | glide-and-release | met | yes | 0 | 237.486 | 4.840 |
| [tunnel-1623444429-boost](second-holdout/tunnel-1623444429-boost.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

### Public third holdout · 5/6

| Case and raw trace | Frozen disposition | Observed outcome | Gate | Active LB release | Strikes | Longest glide (m) | Min. center-to-solid (m) |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| [ribbon-bridge-2146666385-boost](third-holdout/ribbon-bridge-2146666385-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 133.501 | 5.252 |
| [ribbon-bridge-1566703471-boost](third-holdout/ribbon-bridge-1566703471-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 181.603 | 5.196 |
| [ribbon-bridge-1360618348-boost](third-holdout/ribbon-bridge-1360618348-boost.json) | must-succeed | glide-and-release | met | yes | 0 | 183.673 | 4.358 |
| [s-curve-661077278-cruise](third-holdout/s-curve-661077278-cruise.json) | may-reject | contact-lost | miss | no | 0 | 92.793 | 5.956 |
| [helix-699134824-boost](third-holdout/helix-699134824-boost.json) | may-reject | contact-lost | met | no | 0 | 120.902 | 5.890 |
| [sky-arch-1173553645-cruise](third-holdout/sky-arch-1173553645-cruise.json) | must-reject | capture-missed | met | no | 0 | 0.000 | — |

## Five shipped worlds

These five original exports used neutral cruise, three companions, the authored spawn, and LB pulses at intervals 4 and 48. The outcomes below are descriptive. [Merged readback](shipped/readback.json) · [Official stock reference](../shipped-stock/readback.json)

| World and raw trace | Stock | Rollout | Active release | Strikes | Layout restored | Exact trace vs. #92 |
| --- | --- | --- | --- | ---: | --- | --- |
| [Canopy](shipped/canopy.json) | capture-missed | capture-missed | no | 0 | yes | yes |
| [Caldera](shipped/caldera.json) | capture-missed | capture-missed | no | 0 | yes | yes |
| [Lattice](shipped/lattice.json) | capture-missed | capture-missed | no | 0 | yes | yes |
| [Contact Deck](shipped/contact.json) | glide-and-release | glide-and-release | yes | 0 | yes | yes |
| [Relay District](shipped/district.json) | contact-lost | contact-lost | no | 0 | yes | yes |

## Measurement scope

The real game imported the frozen GLB, saved and reopened its layout, received standard gamepad input and returned to the built-in world. The revision-2 matrix used harness `d66b343cdd88d7d499e77afa4a63e8e3594f2813` and input archive SHA-256 `d996f98c1f112fa8d793bace4a56c6233ad93c4d64663cb5477b4ef23f30617b`. Chromium 153.0.8010.12 used SwiftShader at 640 × 360. The game simulated at 120 Hz. The replay sampled every 64 ms through 16 intervals after release. Glide distances are sampled chords. All four panels had been disclosed before this production repeat. [Frozen input manifest](../../inputs.json) · [Pinned scoring rules](https://github.com/styayur/Skimmer-Scraper/blob/d66b343cdd88d7d499e77afa4a63e8e3594f2813/scripts/flight_bench_metrics.py)

The original comparator scored the three published sets on their frozen inputs. [First 20](compare-development-holdout.json) · [Second eight](compare-second-holdout.json) · [Third six](compare-third-holdout.json) · [Hosted job and artifact receipts](hosted-run.json)
