import { Subject } from "./types.ts";

export const SUBJECTS_DATA: Subject[] = [
  {
    id: "cs",
    name: "Computer Science",
    icon: "Cpu",
    lectures: [
      {
        id: "cs-big-o",
        title: "Big O Notation & Complexity Analysis",
        content: `### Introduction to Big O Notation

Big O notation is a mathematical notation used to describe the limiting behavior of a function when the argument tends towards a particular value or infinity. In computer science, it is used to classify algorithms according to how their run time or space requirements grow as the input size (denoted as 'n') grows.

#### Key Complexity Classifications

1. **O(1) - Constant Time**:
   - The execution time of these algorithms is independent of the input size.
   - *Example*: Accessing an array element by index, inserting a node at the head of a linked list.

2. **O(log n) - Logarithmic Time**:
   - The execution time grows logarithmically with input size. It typically divides the problem size in half on each step.
   - *Example*: Binary search on a sorted array.

3. **O(n) - Linear Time**:
   - The execution time grows in direct proportion to the size of the input.
   - *Example*: Simple linear search through an unsorted array, finding the maximum element.

4. **O(n log n) - Linearithmic Time**:
   - Common in efficient sorting algorithms. Often combines O(n) passes with O(log n) splits.
   - *Example*: Merge Sort, Quick Sort (average case), Heap Sort.

5. **O(n²) - Quadratic Time**:
   - The execution time is proportional to the square of the input size. Typically occurs when nested iterations are performed over the data.
   - *Example*: Bubble Sort, Selection Sort, Insertion Sort.

#### Why Big O Matters

Big O ignores hardware differences, compiler optimizations, and constant factors. It focuses solely on scalable efficiency, allowing engineers to predict how code will perform when scaling from 10 items to 10 million items.`
      },
      {
        id: "cs-neural-networks",
        title: "Neural Networks & Deep Learning Basics",
        content: `### Core Concepts of Artificial Neural Networks (ANNs)

Artificial Neural Networks are computational models inspired by the biological structure of the human brain. They form the foundation of modern Deep Learning, enabling machines to learn from patterns in complex data.

#### The Building Block: The Perceptron

A perceptron (artificial neuron) takes several binary or continuous inputs, applies weights, sums them, adds a bias, and passes the result through an activation function to generate an output.

- **Inputs (x_i)**: Features representing the data.
- **Weights (w_i)**: Coefficients that amplify or reduce the influence of each input. These are adjusted during training.
- **Summation**: \`z = Σ (w_i * x_i) + bias\`
- **Bias (b)**: A constant offset value to shift the activation function trigger point.

#### Activation Functions

Activation functions introduce non-linearity into the network, allowing it to learn complex, non-linear boundaries.

1. **Sigmoid**: Outputs a value between 0 and 1. Useful for probability predictions.
2. **ReLU (Rectified Linear Unit)**: Outputs input directly if positive; otherwise, outputs zero. Extremely popular for preventing vanishing gradient problems.
3. **Tanh (Hyperbolic Tangent)**: Outputs between -1 and 1. Often superior to Sigmoid for hidden layers.

#### Learning and Backpropagation

- **Loss Function**: Measures how far the network's predictions are from the true labels (e.g., Mean Squared Error, Cross-Entropy).
- **Gradient Descent**: An optimization algorithm used to minimize the loss by updating the weights in the opposite direction of the gradient.
- **Backpropagation**: The process of computing the gradient of the loss function with respect to each weight using the chain rule, moving backward from the output layer to the input layer.`
      }
    ]
  },
  {
    id: "physics",
    name: "Astrophysics",
    icon: "Orbit",
    lectures: [
      {
        id: "phys-kepler",
        title: "Kepler's Laws of Planetary Motion",
        content: `### Kepler's Three Laws of Planetary Motion

Published by Johannes Kepler between 1609 and 1619, these three mathematical laws describe the motion of planets around the Sun, breaking the ancient Greek belief in perfect circular orbits.

#### First Law: The Law of Orbits

**Statement**: All planets move in elliptical orbits with the Sun located at one of the two foci of the ellipse.

- An ellipse is a closed symmetric curve shaped like a flattened circle.
- The distance from the planet to the Sun changes constantly as it travels around its orbit.
- **Perihelion**: The point in orbit closest to the Sun.
- **Aphelion**: The point in orbit farthest from the Sun.

#### Second Law: The Law of Areas

**Statement**: A line segment joining a planet and the Sun sweeps out equal areas during equal intervals of time.

- This means that planets do not travel at a constant speed.
- A planet travels faster when it is closer to the Sun (near perihelion) due to stronger gravitational forces, and slower when it is farther away (near aphelion).

#### Third Law: The Law of Periods

**Statement**: The square of the orbital period (T) of a planet is directly proportional to the cube of the semi-major axis (a) of its orbit.

- Mathematically: \`T² ∝ a³\` or \`T² / a³ = constant\`
- If the orbital period is measured in Earth years and the semi-major axis is measured in Astronomical Units (AU), then \`T² = a³\`.
- This law allows us to calculate a planet's distance from the Sun if we know its orbital duration, and vice versa.`
      },
      {
        id: "phys-black-holes",
        title: "Stellar Evolution & Black Holes",
        content: `### The Lifecycle of Stars and Their Final Destinies

Stars undergo a dramatic evolutionary lifecycle governed by the balance between outward thermal pressure from nuclear fusion and inward gravitational collapse.

#### Stellar Birth & Main Sequence

- All stars are born in dense clouds of gas and dust called **nebulas**.
- Gravity pulls gas together, heating up to ignite hydrogen fusion, forming a **Main Sequence** star. Our Sun is currently in this stable phase.

#### High-Mass Stars vs. Low-Mass Stars

The mass of a star at birth determines its final fate:

1. **Low to Medium Mass Stars (< 8 solar masses)**:
   - Fuse hydrogen into helium, then swell into a Red Giant.
   - Once fuel is exhausted, outer layers are blown away into a beautiful planetary nebula.
   - The remaining hot core cools down to become a **White Dwarf**, supported by electron degeneracy pressure.

2. **High-Mass Stars (> 8 solar masses)**:
   - Fuse heavier elements up to iron in concentric shells.
   - Iron fusion absorbs energy rather than releasing it, triggering sudden gravitational collapse.
   - The outer star explodes as a spectacular **Supernova**.
   - If the core is between 1.4 and 3 solar masses, it becomes a ultra-dense **Neutron Star** (pulsar).
   - If the core exceeds 3 solar masses, gravity overcomes all degeneracy pressures, forming a **Black Hole**.

#### Anatomy of a Black Hole

- **Singularity**: The point of infinite density at the center where space-time curvature is infinite.
- **Event Horizon**: The boundary surface surrounding a singularity where the escape velocity exceeds the speed of light. Once crossed, nothing, not even light, can escape.
- **Schwarzschild Radius**: The radius of the event horizon, directly proportional to the mass of the black hole.`
      }
    ]
  },
  {
    id: "history",
    name: "World History",
    icon: "BookOpen",
    lectures: [
      {
        id: "hist-printing-press",
        title: "The Printing Press & Information Age",
        content: `### Johannes Gutenberg and the Movable Type Revolution

Invented in Mainz, Germany around 1440, Johannes Gutenberg's movable type printing press is widely considered one of the most influential inventions in human history.

#### Pre-Gutenberg Communication

- Prior to the press, books were copied painstakingly by hand, usually by scribes or monks.
- Books were extremely rare, highly expensive luxury items available only to the clergy and nobility.
- Literacy rates were extremely low, keeping knowledge highly centralized and inaccessible to the general public.

#### Gutenberg's Core Innovations

Gutenberg did not just build a machine; he created a complete manufacturing system:
1. **Movable Metal Type**: Durable alloy of lead, tin, and antimony that could be cast quickly and reused.
2. **Oil-based Ink**: Standard water-based inks wouldn't stick to metal types, so he formulated a thick, viscous oil-based ink.
3. **Wooden Screw Press**: Adapted from agricultural presses used for making wine and olive oil.

#### Societal Impact & Consequences

- **Information Explosion**: Within 50 years, millions of books were printed, exceeding the total written output of Europe prior to 1450.
- **The Protestant Reformation**: Martin Luther's critiques of the Catholic Church were printed and distributed across Germany in weeks, accelerating the spread of the Reformation.
- **Scientific Revolution**: Scholars could publish theories, share observations, and cross-examine findings rapidly with standardized, error-free editions.
- **Rise of Literacy**: Standardized vernacular print made reading accessible to the middle class, paving the way for public education.`
      },
      {
        id: "hist-space-race",
        title: "The Cold War Space Race",
        content: `### Ideology, Rocketry, and the Journey to the Moon

The Space Race was a 20th-century competition between two Cold War rivals, the Soviet Union (USSR) and the United States (USA), for dominance in spaceflight capability.

#### The Catalyst: Sputnik (1957)

- On October 4, 1957, the USSR shocked the world by launching **Sputnik 1**, the first artificial satellite, into orbit.
- This triggered "Sputnik Panic" in the US, raising fears that Soviet ICBM rockets could easily deliver nuclear warheads across continents.

#### Early Soviet Dominance

- **1957**: Sputnik 2 carries the first living creature, a dog named Laika, into space.
- **1961**: Yuri Gagarin becomes the first human in space, orbiting Earth in Vostok 1.

#### The American Pledge & Gemini Program

- In May 1961, US President John F. Kennedy famously declared the goal of landing a man on the moon and returning him safely before the decade's end.
- The **Gemini Program** (1965–1966) worked to perfect spatial rendezvous, docking, and long-duration space walks.

#### Apollo 11: Landing on the Moon (1969)

- On July 20, 1969, US astronauts Neil Armstrong and Buzz Aldrin landed the Apollo 11 Lunar Module, *Eagle*, on the moon.
- Neil Armstrong's words: *"That's one small step for [a] man, one giant leap for mankind."*
- This milestone is widely viewed as the political climax and conclusion of the Space Race, demonstrating remarkable advances in computing, materials science, and rocketry.`
      }
    ]
  }
];
