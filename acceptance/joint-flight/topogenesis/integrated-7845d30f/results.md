# Paired flight dispositions

The revised client used source `7845d30fcd428dbff50c5d45ba1c893ee7a3bf3b` and JavaScript SHA-256 `687b453f76c6d59c857af580c28838ba2ef0d4d9f79466edfb14949efaf99994`. Its last prescribed trace completed at 06:10:53 UTC on 28 November 2026. Every pair matched on the GLB digest and byte count, layout, input schedule and every sampled simulation time.

A difficult route can meet its disposition by returning to FLIGHT before the scheduled release after losing contact. The observed outcome in both cases can be `contact-lost`. The gate column preserves the expected behavior and each result gives the actual disposition decision and outcome.

## Original development

| Revised trace | Gate | Stock 991138b8 | Initial 0a5272b3 | Revised 7845d30f |
| --- | --- | --- | --- | --- |
| [ribbon-bridge 8131 cruise](development/ribbon-bridge-8131-cruise.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | met · glide-and-release |
| [ribbon-bridge 8132 boost](development/ribbon-bridge-8132-boost.json) | must-succeed | met · glide-and-release | **failed** · impact | met · glide-and-release |
| [s-curve 10243 cruise](development/s-curve-10243-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [helix 18731 boost](development/helix-18731-boost.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 25057 cruise](development/sky-arch-25057-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 31607 boost](development/bowl-31607-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [tunnel 40751 cruise](development/tunnel-40751-cruise.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 48947 cruise](development/ribbon-bridge-48947-cruise.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed |
| [s-curve 55001 boost](development/s-curve-55001-boost.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost |
| [helix 62819 cruise](development/helix-62819-cruise.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 71023 boost](development/sky-arch-71023-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 79757 cruise](development/bowl-79757-cruise.json) | may-reject | **failed** · impact | **failed** · impact | **failed** · impact |
| [tunnel 87337 boost](development/tunnel-87337-boost.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed |
| [ribbon-bridge 95603 cruise](development/ribbon-bridge-95603-cruise.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | met · glide-and-release |

## Original holdouts

| Revised trace | Gate | Stock 991138b8 | Initial 0a5272b3 | Revised 7845d30f |
| --- | --- | --- | --- | --- |
| [ribbon-bridge 104729 boost](holdout/ribbon-bridge-104729-boost.json) | must-succeed | met · glide-and-release | **failed** · contact-lost | **failed** · impact |
| [s-curve 112909 cruise](holdout/s-curve-112909-cruise.json) | may-reject | **failed** · contact-lost | met · contact-lost | met · contact-lost |
| [helix 120011 cruise](holdout/helix-120011-cruise.json) | may-reject | met · contact-lost | met · contact-lost | met · contact-lost |
| [sky-arch 131071 boost](holdout/sky-arch-131071-boost.json) | may-reject | met · glide-and-release | met · glide-and-release | met · glide-and-release |
| [bowl 140053 cruise](holdout/bowl-140053-cruise.json) | may-reject | **failed** · impact | **failed** · impact | **failed** · impact |
| [tunnel 150001 boost](holdout/tunnel-150001-boost.json) | must-reject | met · capture-missed | met · capture-missed | met · capture-missed |

## Independent second holdout

The eight precommitted inputs first ran after the revised controller freeze. Stock met seven gates and the revised controller met eight. Neither build recorded a shield strike or a sampled hull intrusion on this panel.

| Revised trace | Gate | Stock 991138b8 | Revised 7845d30f |
| --- | --- | --- | --- |
| [ribbon-bridge 741401678 cruise](second-holdout/ribbon-bridge-741401678-cruise.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 936778437 boost](second-holdout/ribbon-bridge-936778437-boost.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [ribbon-bridge 1753094196 cruise](second-holdout/ribbon-bridge-1753094196-cruise.json) | must-succeed | met · glide-and-release | met · glide-and-release |
| [s-curve 873882295 cruise](second-holdout/s-curve-873882295-cruise.json) | may-reject | **failed** · contact-lost | met · contact-lost |
| [bowl 1085831800 boost](second-holdout/bowl-1085831800-boost.json) | may-reject | met · glide-and-release | met · glide-and-release |
| [helix 798281854 cruise](second-holdout/helix-798281854-cruise.json) | may-reject | met · contact-lost | met · contact-lost |
| [sky-arch 459273010 boost](second-holdout/sky-arch-459273010-boost.json) | may-reject | met · glide-and-release | met · glide-and-release |
| [tunnel 1623444429 boost](second-holdout/tunnel-1623444429-boost.json) | must-reject | met · capture-missed | met · capture-missed |

## Original holdout 104729

The original held-out boost ribbon stayed in its published denominator. On the revised client it held GLIDING through the release press at sample 48. DETACHING was first observed at 3.1333 s and FLIGHT at 3.3250 s. At sample 58 (3.7083 s) the nearest solid was 3.383 m from the aircraft centre, speed was 89.655 m/s and the shield counter was zero. At sample 59 (3.7750 s) the counter reached one, speed was 53.071 m/s and vertical velocity was +20.316 m/s. The sampled interval brackets fixed steps 446–453. Stock released with zero strikes. The first integrated controller lost contact before the release press. [Revised trace](holdout/ribbon-bridge-104729-boost.json)

The [original comparison](comparison.json), [independent comparison](second-comparison.json) and [UTC completion record](evaluation.json) retain the underlying decisions and sample metrics.
