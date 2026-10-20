// Generates the split Repomix XML packs in repomix-output/.
//
// The whole repository is ~50 MiB / ~12M tokens, far beyond a single LLM
// context window, so the tracked files are partitioned into logical packs
// whose XML output is capped at 4 MiB each. Packs numbered 80+ hold bulky,
// rarely needed content (legal texts, the lockfile, generated doc data and
// website translations) so it can simply be skipped.
//
// Every pack is packed with the optimized Repomix flags requested for this
// task (--remove-comments --remove-empty-lines); that representation is
// lossy by design: code comments and blank lines only exist in the sources.
//
// Two deliberate deviations from a vanilla `npx repomix` run, both needed
// to actually cover the whole repository:
// - --no-default-patterns: the input is an explicit git file list, and the
//   defaults would silently drop package-lock.json.
// - --no-security-check: the input is exclusively files already committed
//   to this public repository, and secretlint-style pattern matching only
//   finds the synthetic credentials used by redaction test fixtures
//   (example.test). This matches the AGENTS.md rule against inferring
//   secrecy from names or text patterns. Never reuse this on a private,
//   unreviewed tree.
//
// Repomix itself never embeds binary files (PNG ...); they still appear in
// each pack's directory structure and are reported in the manifest. The
// extension .pot is also classified as binary by Repomix, so
// website/locales/messages.pot is listed but its gettext template content
// is not embedded. Git submodules are gitlinks without content in this
// repository and are reported as such.
//
// Usage:
//   node scripts/generate-repomix-split.mjs          generate the packs
//   node scripts/generate-repomix-split.mjs --plan   only print the plan
//
// Runs on POSIX shells; on Windows use WSL or Git Bash.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOMIX_VERSION = "1.18.1";
const OUTPUT_DIR = "repomix-output";
const SINGLE_OUTPUT = "repomix-output.xml";
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024; // hard cap per generated XML
const CONTENT_LIMIT_BYTES = Math.floor(3.6 * 1024 * 1024); // raw-input cap per chunk
const REMOVAL_FLAGS = ["--remove-comments", "--remove-empty-lines"];
// Extensions Repomix classifies as binary; used only to explain omissions.
const BINARY_EXTENSIONS = new Set([
  ".bmp",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".pot",
  ".so",
  ".tar",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

// Ordered packs: the first pack whose matcher accepts a file owns it.
// "dirs" are directory prefixes (trailing "/"), "looseDirs" matches files
// directly inside a directory, "rootFilesExcept" matches root files except
// the listed ones, "files" are exact paths, "excludeDirs" always rejects.
const PACKS = [
  {
    id: "00",
    slug: "raiz-configuracion-y-ci",
    title: "Raíz, configuración y CI",
    description:
      "Archivos de la raíz (README, AGENTS, package.json, configuración de TypeScript y tests), .github/ y .agents/. No incluye CHANGELOG.md ni package-lock.json (parte 81).",
    usage:
      "Cargar primero, siempre: define el proyecto, sus reglas y sus scripts.",
    rootFilesExcept: ["CHANGELOG.md", "package-lock.json"],
    dirs: [".github/", ".agents/", ".husky/"],
  },
  {
    id: "01",
    slug: "src-domain-javascript",
    title: "Dominio: JavaScript",
    description:
      "src/domain/javascript/: lógica de dominio del análisis y recuperación JavaScript.",
    usage:
      "Trabajar o entender el análisis de aplicaciones y bundles JavaScript.",
    dirs: ["src/domain/javascript/"],
  },
  {
    id: "02",
    slug: "src-domain-resto",
    title: "Dominio: resto",
    description:
      "El resto de src/domain/: tipos y valores, evidencia, reconstrucción, diferencias web/navegador y errores de análisis.",
    usage: "Semántica pura del proyecto: modelos, invariantes y proyecciones.",
    dirs: ["src/domain/"],
  },
  {
    id: "03",
    slug: "src-application",
    title: "Aplicación (casos de uso)",
    description:
      "src/application/: workflows compartidos CLI/MCP (setup, doctor, análisis directo, servicios web y de reconstrucción).",
    usage: "Entender qué hace cada comando o herramienta de punta a punta.",
    dirs: ["src/application/"],
  },
  {
    id: "04",
    slug: "src-proveedores-ingenieria-inversa",
    title: "Proveedores de ingeniería inversa",
    description:
      "Adaptadores hacia Ghidra, IDA, Hopper, Kuna, Cutter/rizin, JEB, GDB, Frida y objdump (src/ghidra, src/ida, src/hopper, src/kuna, src/cutter, src/rizin, src/jeb, src/gdb, src/frida, src/objdump).",
    usage: "Integraciones con desensambladores y descompiladores externos.",
    dirs: [
      "src/ghidra/",
      "src/ida/",
      "src/hopper/",
      "src/kuna/",
      "src/cutter/",
      "src/rizin/",
      "src/jeb/",
      "src/gdb/",
      "src/frida/",
      "src/objdump/",
    ],
  },
  {
    id: "05",
    slug: "src-web-navegador-y-capturas",
    title: "Web, navegador y capturas",
    description:
      "Observación de navegador y Electron, runtime JavaScript web, inspector, capturas de red y de señales (src/browser, src/javascript, src/electron, src/inspector, src/captures, src/pcap, src/signals).",
    usage: "Captura y observación web o de red en tiempo de ejecución.",
    dirs: [
      "src/browser/",
      "src/javascript/",
      "src/electron/",
      "src/inspector/",
      "src/captures/",
      "src/pcap/",
      "src/signals/",
    ],
  },
  {
    id: "06",
    slug: "src-plataforma-artefactos-y-formatos",
    title: "Plataforma, artefactos y formatos",
    description:
      "Inventario de artefactos y analizadores por formato o plataforma: nativo, .NET, Android, ADB, apktool, Flutter, firmware, Wasm, EVM, Go, Rust, SQLite, Windows y filesystem.",
    usage:
      "Soporte de un formato concreto o acceso seguro al sistema de archivos.",
    dirs: [
      "src/artifacts/",
      "src/native/",
      "src/dotnet/",
      "src/android/",
      "src/adb/",
      "src/apktool/",
      "src/flutter/",
      "src/firmware/",
      "src/wasm/",
      "src/evm/",
      "src/go/",
      "src/rust/",
      "src/sqlite/",
      "src/windows/",
      "src/filesystem/",
    ],
  },
  {
    id: "07",
    slug: "src-nucleo-servidor-y-cli",
    title: "Núcleo, servidor MCP y CLI",
    description:
      "Contratos, servidor MCP, CLI, composición, configuración, evaluación, referencias, supervisión de procesos y archivos sueltos de src/.",
    usage: "Entradas del producto, contratos de herramientas y arranque.",
    dirs: [
      "src/contracts/",
      "src/server/",
      "src/cli/",
      "src/composition/",
      "src/config/",
      "src/main/",
      "src/evaluation/",
      "src/reference/",
      "src/process/",
    ],
    looseDirs: ["src/"],
  },
  {
    id: "08",
    slug: "tests-boundary-filesystem",
    title: "Tests: boundary/filesystem",
    description:
      "tests/boundary/filesystem/: tests de frontera del sistema de archivos.",
    usage: "Cambios en lectura o escritura segura y en sus tests.",
    dirs: ["tests/boundary/filesystem/"],
  },
  {
    id: "09",
    slug: "tests-boundary-proveedores-y-mcp",
    title: "Tests: boundary/providers + mcp",
    description: "tests/boundary/providers/ y tests/boundary/mcp/.",
    usage: "Contratos de proveedores y del servidor MCP.",
    dirs: ["tests/boundary/providers/", "tests/boundary/mcp/"],
  },
  {
    id: "10",
    slug: "tests-boundary-resto",
    title: "Tests: boundary (resto)",
    description:
      "El resto de tests/boundary/: CLI, navegador, procesos y áreas no incluidas en las partes 08 y 09.",
    usage: "Cobertura de frontera general.",
    dirs: ["tests/boundary/"],
  },
  {
    id: "11",
    slug: "tests-resto",
    title: "Tests: aceptación y otros",
    description:
      "El resto de tests/: aceptación, conformance, composition, evaluation, process-global, support y fixtures.",
    usage: "Comportamiento de punta a punta y datos de prueba.",
    dirs: ["tests/"],
  },
  {
    id: "12",
    slug: "scripts",
    title: "Scripts del repositorio",
    description:
      "scripts/: build, verificaciones verify-*, CI, generadores y este propio generador de Repomix.",
    usage: "Tooling, release y comprobaciones del repositorio.",
    dirs: ["scripts/"],
  },
  {
    id: "13",
    slug: "docs-guias",
    title: "Documentación: guías",
    description:
      "Guías Markdown de docs/, specs y assets de texto. Los dos PNG de docs/assets/ solo aparecen listados en el árbol.",
    usage: "Entender el producto y sus flujos documentados.",
    dirs: ["docs/"],
    excludeDirs: ["docs/releases/", "docs/verification/", "docs/readme/"],
  },
  {
    id: "14",
    slug: "website-sin-traducciones",
    title: "Website (sin traducciones)",
    description:
      "Plantillas, contenido público y código del sitio en website/, sin website/locales/.",
    usage: "Cambios en la web pública.",
    dirs: ["website/"],
    excludeDirs: ["website/locales/"],
  },
  {
    id: "15",
    slug: "bridge-native-y-experiments",
    title: "bridge, código nativo y experimentos",
    description:
      "bridge/ (Java, Python y Swift para Ghidra, JADX, pwndbg y mitmproxy), native/ (addon de Windows), third_party/ y experiments/.",
    usage:
      "Código que vive dentro de las herramientas externas, o mediciones de eficiencia.",
    dirs: ["bridge/", "native/", "third_party/", "experiments/"],
  },
  {
    id: "80",
    slug: "opcional-docs-datos",
    title: "OPCIONAL: datos de documentación",
    description:
      "docs/releases/ (JSON de contribuciones), docs/verification/ (evidencias) y docs/readme/ (README traducidos).",
    usage:
      "Solo si la tarea trata de releases, evidencias o README localizados.",
    optional: true,
    dirs: ["docs/releases/", "docs/verification/", "docs/readme/"],
  },
  {
    id: "81",
    slug: "opcional-licencias-lockfile-y-changelog",
    title: "OPCIONAL: licencias, lockfile y changelog",
    description:
      "licenses/ al completo, el package-lock.json íntegro y el CHANGELOG.md completo.",
    usage: "Solo para auditoría legal, de dependencias o de historial.",
    optional: true,
    dirs: ["licenses/"],
    files: ["CHANGELOG.md", "package-lock.json"],
  },
  {
    id: "90",
    slug: "opcional-traducciones-website",
    title: "OPCIONAL: traducciones del website",
    description:
      "Catálogos gettext (.po) de website/locales/ agrupados por idioma. messages.pot solo aparece listado porque Repomix considera binaria la extensión .pot.",
    usage: "Solo para trabajar la localización del sitio.",
    optional: true,
    dirs: ["website/locales/"],
  },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = new Set(process.argv.slice(2));
for (const argument of arguments_)
  if (argument !== "--plan")
    throw new Error(`Unknown repomix split option: ${argument}`);
const planOnly = arguments_.has("--plan");
if (process.platform === "win32" && !planOnly)
  throw new Error(
    "Run this generator under WSL or Git Bash: npx header quoting is POSIX-only here.",
  );

function gitBuffer(args) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
}
function gitText(args) {
  return gitBuffer(args).toString("utf8").trim();
}
function splitNull(text) {
  return text.split("\0").filter((entry) => entry.length > 0);
}
function posixDirname(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}
function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function formatMiB(bytes) {
  return `${(bytes / 1048576).toFixed(2).replace(".", ",")} MiB`;
}
function hasNulByte(path) {
  return readFileSync(join(root, path)).subarray(0, 8192).includes(0);
}
function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

function listProjectFiles() {
  const submodules = [];
  const tracked = [];
  for (const entry of splitNull(
    gitBuffer(["ls-files", "-s", "-z", "--cached"]).toString("utf8"),
  )) {
    const tab = entry.indexOf("\t");
    const mode = entry.slice(0, entry.indexOf(" "));
    const path = entry.slice(tab + 1);
    if (mode === "160000") submodules.push(path);
    else tracked.push(path);
  }
  const untracked = splitNull(
    gitBuffer(["ls-files", "-z", "--others", "--exclude-standard"]).toString(
      "utf8",
    ),
  );
  const trackedSet = new Set(tracked);
  const isOwnOutput = (path) =>
    path === SINGLE_OUTPUT || path.startsWith(`${OUTPUT_DIR}/`);
  const files = [...new Set([...tracked, ...untracked])]
    .filter((path) => !isOwnOutput(path))
    .filter((path) => {
      try {
        return statSync(join(root, path)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  const statusPorcelain = gitText(["status", "--porcelain"])
    .split("\n")
    .filter((line) => line.length > 0 && !isOwnOutput(line.slice(3)));
  return {
    files,
    submodules: submodules.sort(),
    untrackedIncluded: files.filter((path) => !trackedSet.has(path)),
    headCommit: gitText(["rev-parse", "HEAD"]),
    statusPorcelain,
  };
}

function accepts(pack, path) {
  if ((pack.excludeDirs ?? []).some((dir) => path.startsWith(dir)))
    return false;
  if ((pack.files ?? []).includes(path)) return true;
  if ((pack.dirs ?? []).some((dir) => path.startsWith(dir))) return true;
  if (
    (pack.looseDirs ?? []).some(
      (dir) => path.startsWith(dir) && !path.slice(dir.length).includes("/"),
    )
  )
    return true;
  if (
    pack.rootFilesExcept &&
    !path.includes("/") &&
    !pack.rootFilesExcept.includes(path)
  )
    return true;
  return false;
}

function assignFiles(files) {
  const byPack = new Map(PACKS.map((pack) => [pack, []]));
  const unassigned = [];
  for (const path of files) {
    const pack = PACKS.find((candidate) => accepts(candidate, path));
    if (pack) byPack.get(pack).push(path);
    else unassigned.push(path);
  }
  if (unassigned.length > 0) {
    const overflow = {
      id: "99",
      slug: "sin-clasificar",
      title: "Sin clasificar (revisar el generador)",
      description:
        "Archivos que ningún paquete reclamó; hay que asignarles destino en scripts/generate-repomix-split.mjs.",
      usage: "Revisar y reclasificar.",
      optional: true,
    };
    byPack.set(overflow, unassigned);
    console.error(
      `warning: ${unassigned.length} file(s) matched no pack and landed in 99-sin-clasificar`,
    );
  }
  return byPack;
}

// Splits one pack into chunks of at most CONTENT_LIMIT_BYTES of raw input,
// keeping same-directory files together whenever the directory itself fits.
function chunkPack(pack, files, sizeOf) {
  const units = [];
  const unitByDir = new Map();
  for (const path of files) {
    const dir = posixDirname(path);
    if (!unitByDir.has(dir)) {
      const unit = [];
      unitByDir.set(dir, unit);
      units.push(unit);
    }
    unitByDir.get(dir).push(path);
  }
  const chunks = [];
  let current = [];
  let currentBytes = 0;
  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = [];
    currentBytes = 0;
  };
  const addFile = (path) => {
    const size = sizeOf(path);
    if (size > CONTENT_LIMIT_BYTES)
      throw new Error(
        `${path} alone exceeds the per-chunk content limit; Repomix cannot split a file`,
      );
    if (currentBytes + size > CONTENT_LIMIT_BYTES) flush();
    current.push(path);
    currentBytes += size;
  };
  for (const unit of units) {
    const unitBytes = unit.reduce((sum, path) => sum + sizeOf(path), 0);
    if (unitBytes > CONTENT_LIMIT_BYTES) {
      for (const path of unit) addFile(path);
    } else {
      if (currentBytes + unitBytes > CONTENT_LIMIT_BYTES) flush();
      for (const path of unit) {
        current.push(path);
        currentBytes += sizeOf(path);
      }
    }
  }
  flush();
  return chunks.map((chunkFiles, index) => ({
    pack,
    fileName:
      chunks.length === 1
        ? `${pack.id}-${pack.slug}.xml`
        : `${pack.id}-${pack.slug}-${String.fromCharCode(97 + index)}.xml`,
    files: chunkFiles,
    contentBytes: chunkFiles.reduce((sum, path) => sum + sizeOf(path), 0),
  }));
}

function buildHeader(chunk, chunkIndex, allChunks) {
  const lines = [
    `REA (reverse-engineer-anything): repositorio completo dividido en ${allChunks.length} XML de Repomix por el límite de contexto (índice: ${OUTPUT_DIR}/README.md).`,
    `ESTA ES LA PARTE ${chunkIndex + 1} DE ${allChunks.length}: ${chunk.fileName} — ${chunk.pack.title}.`,
    `Contenido: ${chunk.pack.description} (${chunk.files.length} archivos)`,
    `Representación optimizada con ${REMOVAL_FLAGS.join(" ")}: los comentarios y las líneas vacías del código original no están en este archivo.`,
    "Los archivos binarios no se incrustan (solo aparecen en el árbol); el contenido de submódulos de third_party/ no forma parte de este repositorio.",
    "Mapa de partes:",
  ];
  allChunks.forEach((other, index) => {
    const marker = other === chunk ? "=> " : "   ";
    const optional = other.pack.optional ? " [opcional]" : "";
    lines.push(
      `${marker}${String(index + 1).padStart(2, "0")}. ${other.fileName} — ${other.pack.title}${optional}`,
    );
  });
  return lines.join("\n");
}

function runRepomix(chunk, chunkIndex, allChunks) {
  const outputPath = join(root, OUTPUT_DIR, chunk.fileName);
  const result = spawnSync(
    "npx",
    [
      "-y",
      `repomix@${REPOMIX_VERSION}`,
      "--stdin",
      "--style",
      "xml",
      ...REMOVAL_FLAGS,
      "--no-git-sort-by-changes",
      "--no-default-patterns",
      "--no-security-check",
      "--token-count-encoding",
      "o200k_base",
      "--header-text",
      buildHeader(chunk, chunkIndex, allChunks),
      "--output",
      outputPath,
    ],
    {
      cwd: root,
      input: `${chunk.files.join("\n")}\n`,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, TERM: "dumb" },
    },
  );
  // oxlint-disable-next-line no-control-regex -- strips ANSI escape codes from repomix output
  const ansiPattern = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replace(
    ansiPattern,
    "",
  );
  if (result.status !== 0)
    throw new Error(
      `repomix failed for ${chunk.fileName}:\n${log.slice(-4000)}`,
    );
  const parseCount = (label) => {
    const match = log.match(new RegExp(`${label}:\\s*([\\d,]+)`));
    if (!match)
      throw new Error(
        `Could not parse "${label}" from repomix output for ${chunk.fileName}`,
      );
    return Number(match[1].replaceAll(",", ""));
  };
  return {
    tokens: parseCount("Total Tokens"),
    chars: parseCount("Total Chars"),
  };
}

// Every input file must show up as a <file> entry, except the ones Repomix
// refuses as binary. Anything else missing is a hard error: the promise of
// these packs is that together they cover the whole repository.
function verifyChunk(chunk) {
  const data = readFileSync(join(root, OUTPUT_DIR, chunk.fileName), "utf8");
  // Repomix emits each entry tag alone on its own line. Anchoring to whole
  // lines keeps this check from matching file *contents* (this generator,
  // packed inside 12-scripts.xml, mentions the tag syntax itself).
  const occurrences = [...data.matchAll(/^<file path="([^"]+)">$/gm)].map(
    (match) => match[1],
  );
  const closings = [...data.matchAll(/^<\/file>$/gm)].length;
  const included = new Set(occurrences);
  if (closings !== occurrences.length)
    throw new Error(
      `${chunk.fileName}: ${occurrences.length} opening file tags but ${closings} closing tags on their own lines`,
    );
  if (included.size !== occurrences.length)
    throw new Error(
      `${chunk.fileName}: duplicate file entries; a source file may contain a line that is exactly a file-open tag`,
    );
  const inputs = new Set(chunk.files);
  const extra = [...included].filter((path) => !inputs.has(path));
  if (extra.length > 0)
    throw new Error(
      `${chunk.fileName}: unexpected <file> entries: ${extra.join(", ")}`,
    );
  const omittedAsBinary = [];
  for (const path of chunk.files) {
    if (included.has(path)) continue;
    if (BINARY_EXTENSIONS.has(extensionOf(path)) || hasNulByte(path))
      omittedAsBinary.push(path);
    else
      throw new Error(
        `${chunk.fileName}: ${path} is missing from the XML and is not explainable as binary`,
      );
  }
  return omittedAsBinary.sort();
}

function renderReadme(manifest) {
  const rows = (chunks) =>
    chunks
      .map(
        (chunk) =>
          `| \`${chunk.file}\` | **${chunk.title}**. ${chunk.usage} | ${chunk.fileCount} | ${formatMiB(chunk.xmlBytes)} | ${formatNumber(chunk.tokens)} |`,
      )
      .join("\n");
  const core = manifest.chunks.filter((chunk) => !chunk.optional);
  const optional = manifest.chunks.filter((chunk) => chunk.optional);
  const omitted = manifest.chunks.flatMap((chunk) => chunk.omittedAsBinary);
  const lines = [
    "# Repomix dividido: el repositorio completo en XML de como máximo 4 MiB",
    "",
    "El repositorio entero suma unos 50 MiB y más de 12 millones de tokens: no cabe en una sola ventana de contexto ni siquiera con la configuración optimizada de Repomix (`--remove-comments --remove-empty-lines`), que en este repo ahorra muy poco —medido en igualdad de condiciones: de 12.577.181 a 12.350.901 tokens (−1,8 %) y un 2,3 % de tamaño— porque el volumen está en traducciones, JSON y documentación, no en comentarios. Por eso el proyecto está partido en paquetes XML lógicos que juntos cubren **todos** los archivos de texto versionados.",
    "",
    `Generados el ${manifest.generatedAt} desde el commit \`${manifest.headCommit}\` con \`repomix@${manifest.repomixVersion}\` y las banderas \`${manifest.flags.join(" ")}\`. Los conteos de tokens usan la codificación \`o200k_base\` de Repomix. Detalle legible por máquina, incluidos SHA-256 y la lista exacta de archivos de cada parte, en \`MANIFEST.json\`.`,
    "",
    "> Representación con pérdida deliberada: `--remove-comments --remove-empty-lines` elimina comentarios y líneas vacías del código. Si una tarea necesita los comentarios originales (licencias en cabeceras, explicaciones, `TODO`), hay que regenerar quitando esas dos banderas de `REMOVAL_FLAGS` en el generador; cuesta solo ~2 % más de tokens.",
    "",
    "## Cómo usarlos",
    "",
    "1. Carga primero `00-raiz-configuracion-y-ci.xml`: trae README, AGENTS, package.json y las reglas del proyecto.",
    "2. Añade solo las partes de la zona en la que vayas a trabajar (dominio, aplicación, proveedores, tests...). Cada XML lleva en su cabecera el mapa completo de partes, así que el modelo sabe qué existe aunque no lo tenga cargado.",
    "3. Las partes `80`, `81` y `90-*` son opcionales y voluminosas; omítelas salvo que la tarea trate exactamente de licencias, releases o traducciones.",
    "",
    "## Partes principales",
    "",
    "| Archivo | Contenido y cuándo cargarlo | Archivos | Tamaño | Tokens |",
    "| --- | --- | ---: | ---: | ---: |",
    rows(core),
    "",
    "## Partes opcionales (contenido voluminoso aislado)",
    "",
    "| Archivo | Contenido y cuándo cargarlo | Archivos | Tamaño | Tokens |",
    "| --- | --- | ---: | ---: | ---: |",
    rows(optional),
    "",
    `**Total: ${manifest.chunks.length} XML, ${formatNumber(manifest.totals.files)} archivos de entrada, ${formatMiB(manifest.totals.xmlBytes)} de XML y ${formatNumber(manifest.totals.tokens)} tokens.**`,
    "",
    "## Cobertura: qué queda fuera y por qué",
    "",
    `- Contenido no incrustado por ser binario (sí aparece en el árbol de directorios de su XML): ${omitted.map((path) => `\`${path}\``).join(", ")}. Ojo: \`messages.pot\` es texto gettext, pero Repomix clasifica la extensión \`.pot\` como binaria (plantilla de PowerPoint) y no ofrece opción para forzarlo; sus \`msgid\` son los mismos que ya traen los \`.po\`.`,
    `- Submódulos externos sin contenido en este repositorio (solo gitlinks, declarados en \`.gitmodules\`, parte 00): ${manifest.submodules.map((path) => `\`${path}\``).join(", ")}.`,
    `- \`${OUTPUT_DIR}/\` y \`${SINGLE_OUTPUT}\` se autoexcluyen: empaquetarlos dentro de sí mismos crecería en cada regeneración. \`node_modules\`, \`dist\` y demás salidas ignoradas por git tampoco son código fuente del repo.`,
    "- El chequeo de «secretos» de Repomix está desactivado en estas partes: la entrada son solo archivos ya publicados en este repositorio y el escáner únicamente detecta las credenciales sintéticas (`example.test`) que los fixtures usan para probar la redacción; con el chequeo activo, 10 archivos legítimos desaparecerían en silencio. No reutilices esta configuración sobre código privado sin revisar.",
    `- El \`package-lock.json\` sí está incluido (parte 81) gracias a \`--no-default-patterns\` sobre la lista explícita de archivos; una corrida normal de Repomix lo excluiría por patrón.`,
    "",
    "## El archivo único de la raíz",
    "",
    `\`${SINGLE_OUTPUT}\` (en la raíz, no versionado) se generó con el comando optimizado tal cual:`,
    "",
    "```bash",
    "npx repomix --style xml --remove-comments --remove-empty-lines",
    "```",
    "",
    'Sirve como artefacto único si tu herramienta admite archivos de ese tamaño, pero ten en cuenta que (a) supera los 12 millones de tokens, (b) excluye en silencio el lockfile, `messages.pot`, los binarios y los 10 archivos que el chequeo de secretos marca, y (c) si lo vuelves a correr con esta carpeta presente, incluiría también estos XML partidos salvo que añadas `--ignore "repomix-output/**"`.',
    "",
    "## Regenerar",
    "",
    "```bash",
    "npm run repomix:split        # o: node scripts/generate-repomix-split.mjs",
    "npm run repomix:plan         # solo imprime el plan de partición, sin generar",
    "```",
    "",
    "El generador parte de `git ls-files` (versionados más no ignorados), verifica que la unión de partes cubre cada archivo y que ningún XML supera los 4 MiB, y reescribe esta carpeta. Estos XML son artefactos generados: si el código cambia, regenera en lugar de editarlos. `.gitattributes` los marca como `-text` para que git no normalice los finales de línea del contenido incrustado (hay fixtures `.cmd` con CRLF) y los SHA-256 del manifiesto sigan coincidiendo tras clonar.",
    "",
  ];
  return lines.join("\n");
}

