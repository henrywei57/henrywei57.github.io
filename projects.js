/*
  The projects on my homepage. Edit this file to add, remove or change a
  project. The layout reads everything from this list, so you never have to
  touch index.html.

  To add a project: copy one { ... } block, paste it where you want it (the
  order here is the order on the page), and fill it in. Keep the comma
  between blocks.

  Fields
    name        Project name. Required.
    description One or two sentences. Required.
    tech        Languages and tools, shown as small tags.
    status      "finished", "ongoing" or "paused".
    category    Groups projects for the filter buttons. Reuse an existing
                name, or type a new one and a new button shows up.
    repo        Link to the GitHub repo. Leave it out if there is none.
    repoLabel   Optional text for the repo button (default: "Code").
    demo        Link to a live demo. Leave it out if there is none.
    links       Optional extra links: [{ label: "...", url: "..." }]
    byHand      true if I wrote the code myself. Adds a "Written by me" badge.
*/

window.PROJECTS = [
  {
    name: "Full Count",
    description:
      "A broadcast-style 3D baseball game in the browser. Zone hitting, meter pitching, real ball-flight physics, every MLB roster, and online games against friends.",
    tech: ["JavaScript", "Three.js", "Firebase", "PeerJS"],
    status: "ongoing",
    category: "Baseball",
    repo: "https://github.com/henrywei57/full-count",
    demo: "https://henrywei57.github.io/full-count/"
  },
  {
    name: "Pitching Machine Sim",
    description:
      "I wanted to see what really happens to a ball inside a pitching machine. Three wheels squeeze the ball, the spin comes from that contact, and the flight depends on where the seams are.",
    tech: ["Python", "MuJoCo", "NumPy", "SciPy"],
    status: "ongoing",
    category: "Baseball",
    repo: "https://github.com/henrywei57/pitching-machine",
    links: [
      { label: "Earlier PyBullet version", url: "https://github.com/henrywei57/pitching-machine-sim" }
    ]
  },
  {
    name: "HR Meter",
    description:
      "A phone-first web app for the MLB game you're watching: live win probability, home run and strikeout chances, and a 3D view of every pitch. It can also replay any game since 2015.",
    tech: ["JavaScript", "Three.js", "PWA", "MLB Stats API"],
    status: "ongoing",
    category: "Baseball",
    repo: "https://github.com/henrywei57/mlb-hr-meter",
    demo: "https://henrywei57.github.io/mlb-hr-meter/"
  },
  {
    name: "VEX V5 Robot Code",
    description:
      "C++ for my VEX V5 robots over three seasons. The robot tracks where it is on the field with odometry from tracking wheels and the inertial sensor, and drives and turns with PID control.",
    tech: ["C++", "VEX V5", "PID", "Odometry"],
    status: "finished",
    category: "Robotics & sensors",
    byHand: true,
    repo: "https://github.com/henrywei57/Vex_HighStakes",
    repoLabel: "High Stakes code",
    links: [
      { label: "Over Under", url: "https://github.com/henrywei57/Vex_OverUnder" },
      { label: "Push Back (96969W)", url: "https://github.com/henrywei57/push_back_96969W" },
      { label: "Auton selector", url: "https://github.com/henrywei57/auto-selector" }
    ]
  },
  {
    name: "Plant AIoT Dashboard",
    description:
      "A live dashboard for soil sensor readings: moisture, temperature, EC, pH and NPK nutrients, with trend charts. It pulls the readings from a Google Sheet on a timer.",
    tech: ["JavaScript", "Chart.js", "SheetJS"],
    status: "finished",
    category: "Robotics & sensors",
    repo: "https://github.com/henrywei57/soil-sensor-dashboard",
    demo: "https://henrywei57.github.io/soil-sensor-dashboard/"
  },
  {
    name: "Poker Bot Arena",
    description:
      "No-limit Texas Hold'em where you write poker bots in Kicker, a small rule-based language made for poker. Simulate thousands of hands, run tournaments, or play your bots against friends online.",
    tech: ["JavaScript", "PeerJS", "WebRTC"],
    status: "ongoing",
    category: "Games",
    repo: "https://github.com/henrywei57/poker-bot-arena",
    demo: "https://henrywei57.github.io/poker-bot-arena/"
  },
  {
    name: "Toy Piano Tutor",
    description:
      "Learn songs on a cheap toy piano, even an out-of-tune one. It listens through the microphone to measure what each key really sounds like, then fits songs to the keys you have.",
    tech: ["JavaScript", "Web Audio", "Vite", "PWA"],
    status: "ongoing",
    category: "Tools",
    repo: "https://github.com/henrywei57/toy-piano-tutor",
    demo: "https://henrywei57.github.io/toy-piano-tutor/"
  },
  {
    name: "Code Flowchart",
    description:
      "Paste JavaScript and get a flowchart of every function plus a plain-English explanation. It runs on static analysis only, with no AI calls.",
    tech: ["JavaScript", "Acorn", "Mermaid"],
    status: "finished",
    category: "Tools",
    repo: "https://github.com/henrywei57/code-flowchart",
    demo: "https://henrywei57.github.io/code-flowchart/"
  },
  {
    name: "Notes to Text",
    description:
      "Turn photos of lecture notes, whiteboards and slides into clean Markdown bullet points. It uses Gemini or Claude with your own API key, or an offline OCR mode.",
    tech: ["JavaScript", "Gemini API", "Claude API", "Tesseract.js"],
    status: "finished",
    category: "Tools",
    repo: "https://github.com/henrywei57/notes-to-text",
    demo: "https://henrywei57.github.io/notes-to-text/"
  },
  {
    name: "ipynb to PDF",
    description:
      "Convert Jupyter notebooks to PDF right in the browser, with no upload and no server. Drop in several at once and get them back as one zip.",
    tech: ["JavaScript", "marked", "html2pdf.js", "JSZip"],
    status: "finished",
    category: "Tools",
    repo: "https://github.com/henrywei57/ipynb-to-pdf",
    demo: "https://henrywei57.github.io/ipynb-to-pdf/"
  },
  {
    name: "College Board Wrong-Answer Capture",
    description:
      "A Chrome extension that steps through a graded College Board multiple-choice review and screenshots every question marked wrong into one folder.",
    tech: ["JavaScript", "Chrome Extension (MV3)"],
    status: "finished",
    category: "Tools",
    repo: "https://github.com/henrywei57/collegeboard-wrong-capture"
  },
  {
    name: "Blackjack",
    description:
      "My final project for a 2024-25 Python course: Blackjack in Pygame with betting, a balance that's saved between runs, and video effects.",
    tech: ["Python", "Pygame", "OpenCV"],
    status: "finished",
    category: "Games",
    repo: "https://github.com/henrywei57/24-25PythonCourseFinalProject"
  }
];
