/**
 * Standalone seed script for CognoDB.
 *
 * Run with: `npm run seed` (reads COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD
 * from a local `.env` file via dotenv, see `.env.example`).
 *
 * This is intentionally a plain Node script (not a Worker) because seeding
 * is a one-off admin task best run from a developer machine or CI job, with
 * full Node APIs and no Workers runtime constraints.
 */
import "dotenv/config";
import neo4j from "neo4j-driver";
import type { ConceptNode, ResourceNode } from "../src/types";

const URI = process.env.COGNODB_URI;
const USER = process.env.COGNODB_USER;
const PASSWORD = process.env.COGNODB_PASSWORD;

if (!URI || !USER || !PASSWORD) {
  console.error(
    "Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD.\n" +
      "Create backend/.env (see .env.example) or export them before running `npm run seed`."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dataset: 39 Concepts + 39 Resources spanning STEM plus a Design/UI-UX
// domain, with 46 REQUIRES and 39 TEACHES relationships (85 total).
// Prerequisite chains run up to 6 hops deep so the multi-hop and shortest-path
// queries have something real to chew on, and Design bridges into Computer
// Science via Design Systems -> Programming Fundamentals.
// ---------------------------------------------------------------------------

const concepts: ConceptNode[] = [
  // Mathematics
  { id: "arithmetic", name: "Arithmetic", domain: "Mathematics", difficulty: "beginner",
    description: "Number sense, operations, fractions, and the foundation for all quantitative reasoning." },
  { id: "algebra-1", name: "Algebra I", domain: "Mathematics", difficulty: "beginner",
    description: "Variables, linear equations, and manipulating symbolic expressions." },
  { id: "algebra-2", name: "Algebra II", domain: "Mathematics", difficulty: "intermediate",
    description: "Polynomials, quadratics, exponentials, and systems of equations." },
  { id: "geometry", name: "Geometry", domain: "Mathematics", difficulty: "beginner",
    description: "Shapes, angles, proofs, and spatial reasoning." },
  { id: "trigonometry", name: "Trigonometry", domain: "Mathematics", difficulty: "intermediate",
    description: "Angles, triangles, and the sine/cosine/tangent functions." },
  { id: "calculus-1", name: "Calculus I", domain: "Mathematics", difficulty: "intermediate",
    description: "Limits, derivatives, and rates of change." },
  { id: "calculus-2", name: "Calculus II", domain: "Mathematics", difficulty: "advanced",
    description: "Integrals, series, and techniques of integration." },
  { id: "linear-algebra", name: "Linear Algebra", domain: "Mathematics", difficulty: "intermediate",
    description: "Vectors, matrices, and linear transformations." },
  { id: "statistics-probability", name: "Statistics & Probability", domain: "Mathematics", difficulty: "intermediate",
    description: "Distributions, expectation, and reasoning under uncertainty." },

  // Physics
  { id: "classical-mechanics", name: "Classical Mechanics", domain: "Physics", difficulty: "intermediate",
    description: "Newton's laws, motion, forces, and energy." },
  { id: "thermodynamics", name: "Thermodynamics", domain: "Physics", difficulty: "intermediate",
    description: "Heat, work, entropy, and the laws governing energy transfer." },
  { id: "electromagnetism", name: "Electromagnetism", domain: "Physics", difficulty: "advanced",
    description: "Electric and magnetic fields, circuits, and Maxwell's equations." },
  { id: "waves-optics", name: "Waves & Optics", domain: "Physics", difficulty: "intermediate",
    description: "Wave motion, sound, light, and interference phenomena." },
  { id: "quantum-mechanics", name: "Quantum Mechanics", domain: "Physics", difficulty: "advanced",
    description: "Wavefunctions, uncertainty, and the physics of the very small." },

  // Chemistry
  { id: "atomic-structure", name: "Atomic Structure", domain: "Chemistry", difficulty: "beginner",
    description: "Protons, neutrons, electrons, and the periodic table." },
  { id: "chemical-bonding", name: "Chemical Bonding", domain: "Chemistry", difficulty: "intermediate",
    description: "Ionic, covalent, and metallic bonds and molecular geometry." },
  { id: "stoichiometry", name: "Stoichiometry", domain: "Chemistry", difficulty: "intermediate",
    description: "Quantitative relationships between reactants and products in reactions." },
  { id: "thermochemistry", name: "Thermochemistry", domain: "Chemistry", difficulty: "advanced",
    description: "Energy changes in chemical reactions." },
  { id: "organic-chemistry", name: "Organic Chemistry", domain: "Chemistry", difficulty: "advanced",
    description: "Carbon-based compounds, functional groups, and reaction mechanisms." },

  // Biology
  { id: "cell-biology", name: "Cell Biology", domain: "Biology", difficulty: "beginner",
    description: "Cell structure, organelles, and the basic unit of life." },
  { id: "genetics", name: "Genetics", domain: "Biology", difficulty: "intermediate",
    description: "Heredity, DNA, and how traits are passed between generations." },
  { id: "molecular-biology", name: "Molecular Biology", domain: "Biology", difficulty: "advanced",
    description: "The molecular basis of biological activity, from DNA to proteins." },
  { id: "evolution", name: "Evolution", domain: "Biology", difficulty: "intermediate",
    description: "Natural selection and how species change over time." },
  { id: "ecology", name: "Ecology", domain: "Biology", difficulty: "beginner",
    description: "Interactions between organisms and their environment." },

  // Computer Science
  { id: "programming-fundamentals", name: "Programming Fundamentals", domain: "Computer Science", difficulty: "beginner",
    description: "Variables, control flow, and writing your first programs." },
  { id: "data-structures", name: "Data Structures", domain: "Computer Science", difficulty: "intermediate",
    description: "Arrays, lists, trees, and graphs for organizing data efficiently." },
  { id: "discrete-mathematics", name: "Discrete Mathematics", domain: "Computer Science", difficulty: "intermediate",
    description: "Logic, set theory, and combinatorics underlying computer science." },
  { id: "algorithms", name: "Algorithms", domain: "Computer Science", difficulty: "advanced",
    description: "Designing and analyzing efficient procedures for solving problems." },
  { id: "computer-architecture", name: "Computer Architecture", domain: "Computer Science", difficulty: "intermediate",
    description: "How CPUs, memory, and instruction sets actually work." },
  { id: "databases", name: "Databases", domain: "Computer Science", difficulty: "intermediate",
    description: "Storing, querying, and modeling structured data." },

  // Design / UI-UX
  { id: "typography", name: "Typography", domain: "Design", difficulty: "beginner",
    description: "Type systems, hierarchy, and readable text on screen." },
  { id: "color-theory", name: "Color Theory", domain: "Design", difficulty: "beginner",
    description: "Contrast, palettes, and how color communicates meaning." },
  { id: "visual-hierarchy", name: "Visual Hierarchy", domain: "Design", difficulty: "intermediate",
    description: "Guiding a viewer's eye through size, weight, and spacing." },
  { id: "accessibility", name: "Accessibility (a11y)", domain: "Design", difficulty: "intermediate",
    description: "Designing usable interfaces for people with a wide range of abilities." },
  { id: "wireframing", name: "Wireframing", domain: "Design", difficulty: "beginner",
    description: "Low-fidelity layout sketches that define structure before visuals." },
  { id: "information-architecture", name: "Information Architecture", domain: "Design", difficulty: "intermediate",
    description: "Organizing and labeling content so people can find what they need." },
  { id: "interaction-design", name: "Interaction Design", domain: "Design", difficulty: "intermediate",
    description: "Designing how users interact with and move through an interface." },
  { id: "usability-testing", name: "Usability Testing", domain: "Design", difficulty: "intermediate",
    description: "Observing real users to find friction and validate design decisions." },
  { id: "design-systems", name: "Design Systems", domain: "Design", difficulty: "advanced",
    description: "Reusable, coded components and standards that keep a product consistent." },
];

const resources: ResourceNode[] = [
  { id: "res-arithmetic-notes", title: "Arithmetic Refresher Notes", url: "https://example-notes.dev/arithmetic", type: "note" },
  { id: "res-algebra1-notes", title: "Algebra I Study Guide", url: "https://example-notes.dev/algebra-1", type: "note" },
  { id: "res-algebra1-test", title: "Algebra I Practice Test", url: "https://example-notes.dev/algebra-1/test", type: "test" },
  { id: "res-algebra2-notes", title: "Algebra II Study Guide", url: "https://example-notes.dev/algebra-2", type: "note" },
  { id: "res-geometry-notes", title: "Geometry Theorems Cheat Sheet", url: "https://example-notes.dev/geometry", type: "note" },
  { id: "res-trig-test", title: "Trigonometry Practice Test", url: "https://example-notes.dev/trigonometry/test", type: "test" },
  { id: "res-calc1-video", title: "Calculus I Crash Course", url: "https://example-notes.dev/calculus-1/video", type: "video" },
  { id: "res-calc2-notes", title: "Calculus II Notes", url: "https://example-notes.dev/calculus-2", type: "note" },
  { id: "res-linalg-course", title: "Linear Algebra Course", url: "https://example-notes.dev/linear-algebra/course", type: "course" },
  { id: "res-stats-notes", title: "Probability & Statistics Notes", url: "https://example-notes.dev/statistics", type: "note" },
  { id: "res-mechanics-video", title: "Newtonian Mechanics Explained", url: "https://example-notes.dev/mechanics/video", type: "video" },
  { id: "res-thermo-notes", title: "Thermodynamics Laws Summary", url: "https://example-notes.dev/thermodynamics", type: "note" },
  { id: "res-em-course", title: "Electromagnetism Full Course", url: "https://example-notes.dev/electromagnetism/course", type: "course" },
  { id: "res-waves-article", title: "Waves and Optics Primer", url: "https://example-notes.dev/waves-optics", type: "article" },
  { id: "res-qm-article", title: "Intro to Quantum Mechanics", url: "https://example-notes.dev/quantum-mechanics", type: "article" },
  { id: "res-atomic-notes", title: "Atomic Structure Notes", url: "https://example-notes.dev/atomic-structure", type: "note" },
  { id: "res-bonding-test", title: "Chemical Bonding Quiz", url: "https://example-notes.dev/chemical-bonding/test", type: "test" },
  { id: "res-stoich-notes", title: "Stoichiometry Worked Examples", url: "https://example-notes.dev/stoichiometry", type: "note" },
  { id: "res-organic-course", title: "Organic Chemistry Fundamentals", url: "https://example-notes.dev/organic-chemistry/course", type: "course" },
  { id: "res-cellbio-notes", title: "Cell Biology Notes", url: "https://example-notes.dev/cell-biology", type: "note" },
  { id: "res-genetics-test", title: "Genetics Practice Test", url: "https://example-notes.dev/genetics/test", type: "test" },
  { id: "res-molbio-article", title: "Molecular Biology Overview", url: "https://example-notes.dev/molecular-biology", type: "article" },
  { id: "res-evolution-video", title: "Evolution Explained", url: "https://example-notes.dev/evolution/video", type: "video" },
  { id: "res-ecology-notes", title: "Ecology Field Notes", url: "https://example-notes.dev/ecology", type: "note" },
  { id: "res-programming-course", title: "Intro to Programming", url: "https://example-notes.dev/programming/course", type: "course" },
  { id: "res-datastructures-notes", title: "Data Structures Cheat Sheet", url: "https://example-notes.dev/data-structures", type: "note" },
  { id: "res-algorithms-test", title: "Algorithms Practice Test", url: "https://example-notes.dev/algorithms/test", type: "test" },
  { id: "res-discretemath-notes", title: "Discrete Math Notes", url: "https://example-notes.dev/discrete-math", type: "note" },
  { id: "res-architecture-article", title: "Computer Architecture Basics", url: "https://example-notes.dev/computer-architecture", type: "article" },
  { id: "res-databases-notes", title: "Database Design Notes", url: "https://example-notes.dev/databases", type: "note" },

  { id: "res-typography-notes", title: "Typography Fundamentals Notes", url: "https://example-notes.dev/typography", type: "note" },
  { id: "res-colortheory-notes", title: "Color Theory Cheat Sheet", url: "https://example-notes.dev/color-theory", type: "note" },
  { id: "res-hierarchy-article", title: "Visual Hierarchy Principles", url: "https://example-notes.dev/visual-hierarchy", type: "article" },
  { id: "res-a11y-test", title: "Accessibility (a11y) Checklist Quiz", url: "https://example-notes.dev/accessibility/test", type: "test" },
  { id: "res-wireframing-video", title: "Wireframing Basics", url: "https://example-notes.dev/wireframing/video", type: "video" },
  { id: "res-ia-article", title: "Information Architecture Primer", url: "https://example-notes.dev/information-architecture", type: "article" },
  { id: "res-interaction-course", title: "Interaction Design Foundations", url: "https://example-notes.dev/interaction-design/course", type: "course" },
  { id: "res-usability-notes", title: "Usability Testing Playbook", url: "https://example-notes.dev/usability-testing", type: "note" },
  { id: "res-designsystems-course", title: "Building Design Systems", url: "https://example-notes.dev/design-systems/course", type: "course" },
];

/** [conceptId, prerequisiteConceptId][], conceptId REQUIRES prerequisiteConceptId */
const requires: Array<[string, string]> = [
  ["algebra-1", "arithmetic"],
  ["algebra-2", "algebra-1"],
  ["geometry", "algebra-1"],
  ["trigonometry", "geometry"],
  ["trigonometry", "algebra-2"],
  ["calculus-1", "algebra-2"],
  ["calculus-1", "trigonometry"],
  ["calculus-2", "calculus-1"],
  ["linear-algebra", "algebra-2"],
  ["statistics-probability", "algebra-2"],

  ["classical-mechanics", "calculus-1"],
  ["thermodynamics", "classical-mechanics"],
  ["electromagnetism", "calculus-2"],
  ["electromagnetism", "classical-mechanics"],
  ["waves-optics", "trigonometry"],
  ["waves-optics", "classical-mechanics"],
  ["quantum-mechanics", "linear-algebra"],
  ["quantum-mechanics", "electromagnetism"],

  ["atomic-structure", "algebra-1"],
  ["chemical-bonding", "atomic-structure"],
  ["stoichiometry", "algebra-1"],
  ["stoichiometry", "atomic-structure"],
  ["thermochemistry", "stoichiometry"],
  ["thermochemistry", "thermodynamics"],
  ["organic-chemistry", "chemical-bonding"],

  ["genetics", "cell-biology"],
  ["molecular-biology", "cell-biology"],
  ["molecular-biology", "chemical-bonding"],
  ["evolution", "genetics"],
  ["ecology", "cell-biology"],

  ["data-structures", "programming-fundamentals"],
  ["discrete-mathematics", "algebra-1"],
  ["algorithms", "data-structures"],
  ["algorithms", "discrete-mathematics"],
  ["computer-architecture", "programming-fundamentals"],
  ["databases", "data-structures"],

  ["visual-hierarchy", "typography"],
  ["visual-hierarchy", "color-theory"],
  ["accessibility", "visual-hierarchy"],
  ["interaction-design", "wireframing"],
  ["interaction-design", "visual-hierarchy"],
  ["usability-testing", "interaction-design"],
  ["information-architecture", "wireframing"],
  ["design-systems", "accessibility"],
  ["design-systems", "interaction-design"],
  ["design-systems", "programming-fundamentals"],
];

/** [conceptId, resourceId][], conceptId TEACHES resourceId */
const teaches: Array<[string, string]> = [
  ["arithmetic", "res-arithmetic-notes"],
  ["algebra-1", "res-algebra1-notes"],
  ["algebra-1", "res-algebra1-test"],
  ["algebra-2", "res-algebra2-notes"],
  ["geometry", "res-geometry-notes"],
  ["trigonometry", "res-trig-test"],
  ["calculus-1", "res-calc1-video"],
  ["calculus-2", "res-calc2-notes"],
  ["linear-algebra", "res-linalg-course"],
  ["statistics-probability", "res-stats-notes"],
  ["classical-mechanics", "res-mechanics-video"],
  ["thermodynamics", "res-thermo-notes"],
  ["electromagnetism", "res-em-course"],
  ["waves-optics", "res-waves-article"],
  ["quantum-mechanics", "res-qm-article"],
  ["atomic-structure", "res-atomic-notes"],
  ["chemical-bonding", "res-bonding-test"],
  ["stoichiometry", "res-stoich-notes"],
  ["organic-chemistry", "res-organic-course"],
  ["cell-biology", "res-cellbio-notes"],
  ["genetics", "res-genetics-test"],
  ["molecular-biology", "res-molbio-article"],
  ["evolution", "res-evolution-video"],
  ["ecology", "res-ecology-notes"],
  ["programming-fundamentals", "res-programming-course"],
  ["data-structures", "res-datastructures-notes"],
  ["algorithms", "res-algorithms-test"],
  ["discrete-mathematics", "res-discretemath-notes"],
  ["computer-architecture", "res-architecture-article"],
  ["databases", "res-databases-notes"],

  ["typography", "res-typography-notes"],
  ["color-theory", "res-colortheory-notes"],
  ["visual-hierarchy", "res-hierarchy-article"],
  ["accessibility", "res-a11y-test"],
  ["wireframing", "res-wireframing-video"],
  ["information-architecture", "res-ia-article"],
  ["interaction-design", "res-interaction-course"],
  ["usability-testing", "res-usability-notes"],
  ["design-systems", "res-designsystems-course"],
];

async function main() {
  const driver = neo4j.driver(URI!, neo4j.auth.basic(USER!, PASSWORD!));
  const session = driver.session();

  try {
    console.log("Verifying CognoDB connectivity...");
    await driver.verifyConnectivity();
    console.log("Connected.\n");

    console.log("Clearing existing SkillGraph data (Concept/Resource nodes)...");
    await session.run(`
      MATCH (n)
      WHERE n:Concept OR n:Resource
      DETACH DELETE n
    `);

    console.log("Creating uniqueness constraints...");
    await session.run(`CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT resource_id IF NOT EXISTS FOR (r:Resource) REQUIRE r.id IS UNIQUE`);

    console.log(`Seeding ${concepts.length} Concept nodes...`);
    for (const c of concepts) {
      await session.run(
        `CREATE (n:Concept {id: $id, name: $name, description: $description, domain: $domain, difficulty: $difficulty})`,
        c
      );
    }

    console.log(`Seeding ${resources.length} Resource nodes...`);
    for (const r of resources) {
      await session.run(
        `CREATE (n:Resource {id: $id, title: $title, url: $url, type: $type})`,
        r
      );
    }

    console.log(`Creating ${requires.length} REQUIRES relationships...`);
    for (const [conceptId, prereqId] of requires) {
      await session.run(
        `
        MATCH (c:Concept {id: $conceptId}), (p:Concept {id: $prereqId})
        CREATE (c)-[:REQUIRES]->(p)
        `,
        { conceptId, prereqId }
      );
    }

    console.log(`Creating ${teaches.length} TEACHES relationships...`);
    for (const [conceptId, resourceId] of teaches) {
      await session.run(
        `
        MATCH (c:Concept {id: $conceptId}), (r:Resource {id: $resourceId})
        CREATE (c)-[:TEACHES]->(r)
        `,
        { conceptId, resourceId }
      );
    }

    const total = concepts.length + resources.length + requires.length + teaches.length;
    console.log(`\nDone. Seeded ${concepts.length} Concepts and ${resources.length} Resources`);
    console.log(
      `and ${requires.length} REQUIRES + ${teaches.length} TEACHES relationships (${total} graph elements total).`
    );
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