const project = listProjectFiles();
const sizeByPath = new Map(
  project.files.map((path) => [path, statSync(join(root, path)).size]),
);
const sizeOf = (path) => sizeByPath.get(path);
const byPack = assignFiles(project.files);
const chunks = [...byPack.entries()].flatMap(([pack, files]) =>
  chunkPack(pack, files, sizeOf),
);

console.log(
  `Project files: ${project.files.length} (${project.untrackedIncluded.length} untracked, non-ignored)`,
);
console.log(
  `Submodules without content in this repo: ${project.submodules.join(", ") || "none"}`,
);
for (const chunk of chunks)
  console.log(
    `${chunk.fileName.padEnd(52)} ${String(chunk.files.length).padStart(4)} files  ${formatMiB(chunk.contentBytes)} raw`,
  );
console.log(`Total: ${chunks.length} chunk(s)`);
if (planOnly) process.exit(0);

mkdirSync(join(root, OUTPUT_DIR), { recursive: true });
for (const entry of readdirSync(join(root, OUTPUT_DIR)))
  if (
    /^\d{2}-.*\.xml$/.test(entry) ||
    entry === "README.md" ||
    entry === "MANIFEST.json"
  )
    rmSync(join(root, OUTPUT_DIR, entry));

const manifestChunks = [];
chunks.forEach((chunk, chunkIndex) => {
  const { tokens, chars } = runRepomix(chunk, chunkIndex, chunks);
  const xmlBytes = statSync(join(root, OUTPUT_DIR, chunk.fileName)).size;
  if (xmlBytes > MAX_OUTPUT_BYTES)
    throw new Error(
      `${chunk.fileName} is ${xmlBytes} bytes, over the ${MAX_OUTPUT_BYTES}-byte cap; lower CONTENT_LIMIT_BYTES`,
    );
  const omittedAsBinary = verifyChunk(chunk);
  const sha256 = createHash("sha256")
    .update(readFileSync(join(root, OUTPUT_DIR, chunk.fileName)))
    .digest("hex");
  manifestChunks.push({
    file: chunk.fileName,
    pack: `${chunk.pack.id}-${chunk.pack.slug}`,
    title: chunk.pack.title,
    description: chunk.pack.description,
    usage: chunk.pack.usage,
    optional: Boolean(chunk.pack.optional),
    fileCount: chunk.files.length,
    contentBytes: chunk.contentBytes,
    xmlBytes,
    chars,
    tokens,
    sha256,
    omittedAsBinary,
    files: chunk.files,
  });
  console.log(
    `packed ${chunk.fileName}: ${formatMiB(xmlBytes)}, ${formatNumber(tokens)} tokens` +
      (omittedAsBinary.length > 0
        ? `, listed-only (binary): ${omittedAsBinary.join(", ")}`
        : ""),
  );
});

