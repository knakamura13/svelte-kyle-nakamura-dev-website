# Kyle Nakamura's website

A personal portfolio for employers evaluating Kyle's work, plus a few personal utility pages. Every page shares one design language, established by the home page.

## Language

### Pages

**Project story**:
A page that tells the story of one project in depth.
_Avoid_: case study, project detail

**Résumé**:
Kyle's professional history as a web page, with a PDF download that says the same thing.
_Avoid_: CV, resume (without accents, in visible copy)

**Payment method**:
One way to send Kyle money, such as Venmo or Zelle, with its handle and one action.
_Avoid_: payment option, platform

**Experiment**:
An interactive page under `/experiments` that explains one idea by letting the visitor change it. Each one is listed in `src/lib/experiments/catalog.ts`, which the `/experiments` index reads.
_Avoid_: demo, playground, lab

### Design language

**Opening**:
The home page's first view: Kyle's introduction beside the Project Stack. It appears only on the home page.
_Avoid_: hero, landing

**Stack**:
A group of overlapping, tilted cards. Hovering or focusing a card brings it to the front.
_Avoid_: card pile, deck

**Project Stack**:
The Stack of three project cards in the Opening.
_Avoid_: card stack, gallery

**Payment Stack**:
The Stack of Payment methods on the send-money page, beside its Page intro.
_Avoid_: payment grid, payment cards

**Page intro**:
The opening block of every page except home. It names the page and states its purpose, in the form first used by the Project story.
_Avoid_: hero, case intro, header

**Record**:
One dated item in Kyle's history, such as a job or a degree, with its organization, dates, and what he did there.
_Avoid_: entry card, timeline item

**Tinted frame**:
The rounded surface in one of the home page's soft colors that holds an image, such as a project thumbnail.
_Avoid_: card background, swatch

**Logo tile**:
The white rounded square that shows an organization's logo beside a Record. Work without an organization uses Kyle's "kn" mark.
_Avoid_: badge, avatar

**Chapter**:
One numbered part of an Experiment: a short explanation beside a Stage.
_Avoid_: step, slide, level

**Stage**:
The Tinted frame that holds one live 3D scene. While another Stage is on screen it keeps a picture of its last frame.
_Avoid_: canvas, viewport, player

**Dock**:
The white panel of controls and readouts under a Stage.
_Avoid_: toolbar, HUD, sidebar

**Role color**:
A color that means the same thing in every Stage of an Experiment: blue is the observer at rest, green the traveler, amber light, red what Newton's arithmetic predicts.
_Avoid_: theme color, series color

### Airflow experiment

**Home**:
One of the four single-story homes the Airflow Experiment simulates, drawn as a plan: its Rooms, walls, Openings and furniture.
_Avoid_: house (that is one of the four), apartment, floor plan, layout

**Room**:
A named part of a Home, such as the Kitchen. Each Room has its own average speed, temperature, particulates, and air changes per hour.
_Avoid_: zone, space

**Opening**:
A door or window in a Home. It opens from 0 to 100% of its travel, and how much air it passes depends on how much of its frame that leaves open.
_Avoid_: vent, hole, gap

**Device**:
A fan or air purifier the visitor places in a Home.
_Avoid_: appliance, gadget, unit

**Slice**:
The horizontal plane through a Home, at a height the visitor sets, that carries the heatmap, the hover readout, Probes, and where smoke is released.
_Avoid_: cross-section, cut, floor map

**Layer**:
Which quantity the Slice shows: speed, direction, particulates, or temperature.
_Avoid_: mode, view, overlay

**Probe**:
A point on the Slice the visitor pinned, which keeps reading the air there.
_Avoid_: pin, sensor, marker

**Tracer**:
A tiny dot that drifts with the air so its motion can be seen.
_Avoid_: particle (that is smoke), arrow

**Smoke**:
Fine particulates, measured as PM2.5, that the visitor releases or that come in from outdoors.
_Avoid_: dust, pollution, pollutant

**Scenario**:
A prepared Home, Devices, Openings, and weather that shows one idea, such as cross-ventilation.
_Avoid_: preset, demo, example

**Physics panel**:
The expandable panel that says how the simulation is doing: its clock, grid, backend, air changes per hour, and whether the particulate mass balance closes.
_Avoid_: debug panel, stats
