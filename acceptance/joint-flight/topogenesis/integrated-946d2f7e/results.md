# Paired dispositions on the departure correction

The 1,307,632-byte JavaScript entry on clean integrated source `946d2f7e8381f9f9af68a0cf7e488ac41debde04` has SHA-256 `a700cba1c3cca8ed755c31809aeb05a4c2f874c5d623c7948dc3a8d81b849a4c`. The last of the 34 revised traces completed at 2026-11-28T06:35:09+00:00. The comparison checks actual GLB bytes, layout, input schedule and every sampled simulation time against stock.

The 20 original inputs and subsequently revealed eight were available before this controller freeze. Their results are historical regression comparisons. The six third-panel inputs and the exact GLB byte counts and hashes were committed before the motion-program change and verified before disclosure. A difficult case with observed outcome `contact-lost` can meet the frozen safe-exit timing. Each row reports both the outcome and the disposition decision.

## Original development

| Trace | Disposition | Stock 991138b8 | Initial 0a5272b3 | Revised 7845d30f | Departure correction 946d2f7e |
| --- | --- | --- | --- | --- | --- |
| [ribbon-bridge 8131 cruise](development/ribbon-bridge-8131-cruise.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 8132 boost](development/ribbon-bridge-8132-boost.json) | must-succeed | met · glide-and-release | **failed** · impact | met · glide-and-release | met · glide-and-release |
| [s-curve 10243 cruise](development/s-curve-10243-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [helix 18731 boost](development/helix-18731-boost.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 25057 cruise](development/sky-arch-25057-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 31607 boost](development/bowl-31607-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [tunnel 40751 cruise](development/tunnel-40751-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 48947 cruise](development/ribbon-bridge-48947-cruise.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed | met · capture-missed |
| [s-curve 55001 boost](development/s-curve-55001-boost.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost | met · contact-lost |
| [helix 62819 cruise](development/helix-62819-cruise.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 71023 boost](development/sky-arch-71023-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 79757 cruise](development/bowl-79757-cruise.json) | may-reject | **failed** · impact | **failed** · impact | **failed** · impact | met · glide-and-release |
| [tunnel 87337 boost](development/tunnel-87337-boost.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed | met · capture-missed |
| [ribbon-bridge 95603 cruise](development/ribbon-bridge-95603-cruise.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | met · glide-and-release | met · glide-and-release |

## Original holdouts, now known

| Trace | Disposition | Stock 991138b8 | Initial 0a5272b3 | Revised 7845d30f | Departure correction 946d2f7e |
| --- | --- | --- | --- | --- | --- |
| [ribbon-bridge 104729 boost](holdout/ribbon-bridge-104729-boost.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | **failed** · impact | met · glide-and-release |
| [s-curve 112909 cruise](holdout/s-curve-112909-cruise.json) | may-reject | **failed** · contact-lost | met · contact-lost | met · contact-lost | met · contact-lost |
| [helix 120011 cruise](holdout/helix-120011-cruise.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 131071 boost](holdout/sky-arch-131071-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 140053 cruise](holdout/bowl-140053-cruise.json) | may-reject | **failed** · impact | **failed** · impact | **failed** · impact | met · glide-and-release |
| [tunnel 150001 boost](holdout/tunnel-150001-boost.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed | met · capture-missed |

## Previously revealed second panel

| Trace | Disposition | Stock 991138b8 | Revised 7845d30f | Departure correction 946d2f7e |
| --- | --- | --- | --- | --- |
| [ribbon-bridge 741401678 cruise](second-holdout/ribbon-bridge-741401678-cruise.json) | must-succeed | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 936778437 boost](second-holdout/ribbon-bridge-936778437-boost.json) | must-succeed | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 1753094196 cruise](second-holdout/ribbon-bridge-1753094196-cruise.json) | must-succeed | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [s-curve 873882295 cruise](second-holdout/s-curve-873882295-cruise.json) | may-reject | **failed** · contact-lost | met · contact-lost | met · contact-lost |
| [bowl 1085831800 boost](second-holdout/bowl-1085831800-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [helix 798281854 cruise](second-holdout/helix-798281854-cruise.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 459273010 boost](second-holdout/sky-arch-459273010-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [tunnel 1623444429 boost](second-holdout/tunnel-1623444429-boost.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed |

## Independent third panel

| Trace | Disposition | Stock 991138b8 | Departure correction 946d2f7e |
| --- | --- | --- | --- |
| [ribbon-bridge 2146666385 boost](third-holdout/ribbon-bridge-2146666385-boost.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 1566703471 boost](third-holdout/ribbon-bridge-1566703471-boost.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 1360618348 boost](third-holdout/ribbon-bridge-1360618348-boost.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [s-curve 661077278 cruise](third-holdout/s-curve-661077278-cruise.json) | may-reject | **failed** · contact-lost | **failed** · contact-lost |
| [helix 699134824 boost](third-holdout/helix-699134824-boost.json) | may-reject | met · contact-lost | met · contact-lost |
| [sky-arch 1173553645 cruise](third-holdout/sky-arch-1173553645-cruise.json) | must-reject | met · capture-missed | met · capture-missed |

The only missed gate on this candidate was third-panel oblique cruise S-curve 661077278. At the 2.300 s release sample it was still in RECOVERY. It entered FLIGHT at 2.367 s and recorded zero impacts. Its sampled glide was 92.793 m and its minimum sampled solid distance was 5.956 m. Stock missed this same frozen timing gate. [Raw S-curve trace](third-holdout/s-curve-661077278-cruise.json)

The four originally mandatory ribbons were checked first. Seed 104729 was a known regression case by this run. The [four release records](mandatory.json) give the individual completion times and trace paths. The [original](comparison.json), [second](second-comparison.json) and [third](third-comparison.json) machine-readable comparisons retain per-case phase, clearance, impact and release evidence. The [evaluation record](evaluation.json) gives timestamps and aggregate counts.