const manifest = {
  generatedAt: new Date().toISOString(),
  headCommit: project.headCommit,
  workingTreeStatusAtGeneration: project.statusPorcelain,
  untrackedFilesIncluded: project.untrackedIncluded,
  repomixVersion: REPOMIX_VERSION,
  flags: [
    "--style",
    "xml",
    ...REMOVAL_FLAGS,
    "--no-git-sort-by-changes",
    "--no-default-patterns",
    "--no-security-check",
    "--token-count-encoding",
    "o200k_base",
  ],
  maxOutputBytes: MAX_OUTPUT_BYTES,
  contentLimitBytes: CONTENT_LIMIT_BYTES,
  submodules: project.submodules,
  excludedByDesign: [SINGLE_OUTPUT, `${OUTPUT_DIR}/`],
  totals: {
    chunks: manifestChunks.length,
    files: manifestChunks.reduce((sum, chunk) => sum + chunk.fileCount, 0),
    contentBytes: manifestChunks.reduce(
      (sum, chunk) => sum + chunk.contentBytes,
      0,
    ),
    xmlBytes: manifestChunks.reduce((sum, chunk) => sum + chunk.xmlBytes, 0),
    tokens: manifestChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
  },
  chunks: manifestChunks,
};
if (manifest.totals.files !== project.files.length)
  throw new Error(
    "internal error: chunk file total does not match the project file list",
  );
writeFileSync(
  join(root, OUTPUT_DIR, "MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(join(root, OUTPUT_DIR, "README.md"), renderReadme(manifest));
console.log(
  `Done: ${manifest.totals.chunks} XML file(s), ${formatMiB(manifest.totals.xmlBytes)} total, ${formatNumber(manifest.totals.tokens)} tokens in ${OUTPUT_DIR}/`,
);
