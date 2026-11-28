export const chapters = {
  'guide-start': [
    "Quick start",
    "Select Start Game, press Enter or press A on the gamepad to take off. Your first flight starts in Free Flight with a chase camera, three wingmates and a shield. The aircraft flies forward on its own. Try gentle rolls, then boost through an open street canyon.",
    "Press F on the title screen to change flight settings. In flight, Esc pauses, C changes the view and T opens text radio. Press R to restart in the current world.",
    "Alt+Enter toggles fullscreen. Leaving fullscreen pauses flight. On Windows desktop, open the pause menu and choose Quit game to close the window.",
  ],
  'guide-flight': [
    "Keyboard flight controls",
    "Approaching danger? Press LB or Space. Let the surface become your escape route. For two seconds the aircraft searches ahead and to either side. A clear route can turn a late approach into a braking turn, a wall climb or an escape into open air. Use the wall to climb and approach the roof edge. Press the same button again to launch with your current momentum. Capturing a surface or changing course with assistance counts toward assisted records. W or ↑ pitches down, S or ↓ pitches up. A/D or ←/→ rolls, Q/E yaws and Shift boosts. Tap near buildings and hold a bank to change heading.",
    "Esc pauses or goes back, C changes view and R retries. F opens flight settings, G the world, M the hangar, H the Flight Guide and T the radio. Hold V to talk once voice input is enabled.",
    "Arm glide early on a clear approach. A steep wall can redirect your aircraft upward if there is room to turn. Follow the wall toward its roof for a corner transfer. A blocked route or a late toggle can still end in a collision. Arming alone keeps your current score category.",
  ],
  'guide-pad': [
    "Gamepad controls and remapping",
    "Use the left stick for pitch and roll, the right stick for yaw, RT to boost, Y to change view and X to retry. In menus, move with the D-pad or left stick, confirm with A and go back with B. Start/Menu pauses and Back/View opens the menu. Press left or right to adjust a selection or number.",
    "Open Controls and gamepad in Advanced settings. Start with Precision, sensitivity 1, curve 1.4, dead zone 0.14, auto-level assist 1 and coordinated turns enabled. Increase the dead zone if the stick drifts. Lower the dead zone or response curve if small movements feel sluggish. Axis inversion takes effect on the next input.",
    "Axis and button numbers start at zero. Standard pitch, roll and yaw axes are 1, 0 and 2. RT is button 7, Menu is 9 and View is 8. Assign an unused button for push-to-talk, or enter −1 to unbind it. Mappings save immediately. If the browser cannot see the controller, focus the game and press a controller button, then check the input device shown in settings.",
  ],
  'guide-modes': [
    "Free Flight and Surface Challenge",
    "Free Flight lets you explore away from buildings. In Surface Challenge, a collision or an expired grace period ends your run. Your personal best is saved locally.",
    "Press F on the title screen, select a mode, then take off. Start with Free Flight to learn the controls. The mode locks at takeoff and carries over when you retry.",
  ],
  'guide-rules': [
    "Shield, grace period and records",
    "In Surface Challenge, flying within 32 m of a qualifying surface holds the grace timer full. Leaving range starts the countdown. Returning within range refills it. Choose a grace period from 1 to 15 seconds. The standard is 5 seconds. A direct collision ends the run.",
    "In Free Flight the shield slows you down and pushes you away from an obstacle on impact. Standard solo runs, custom grace periods, assisted runs and runs with wingmates have separate records. Rule changes apply on the next takeoff. Select Surface Challenge to set a record.",
  ],
  'guide-view': [
    "Chase and cockpit views",
    "Chase follows behind the aircraft, keeping the airframe and nearby wingmates in view. Try it while learning the streets and formations. Cockpit looks forward from inside the aircraft and helps you line up windows and bridges.",
    "Press C or gamepad Y, or choose a view in flight settings. The change is immediate. If the model blocks your view, open Cockpit position to preview and adjust its anchor.",
  ],
  'guide-anchor': [
    "Cockpit presets and coordinates",
    "Open Cockpit position in Advanced settings. Start with Standard cockpit. Try Fighter for a short nose, Glider for a long, narrow aircraft, or Raised cockpit if the model blocks your view. Enable Live preview to check the position.",
    "Custom anchors use metres. X points right, Y points up and negative Z points forward. Each axis accepts −8 to 8 m. Save to apply the position to this aircraft. Changing aircraft restores its own saved anchor.",
  ],
  'guide-companions': [
    "Wingmates, formations and tasks",
    "KITE-1 is the navigator in cyan, KITE-2 the guardian in gold, and KITE-3 the explorer in rose. Local wingmates follow, avoid obstacles and regroup. Start with three in a wedge. Use a line for narrow passages or spread out over open ground.",
    "Choose the number of wingmates before launch. Advanced settings offer formation follow, independent follow and KITE-1 leading. Give orders by radio during flight. Wingmates return safely when they fall behind. Call everyone back together before a tight passage.",
    "Address each wingmate to split the work. Try “KITE-1 find a passage; KITE-2 escort; KITE-3 inspect the island”. An inspection needs a nearby observed landmark. Ask a wingmate to patrol, find a glide surface or wait 5 seconds and regroup. A new order replaces the previous task for that wingmate.",
  ],
  'guide-world': [
    "World generation, seeds and memory",
    "Press G to choose a world theme and enter a number or text seed, or generate a random seed. Copy seed saves the input to your clipboard. Select Generate and reload to apply it. WorldForge builds rock passages from the seed. The hangar includes the KITE-W wingsuit and KITE-S micro aircraft. Legacy links restore their seed, world mode and generator.",
    "Choose Stable world to repeat a route. In an Ephemeral world, parts of the city change after a chunk unloads completely. The page remembers the last 256 unloaded chunks. Reloading starts a fresh session.",
  ],
  'guide-dragonspine': [
    "Dragonspine and the Crownback",
    "Choose Dragonspine in World theme. Follow bright rock strata from the valley to stone arches and stacked passages. Beyond the gorge, climb past the broken bridge to the cloud sea. The main citadel’s ring court leads to the underside of its island. A side tunnel cuts through the eastern rock mass. Flight continues above the clouds.",
    "The Crownback takes off from its nest platform, glides along the ridge and circles home. Its wings span two chunks. Watch the wing bones and sweeping tail as you approach. Legacy seed links open Dragonspine. The original map assets and records can be used in v0.8.2.",
  ],
  'guide-sky': [
    "Sky Inversion and the mirror city",
    "The mirror city is a distant skyline whose colors and layout follow the sky and seed. Fly against the solid surfaces in your current world for collisions and proximity.",
    "In the procedural city, climb through 520 m to trigger Sky Inversion. The inversion and dive carry you into a new world. Select Full or Fast transitions in Advanced settings. Fast shortens the rotation and waits for exit collision geometry and formation before the dive. Use reduced effects for a gentler rotation. Complete five crossings in a row to unlock the fifth-sky marker.",
  ],
  'guide-dragon': [
    "Dragonspine world packs",
    "The web and desktop editions share terrain, routes and seeds. On Windows, open World library to download the official high-detail pack or select a folder containing world-pack.json. Each chunk is verified. Select Enter world after installation. You can verify, repair or remove a local copy. Cancelling a download preserves the previous copy. In Windows desktop settings, choose a new library folder, export or import records and settings, or check for a release. Export imported GLBs separately from the world menu.",
  ],
  'guide-aircraft': [
    "Importing GLB aircraft",
    "Press M and choose a self-contained GLB 2.0 aircraft. Aim for under 48 MB and 250,000 triangles and embed the textures. Select the imported aircraft in the hangar. If it faces backwards, rotate it 180° and check the cockpit preview.",
    "The browser stores up to 24 imported aircraft. Select the built-in KITE-07 to return to the original. Removing a local copy also removes its hangar entry.",
  ],
  'guide-import': [
    "Importing and saving GLB worlds",
    "For a V2Wpro world, press G, choose a catalog entry and check its source and SHA-256. Confirm the download to inspect the scene, then activate it. Download exact layout saves text you can paste into World seed with the same GLB. Download player flight diagnostic saves the latest flight in that world to your device.",
    "Open Local GLB worlds, select or drop a self-contained GLB, then choose Analyze scene. Start with scale 1, Y up and an automatic spawn. Check orientation and collision geometry before activating. Scale accepts 0.001 to 1000 and the file limit is 128 MB.",
    "Enable local saving to reopen the world in this browser. The library holds six cities and 256 MB total. If you collide at takeoff, check scale and orientation, then choose an open spawn and heading. Re-export damaged files or externally linked resources as an embedded GLB.",
  ],
  'guide-motion': [
    "Animation, paths and collision roles",
    "After analysis, choose an animation clip, loop playback or use the reference pose. Rigid colliders follow the animation. Skinned and morph meshes use reference-pose collision. Preview before takeoff and show collision geometry to inspect the motion.",
    "Start a mesh round trip with a small offset and a period of a few seconds. Offsets use the original coordinates of the mesh parent. The period accepts 0.25 to 300 seconds. Set runways and building faces to Glide surface, barriers to Collision only and visual details to Decoration. Activate the world to rebuild its index.",
  ],
  'guide-variants': [
    "World variants and replay",
    "With a local GLB active, press G and select Generate new variant to explore a different route. Separate islands or buildings can move, while linked bridges move together. Merged or animated cities retain their structure and vary in scale, heading and takeoff route. Take off from the title screen when generation finishes.",
    "Select Keep this world to retain a route. Saved cities rebuild on refresh. An unpinned world gets a new variant. Copy seed copies the full layout code. When replaying in another browser, select the matching original GLB and choose Analyze scene if prompted.",
    "Procedural cities accept ordinary numbers and text seeds. Use Stable world to replay a route or Ephemeral world to explore changing blocks.",
  ],
  'guide-radio': [
    "Text radio and wingmate orders",
    "Press T and try “KITE-2 scout left”, “regroup all”, “KITE-1 lead”, “hold formation” or “find a safe route”. Send to resume flight. Read the reply in subtitles or radio history. All orders follow the same local flight and avoidance rules.",
    "The local radio understands common orders offline. Connect a model for questions and more flexible requests. Surface Relay in a challenge requires a suitable surface, enough trust and an available charge. Text and subtitles work with audio off.",
  ],
  'guide-voice': [
    "Voice input, announcements and push-to-talk",
    "The radio supports English and Mandarin. Preview the navigator, guardian and explorer voices in voice radio settings. Character radio plays recorded lines for launch, risk and formation events. Read subtitles for live dialogue or missing clips.",
    "Voice input starts off. Select local recognition or DeepSeek. Hold V and grant microphone access when prompted, then hold to speak and release to submit. Each clip is limited to 12 seconds. Esc cancels. Map a controller button in Advanced settings. For local recognition, prepare the matching language pack first.",
    "DeepSeek input sends a submitted recording. DeepSeek speech sends the text to read aloud. Announcements pause while you speak. Pausing, retrying or switching worlds discards old announcements. Press T to type if microphone access is denied.",
  ],
  'guide-ai': [
    "AI models, API keys, costs and privacy",
    "Wingmates fly locally by default. For model assistance, choose DeepSeek Flash, OpenAI or a trusted compatible endpoint in Advanced settings. Enter your own key and connect. A custom endpoint must support direct browser requests. Use HTTPS and only send your key to a service you trust.",
    "The default planning interval is 8 seconds with 20 requests per page, a 50,000-token budget and an 8-second timeout. Requests begin during play according to your settings. Monitor usage as you fly. DeepSeek bills for transcription, reasoning and speech. Reconnecting preserves the page budget.",
    "Your key stays in page memory and can be read by scripts running on the page. The model receives necessary flight state and text you send. Recording requires browser permission. DeepSeek transcription uploads only submitted clips. Disconnect to clear the key and return to local wingmates.",
  ],
  'guide-graphics': [
    "Graphics, comfort and troubleshooting",
    "Start with Balanced quality. Try High if your GPU has headroom. Use reduced effects if flashes or inversions feel too strong. Quality, effects and mute changes apply immediately. Adjust audio and subtitles in their respective settings.",
    "For a WebGL2 error, check hardware acceleration and reload. For a slow GLB, try a smaller scene or fewer textures. Chunk buffering pauses flight while nearby collision geometry loads. Flight resumes when the area is ready.",
  ],
  'guide-privacy': [
    "Source code and licenses",
    "Skimmer-Scraper uses AGPL-3.0-only from v0.3.0. Release packages retain the v0.2.0 MIT license. Static distributions include the corresponding source link, project license and third-party notices.",
    "Play without an account. Settings, records and imported GLBs use local browser storage. Keep seeds and original model files before clearing site data.",
  ],
} as const;
